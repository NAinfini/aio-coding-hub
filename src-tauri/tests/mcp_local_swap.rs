mod support;

use serde_json::Value;

fn write_claude_json(app: &tauri::AppHandle<tauri::test::MockRuntime>, value: &Value) {
    let mut bytes = serde_json::to_vec_pretty(value).expect("serialize json");
    bytes.push(b'\n');
    aio_coding_hub_lib::test_support::mcp_restore_target_bytes(app, "claude", Some(bytes))
        .expect("write claude json");
}

fn read_claude_json(app: &tauri::AppHandle<tauri::test::MockRuntime>) -> Value {
    let bytes = aio_coding_hub_lib::test_support::mcp_read_target_bytes(app, "claude")
        .expect("read claude json")
        .expect("claude json exists");
    serde_json::from_slice::<Value>(&bytes).expect("parse json")
}

#[test]
fn local_mcp_servers_are_stashed_and_restored_per_workspace() {
    let app = support::TestApp::new();
    let handle = app.handle();

    // Workspace 1 has a local (unmanaged) server in mcpServers.
    write_claude_json(
        &handle,
        &serde_json::json!({
          "mcpServers": {
            "exa": { "type": "stdio", "command": "npx" },
            "localA": { "type": "http", "url": "http://localhost:1234" }
          },
          "other": 1
        }),
    );

    aio_coding_hub_lib::test_support::mcp_swap_local_for_workspace_switch(
        &handle,
        "claude",
        vec!["exa".to_string()],
        Some(1),
        2,
    )
    .expect("swap local mcp 1 -> 2");

    // After switching to workspace 2, local servers should be cleared (stash empty),
    // but managed servers and other config remain.
    let json = read_claude_json(&handle);
    assert_eq!(json["other"], 1);
    let servers = json["mcpServers"].as_object().expect("mcpServers object");
    assert!(servers.contains_key("exa"));
    assert!(!servers.contains_key("localA"));

    // Simulate user adding a different local server while on workspace 2.
    write_claude_json(
        &handle,
        &serde_json::json!({
          "mcpServers": {
            "exa": { "type": "stdio", "command": "npx" },
            "localB": { "type": "http", "url": "http://localhost:5678" }
          },
          "other": 1
        }),
    );

    aio_coding_hub_lib::test_support::mcp_swap_local_for_workspace_switch(
        &handle,
        "claude",
        vec!["exa".to_string()],
        Some(2),
        1,
    )
    .expect("swap local mcp 2 -> 1");

    let json = read_claude_json(&handle);
    let servers = json["mcpServers"].as_object().expect("mcpServers object");
    assert!(servers.contains_key("exa"));
    assert!(servers.contains_key("localA"));
    assert!(!servers.contains_key("localB"));

    aio_coding_hub_lib::test_support::mcp_swap_local_for_workspace_switch(
        &handle,
        "claude",
        vec!["exa".to_string()],
        Some(1),
        2,
    )
    .expect("swap local mcp 1 -> 2 (restore B)");

    let json = read_claude_json(&handle);
    let servers = json["mcpServers"].as_object().expect("mcpServers object");
    assert!(servers.contains_key("exa"));
    assert!(!servers.contains_key("localA"));
    assert!(servers.contains_key("localB"));
}
