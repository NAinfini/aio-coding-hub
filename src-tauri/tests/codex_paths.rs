mod support;

#[test]
fn codex_paths_respects_codex_home_env() {
    let app = support::TestApp::new();
    let handle = app.handle();

    let path =
        aio_coding_hub_lib::test_support::codex_config_toml_path(&handle).expect("default path");
    assert_eq!(
        path,
        app.home_dir().join(".codex").join("config.toml"),
        "CODEX_HOME unset should default to ~/.codex/config.toml"
    );

    std::env::set_var("CODEX_HOME", "codex-home");
    let path = aio_coding_hub_lib::test_support::codex_config_toml_path(&handle)
        .expect("relative CODEX_HOME");
    assert_eq!(path, app.home_dir().join("codex-home").join("config.toml"));

    std::env::set_var("CODEX_HOME", "~/.codex-alt");
    let path =
        aio_coding_hub_lib::test_support::codex_config_toml_path(&handle).expect("tilde expand");
    assert_eq!(path, app.home_dir().join(".codex-alt").join("config.toml"));

    let abs_dir = app.home_dir().join("abs-codex");
    std::env::set_var("CODEX_HOME", abs_dir.as_os_str());
    let path =
        aio_coding_hub_lib::test_support::codex_config_toml_path(&handle).expect("absolute path");
    assert_eq!(path, abs_dir.join("config.toml"));
}
