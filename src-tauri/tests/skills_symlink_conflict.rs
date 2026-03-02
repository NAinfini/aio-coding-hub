mod support;

use rusqlite::params;
use support::{json_bool, json_i64};

#[cfg(unix)]
fn symlink_dir(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(src, dst)
}

#[cfg(windows)]
fn symlink_dir(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_dir(src, dst)
}

#[test]
fn skills_enable_and_uninstall_do_not_conflict_with_unmanaged_symlink_dir() {
    let app = support::TestApp::new();
    let handle = app.handle();

    aio_coding_hub_lib::test_support::init_db(&handle).expect("init db");

    let created = aio_coding_hub_lib::test_support::workspace_create_json(
        &handle,
        "codex",
        "Codex Link Workspace",
        false,
    )
    .expect("create workspace");
    let workspace_id = json_i64(&created, "id");
    assert!(workspace_id > 0);

    let db_path = aio_coding_hub_lib::test_support::db_path(&handle).expect("db path");
    let conn = rusqlite::Connection::open(&db_path).expect("open db");
    conn.execute(
        r#"
INSERT INTO workspace_active(cli_key, workspace_id, updated_at)
VALUES ('codex', ?1, ?2)
ON CONFLICT(cli_key) DO UPDATE SET
  workspace_id = excluded.workspace_id,
  updated_at = excluded.updated_at
"#,
        params![workspace_id, 1_i64],
    )
    .expect("set active workspace");

    let skill_key = "context7";
    conn.execute(
        r#"
INSERT INTO skills(
  skill_key,
  name,
  normalized_name,
  description,
  source_git_url,
  source_branch,
  source_subdir,
  created_at,
  updated_at
) VALUES (?1, ?2, ?3, '', ?4, 'main', ?5, 1, 1)
"#,
        params![
            skill_key,
            "Context7",
            "context7",
            "https://example.com/repo.git",
            "skills/context7"
        ],
    )
    .expect("insert skill");
    let skill_id = conn.last_insert_rowid();
    assert!(skill_id > 0);

    let app_data_dir =
        aio_coding_hub_lib::test_support::app_data_dir(&handle).expect("app_data_dir");
    let ssot_skill_dir = app_data_dir.join("skills").join(skill_key);
    std::fs::create_dir_all(&ssot_skill_dir).expect("create ssot dir");
    std::fs::write(ssot_skill_dir.join("SKILL.md"), "name: Context7\n").expect("write ssot skill");

    let codex_skills_root = app.home_dir().join(".codex").join("skills");
    std::fs::create_dir_all(&codex_skills_root).expect("create codex skills root");

    let external_link_src = app.home_dir().join(".external-links").join(skill_key);
    std::fs::create_dir_all(&external_link_src).expect("create external link src");
    std::fs::write(
        external_link_src.join("SKILL.md"),
        "name: Context7 External\n",
    )
    .expect("write external skill");

    let linked_skill_dir = codex_skills_root.join(skill_key);
    symlink_dir(&external_link_src, &linked_skill_dir).expect("create unmanaged symlink dir");
    assert!(
        std::fs::symlink_metadata(&linked_skill_dir)
            .expect("symlink metadata")
            .file_type()
            .is_symlink(),
        "expected codex skills entry to be symlink"
    );
    assert!(
        !linked_skill_dir.join(".aio-coding-hub.managed").exists(),
        "symlink dir should be unmanaged"
    );

    let enabled = aio_coding_hub_lib::test_support::skill_set_enabled_json(
        &handle,
        workspace_id,
        skill_id,
        true,
    )
    .expect("enable skill with unmanaged symlink present");
    assert!(
        json_bool(&enabled, "enabled"),
        "skill should be enabled even when unmanaged symlink exists"
    );

    assert!(
        std::fs::symlink_metadata(&linked_skill_dir)
            .expect("symlink metadata after enable")
            .file_type()
            .is_symlink(),
        "unmanaged symlink should stay untouched after enable"
    );

    aio_coding_hub_lib::test_support::skill_uninstall(&handle, skill_id)
        .expect("uninstall should not be blocked by unmanaged symlink");

    let remaining: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM skills WHERE id = ?1",
            params![skill_id],
            |row| row.get(0),
        )
        .expect("count skills");
    assert_eq!(remaining, 0, "skill row should be deleted");

    assert!(
        std::fs::symlink_metadata(&linked_skill_dir)
            .expect("symlink metadata after uninstall")
            .file_type()
            .is_symlink(),
        "unmanaged symlink should remain after uninstall"
    );
}
