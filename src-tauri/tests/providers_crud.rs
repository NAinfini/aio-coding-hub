mod support;

use serde_json::Value;

fn json_array(value: Value) -> Vec<Value> {
    value.as_array().cloned().unwrap_or_default()
}

fn json_i64(value: &Value, key: &str) -> i64 {
    value.get(key).and_then(|v| v.as_i64()).unwrap_or_default()
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

fn json_f64(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(|v| v.as_f64())
}

#[test]
fn providers_crud_roundtrip() {
    let app = support::TestApp::new();
    let handle = app.handle();

    let list = aio_coding_hub_lib::test_support::providers_list_by_cli_json(&handle, "claude")
        .expect("list claude providers");
    assert_eq!(json_array(list).len(), 0);

    let p1 = aio_coding_hub_lib::test_support::provider_upsert_json(
        &handle,
        None,
        "claude",
        "P1",
        vec!["https://api.anthropic.com".to_string()],
        "order",
        Some("k1"),
        true,
        1.0,
        Some(100),
        None,
        Some(5.0),
        Some(100.0),
        Some("fixed"),
        Some("01:02:03"),
        Some(300.0),
        Some(1000.0),
        Some(10000.0),
    )
    .expect("insert provider 1");

    let p2 = aio_coding_hub_lib::test_support::provider_upsert_json(
        &handle,
        None,
        "claude",
        "P2",
        vec![
            "https://api.anthropic.com".to_string(),
            "https://api.anthropic.com/v2".to_string(),
        ],
        "ping",
        Some("k2"),
        true,
        1.0,
        Some(100),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    )
    .expect("insert provider 2");

    assert_eq!(json_str(&p1, "cli_key"), "claude");
    assert_eq!(json_str(&p2, "cli_key"), "claude");

    let id1 = json_i64(&p1, "id");
    let id2 = json_i64(&p2, "id");
    assert!(id1 > 0);
    assert!(id2 > 0);

    assert_eq!(json_str(&p1, "daily_reset_mode"), "fixed");
    assert_eq!(json_str(&p1, "daily_reset_time"), "01:02:03");
    assert_eq!(json_f64(&p1, "limit_5h_usd"), Some(5.0));
    assert_eq!(json_f64(&p1, "limit_daily_usd"), Some(100.0));
    assert_eq!(json_f64(&p1, "limit_weekly_usd"), Some(300.0));
    assert_eq!(json_f64(&p1, "limit_monthly_usd"), Some(1000.0));
    assert_eq!(json_f64(&p1, "limit_total_usd"), Some(10000.0));

    let list = aio_coding_hub_lib::test_support::providers_list_by_cli_json(&handle, "claude")
        .expect("list providers after insert");
    let list = json_array(list);
    assert_eq!(list.len(), 2);
    assert_eq!(json_str(&list[0], "name"), "P1");
    assert_eq!(json_str(&list[1], "name"), "P2");

    let updated = aio_coding_hub_lib::test_support::provider_upsert_json(
        &handle,
        Some(id1),
        "claude",
        "P1-renamed",
        vec!["https://api.anthropic.com".to_string()],
        "order",
        None,
        true,
        1.0,
        Some(101),
        None,
        Some(5.0),
        Some(100.0),
        Some("fixed"),
        Some("01:02:03"),
        Some(300.0),
        Some(1000.0),
        Some(10000.0),
    )
    .expect("update provider 1");
    assert_eq!(json_str(&updated, "name"), "P1-renamed");

    let updated = aio_coding_hub_lib::test_support::provider_set_enabled_json(&handle, id1, false)
        .expect("disable provider 1");
    assert_eq!(json_i64(&updated, "id"), id1);
    assert!(!json_bool(&updated, "enabled"));

    let reordered =
        aio_coding_hub_lib::test_support::providers_reorder_json(&handle, "claude", vec![id2, id1])
            .expect("reorder providers");
    let reordered = json_array(reordered);
    assert_eq!(json_i64(&reordered[0], "id"), id2);

    assert!(
        aio_coding_hub_lib::test_support::provider_delete(&handle, id1).expect("delete provider")
    );

    let list = aio_coding_hub_lib::test_support::providers_list_by_cli_json(&handle, "claude")
        .expect("list providers after delete");
    assert_eq!(json_array(list).len(), 1);

    let err =
        aio_coding_hub_lib::test_support::providers_reorder_json(&handle, "claude", vec![id2, id2])
            .expect_err("duplicate reorder should fail");
    assert!(
        err.contains("duplicate provider_id"),
        "unexpected error: {err}"
    );
}
