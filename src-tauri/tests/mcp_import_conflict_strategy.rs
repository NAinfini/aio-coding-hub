mod support;

use serde_json::Value;

fn json_array(value: Value) -> Vec<Value> {
    value.as_array().cloned().unwrap_or_default()
}

fn json_str(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

fn json_bool(value: &Value, key: &str) -> bool {
    value.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

fn json_u32(value: &Value, key: &str) -> u32 {
    value.get(key).and_then(|v| v.as_u64()).unwrap_or_default() as u32
}

#[test]
fn mcp_import_conflict_keeps_existing_config_and_merges_enabled_only() {
    let app = support::TestApp::new();
    let handle = app.handle();

    let initial = aio_coding_hub_lib::test_support::mcp_import_servers_json(
        &handle,
        1,
        serde_json::json!([
          {
            "server_key": "fetch",
            "name": "Fetch",
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-fetch"],
            "env": {"FOO":"bar"},
            "cwd": "/tmp/a",
            "url": null,
            "headers": {},
            "enabled": false
          }
        ]),
    )
    .expect("import initial server");
    assert_eq!(json_u32(&initial, "inserted"), 1);
    assert_eq!(json_u32(&initial, "updated"), 0);

    let report_enable_merge = aio_coding_hub_lib::test_support::mcp_import_servers_json(
        &handle,
        1,
        serde_json::json!([
          {
            "server_key": "fetch-conflict",
            "name": "Fetch",
            "transport": "http",
            "command": null,
            "args": [],
            "env": {},
            "cwd": null,
            "url": "https://conflict.example.com/mcp",
            "headers": {"Authorization":"Bearer x"},
            "enabled": true
          }
        ]),
    )
    .expect("import conflict server with enabled=true");

    assert_eq!(json_u32(&report_enable_merge, "inserted"), 0);
    assert_eq!(json_u32(&report_enable_merge, "updated"), 1);
    assert_eq!(
        json_array(
            report_enable_merge
                .get("skipped")
                .cloned()
                .unwrap_or(Value::Null)
        )
        .len(),
        0
    );

    let report_skip = aio_coding_hub_lib::test_support::mcp_import_servers_json(
        &handle,
        1,
        serde_json::json!([
          {
            "server_key": "fetch-again",
            "name": "Fetch",
            "transport": "stdio",
            "command": "node",
            "args": ["server.js"],
            "env": {},
            "cwd": null,
            "url": null,
            "headers": {},
            "enabled": false
          }
        ]),
    )
    .expect("import conflict server with enabled=false");

    assert_eq!(json_u32(&report_skip, "inserted"), 0);
    assert_eq!(json_u32(&report_skip, "updated"), 0);

    let skipped = json_array(report_skip.get("skipped").cloned().unwrap_or(Value::Null));
    assert_eq!(skipped.len(), 1);
    assert_eq!(json_str(&skipped[0], "name"), "Fetch");
    assert!(
        json_str(&skipped[0], "reason").contains("kept existing config"),
        "unexpected skip reason: {}",
        json_str(&skipped[0], "reason")
    );

    let rows = aio_coding_hub_lib::test_support::mcp_servers_list_json(&handle, 1)
        .expect("list workspace mcp servers");
    let rows = json_array(rows);
    assert_eq!(rows.len(), 1);

    let fetch = &rows[0];
    assert_eq!(json_str(fetch, "name"), "Fetch");
    assert_eq!(json_str(fetch, "transport"), "stdio");
    assert_eq!(json_str(fetch, "command"), "npx");
    assert_eq!(json_str(fetch, "cwd"), "/tmp/a");
    assert!(json_bool(fetch, "enabled"));
}
