mod support;

use support::{json_array, json_i64, json_str};

#[test]
fn sort_modes_list_initial_empty() {
    let app = support::TestApp::new();
    let handle = app.handle();

    aio_coding_hub_lib::test_support::init_db(&handle).expect("init db");

    let modes =
        aio_coding_hub_lib::test_support::sort_modes_list_json(&handle).expect("list sort modes");
    let modes = json_array(modes);
    // Fresh DB should have no custom sort modes.
    assert_eq!(modes.len(), 0);
}

#[test]
fn sort_mode_create_and_list() {
    let app = support::TestApp::new();
    let handle = app.handle();

    aio_coding_hub_lib::test_support::init_db(&handle).expect("init db");

    let created = aio_coding_hub_lib::test_support::sort_mode_create_json(&handle, "Priority Mode")
        .expect("create sort mode");

    let mode_id = json_i64(&created, "id");
    assert!(mode_id > 0, "mode id should be positive");
    assert_eq!(json_str(&created, "name"), "Priority Mode");
    assert!(json_i64(&created, "created_at") > 0);
    assert!(json_i64(&created, "updated_at") > 0);

    // Verify it appears in the list.
    let modes =
        aio_coding_hub_lib::test_support::sort_modes_list_json(&handle).expect("list after create");
    let modes = json_array(modes);
    assert_eq!(modes.len(), 1);
    assert_eq!(json_i64(&modes[0], "id"), mode_id);
    assert_eq!(json_str(&modes[0], "name"), "Priority Mode");
}

#[test]
fn sort_mode_rename() {
    let app = support::TestApp::new();
    let handle = app.handle();

    aio_coding_hub_lib::test_support::init_db(&handle).expect("init db");

    let created = aio_coding_hub_lib::test_support::sort_mode_create_json(&handle, "Old Name")
        .expect("create sort mode");
    let mode_id = json_i64(&created, "id");

    let renamed =
        aio_coding_hub_lib::test_support::sort_mode_rename_json(&handle, mode_id, "New Name")
            .expect("rename sort mode");

    assert_eq!(json_i64(&renamed, "id"), mode_id);
    assert_eq!(json_str(&renamed, "name"), "New Name");
}

#[test]
fn sort_mode_set_active() {
    let app = support::TestApp::new();
    let handle = app.handle();

    aio_coding_hub_lib::test_support::init_db(&handle).expect("init db");

    let created = aio_coding_hub_lib::test_support::sort_mode_create_json(&handle, "Active Mode")
        .expect("create sort mode");
    let mode_id = json_i64(&created, "id");

    let active = aio_coding_hub_lib::test_support::sort_mode_active_set_json(
        &handle,
        "claude",
        Some(mode_id),
    )
    .expect("set active sort mode");

    assert_eq!(json_str(&active, "cli_key"), "claude");
    assert_eq!(json_i64(&active, "mode_id"), mode_id);
    assert!(json_i64(&active, "updated_at") > 0);

    // Clear active (set to None / null).
    let cleared =
        aio_coding_hub_lib::test_support::sort_mode_active_set_json(&handle, "claude", None)
            .expect("clear active sort mode");

    assert_eq!(json_str(&cleared, "cli_key"), "claude");
    assert!(
        cleared.get("mode_id").is_none_or(|v| v.is_null()),
        "mode_id should be null after clearing"
    );
}

#[test]
fn sort_mode_delete() {
    let app = support::TestApp::new();
    let handle = app.handle();

    aio_coding_hub_lib::test_support::init_db(&handle).expect("init db");

    let created = aio_coding_hub_lib::test_support::sort_mode_create_json(&handle, "To Delete")
        .expect("create sort mode");
    let mode_id = json_i64(&created, "id");

    assert!(
        aio_coding_hub_lib::test_support::sort_mode_delete(&handle, mode_id)
            .expect("delete sort mode")
    );

    // Verify it's gone.
    let modes =
        aio_coding_hub_lib::test_support::sort_modes_list_json(&handle).expect("list after delete");
    let modes = json_array(modes);
    assert!(
        !modes.iter().any(|m| json_i64(m, "id") == mode_id),
        "deleted sort mode should not appear in list"
    );
}

#[test]
fn sort_mode_create_duplicate_name_fails() {
    let app = support::TestApp::new();
    let handle = app.handle();

    aio_coding_hub_lib::test_support::init_db(&handle).expect("init db");

    aio_coding_hub_lib::test_support::sort_mode_create_json(&handle, "Unique Name")
        .expect("create first");

    let err = aio_coding_hub_lib::test_support::sort_mode_create_json(&handle, "Unique Name")
        .expect_err("duplicate name should fail");
    let err = err.to_string();
    assert!(
        err.contains("already exists") || err.contains("CONSTRAINT"),
        "unexpected error: {err}"
    );
}

#[test]
fn sort_mode_delete_nonexistent_fails() {
    let app = support::TestApp::new();
    let handle = app.handle();

    aio_coding_hub_lib::test_support::init_db(&handle).expect("init db");

    let err = aio_coding_hub_lib::test_support::sort_mode_delete(&handle, 99999)
        .expect_err("delete non-existent should fail");
    let err = err.to_string();
    assert!(err.contains("not found"), "unexpected error: {err}");
}
