mod support;

#[test]
fn codex_config_toml_raw_set_refuses_invalid_input_without_writing() {
    let app = support::TestApp::new();
    let handle = app.handle();

    let path =
        aio_coding_hub_lib::test_support::codex_config_toml_path(&handle).expect("codex path");

    assert!(!path.exists(), "precondition: config.toml should not exist");

    let _ = aio_coding_hub_lib::test_support::codex_config_toml_raw_set(
        &handle,
        "approval_policy =".to_string(),
    )
    .expect_err("invalid TOML should fail");

    assert!(
        !path.exists(),
        "invalid TOML should not create/modify config.toml"
    );

    std::fs::create_dir_all(path.parent().expect("parent")).expect("create codex dir");
    std::fs::write(&path, "approval_policy = \"on-request\"\n").expect("write initial");

    let _ = aio_coding_hub_lib::test_support::codex_config_toml_raw_set(
        &handle,
        "approval_policy = \"nope\"\n".to_string(),
    )
    .expect_err("invalid enum should fail");

    let got = std::fs::read_to_string(&path).expect("read after failed write");
    assert_eq!(got, "approval_policy = \"on-request\"\n");
}
