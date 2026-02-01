mod support;

#[test]
fn mcp_sync_can_restore_and_remove_targets() {
    let app = support::TestApp::new();
    let handle = app.handle();

    // cc-switch: Claude MCP uses ~/.claude.json
    assert_eq!(
        aio_coding_hub_lib::test_support::mcp_read_target_bytes(&handle, "claude")
            .expect("read claude target"),
        None
    );

    let claude_bytes = br#"{"mcpServers":{}}"#.to_vec();
    aio_coding_hub_lib::test_support::mcp_restore_target_bytes(
        &handle,
        "claude",
        Some(claude_bytes.clone()),
    )
    .expect("restore claude target");
    assert_eq!(
        aio_coding_hub_lib::test_support::mcp_read_target_bytes(&handle, "claude")
            .expect("read claude target"),
        Some(claude_bytes)
    );
    assert!(app.home_dir().join(".claude.json").exists());

    aio_coding_hub_lib::test_support::mcp_restore_target_bytes(&handle, "claude", None)
        .expect("remove claude target");
    assert_eq!(
        aio_coding_hub_lib::test_support::mcp_read_target_bytes(&handle, "claude")
            .expect("read claude target"),
        None
    );

    // cc-switch: Codex MCP uses $CODEX_HOME/config.toml (default: ~/.codex/config.toml)
    let codex_path =
        aio_coding_hub_lib::test_support::codex_config_toml_path(&handle).expect("codex path");
    assert!(
        codex_path.starts_with(app.home_dir()),
        "codex_path={codex_path:?}"
    );

    assert_eq!(
        aio_coding_hub_lib::test_support::mcp_read_target_bytes(&handle, "codex")
            .expect("read codex target"),
        None
    );

    let codex_bytes = b"[mcp]\n".to_vec();
    aio_coding_hub_lib::test_support::mcp_restore_target_bytes(
        &handle,
        "codex",
        Some(codex_bytes.clone()),
    )
    .expect("restore codex target");
    assert_eq!(
        aio_coding_hub_lib::test_support::mcp_read_target_bytes(&handle, "codex")
            .expect("read codex target"),
        Some(codex_bytes)
    );
    assert!(codex_path.exists());

    aio_coding_hub_lib::test_support::mcp_restore_target_bytes(&handle, "codex", None)
        .expect("remove codex target");
    assert!(!codex_path.exists());
}
