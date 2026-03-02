mod support;

use rusqlite::params;
use support::{json_bool, SkillTestFixture};

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

    let fix = SkillTestFixture::new(&app, &handle, "codex", "Codex Link Workspace");

    std::fs::create_dir_all(&fix.cli_skills_root).expect("create codex skills root");

    let external_link_src = app.home_dir().join(".external-links").join(&fix.skill_key);
    std::fs::create_dir_all(&external_link_src).expect("create external link src");
    std::fs::write(
        external_link_src.join("SKILL.md"),
        "name: Context7 External\n",
    )
    .expect("write external skill");

    let linked_skill_dir = fix.cli_skills_root.join(&fix.skill_key);
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
        fix.workspace_id,
        fix.skill_id,
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

    aio_coding_hub_lib::test_support::skill_uninstall(&handle, fix.skill_id)
        .expect("uninstall should not be blocked by unmanaged symlink");

    let remaining: i64 = fix
        .conn
        .query_row(
            "SELECT COUNT(1) FROM skills WHERE id = ?1",
            params![fix.skill_id],
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
