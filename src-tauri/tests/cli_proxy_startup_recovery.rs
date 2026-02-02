mod support;

use serde_json::Value;

fn json_bool(value: &Value, key: &str) -> bool {
    value.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

fn json_str(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

#[test]
fn cli_proxy_startup_repair_fixes_incomplete_enable_manifest() {
    let app = support::TestApp::new();
    let handle = app.handle();

    let base_origin = "http://127.0.0.1:37123";

    // Normal enable path writes live CLI config and marks manifest.enabled=true.
    let _ = aio_coding_hub_lib::test_support::cli_proxy_set_enabled_json(
        &handle,
        "codex",
        true,
        base_origin,
    )
    .expect("enable codex cli proxy");

    // Simulate a crash window where live config has been applied but manifest.enabled remained false.
    let app_data_dir = aio_coding_hub_lib::test_support::app_data_dir(&handle).expect("app_data");
    let manifest_path = app_data_dir
        .join("cli-proxy")
        .join("codex")
        .join("manifest.json");

    let mut manifest: Value = serde_json::from_slice(
        &std::fs::read(&manifest_path).expect("read manifest before corruption"),
    )
    .expect("parse manifest before corruption");
    manifest["enabled"] = Value::Bool(false);
    let bytes = serde_json::to_vec_pretty(&manifest).expect("serialize manifest corruption");
    std::fs::write(&manifest_path, bytes).expect("write corrupted manifest");

    let repaired: Value =
        aio_coding_hub_lib::test_support::cli_proxy_startup_repair_incomplete_enable_json(&handle)
            .expect("run startup repair");

    let repaired_list = repaired.as_array().cloned().unwrap_or_default();
    assert!(
        repaired_list.iter().any(|item| {
            json_str(item, "cli_key") == "codex"
                && json_bool(item, "ok")
                && json_bool(item, "enabled")
        }),
        "expected codex to be repaired"
    );

    let manifest_after: Value =
        serde_json::from_slice(&std::fs::read(&manifest_path).expect("read manifest after repair"))
            .expect("parse manifest after repair");
    assert!(json_bool(&manifest_after, "enabled"));
}
