mod support;

use rusqlite::params;
use support::json_i64;

#[test]
fn return_to_local_moves_skill_out_of_managed_registry_and_keeps_local_dir() {
    let app = support::TestApp::new();
    let handle = app.handle();

    aio_coding_hub_lib::test_support::init_db(&handle).expect("init db");

    let created =
        aio_coding_hub_lib::test_support::workspace_create_json(&handle, "codex", "Codex W", false)
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
    let managed_local_dir = codex_skills_root.join(skill_key);
    std::fs::create_dir_all(&managed_local_dir).expect("create managed local dir");
    std::fs::write(
        managed_local_dir.join(".aio-coding-hub.managed"),
        "aio-coding-hub\n",
    )
    .expect("write managed marker");
    std::fs::write(
        managed_local_dir.join("SKILL.md"),
        "name: Context7 managed\n",
    )
    .expect("write managed skill");

    let ok =
        aio_coding_hub_lib::test_support::skill_return_to_local(&handle, workspace_id, skill_id)
            .expect("return to local");
    assert!(ok, "skill return_to_local should succeed");

    assert!(
        managed_local_dir.exists(),
        "local skill dir should remain after returning"
    );
    assert!(
        managed_local_dir.join("SKILL.md").exists(),
        "local skill dir should contain SKILL.md"
    );
    assert!(
        !managed_local_dir.join(".aio-coding-hub.managed").exists(),
        "returned local skill should be unmanaged"
    );

    assert!(
        !ssot_skill_dir.exists(),
        "ssot skill dir should be deleted after return_to_local"
    );

    let remaining: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM skills WHERE id = ?1",
            params![skill_id],
            |row| row.get(0),
        )
        .expect("count skills");
    assert_eq!(remaining, 0, "skill row should be deleted");
}
