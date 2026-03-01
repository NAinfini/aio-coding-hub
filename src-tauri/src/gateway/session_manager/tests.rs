use super::*;
use axum::http::{header, HeaderMap, HeaderValue};

#[test]
fn clear_cli_bindings_removes_only_target_cli() {
    let manager = SessionManager::new();
    let now_unix = 100;

    manager.bind_sort_mode(
        "claude",
        "session_a",
        Some(1),
        Some(vec![101, 102]),
        now_unix,
    );
    manager.bind_sort_mode("claude", "session_b", None, None, now_unix);
    manager.bind_sort_mode("codex", "session_c", Some(2), Some(vec![201]), now_unix);

    assert_eq!(manager.clear_cli_bindings(""), 0);

    let removed = manager.clear_cli_bindings("claude");
    assert_eq!(removed, 2);

    assert_eq!(
        manager.get_bound_sort_mode_id("claude", "session_a", now_unix),
        None
    );
    assert_eq!(
        manager.get_bound_sort_mode_id("claude", "session_b", now_unix),
        None
    );
    assert_eq!(
        manager.get_bound_sort_mode_id("codex", "session_c", now_unix),
        Some(Some(2))
    );
}

#[test]
fn extract_session_id_fallback_uses_message_fingerprint_and_ignores_user_agent() {
    let body = serde_json::json!({
        "messages": [
            { "role": "user", "content": "hello" },
            { "role": "assistant", "content": "world" }
        ]
    });

    let mut h1 = HeaderMap::new();
    h1.insert(header::USER_AGENT, HeaderValue::from_static("ua-1"));
    let mut h2 = HeaderMap::new();
    h2.insert(header::USER_AGENT, HeaderValue::from_static("ua-2"));

    let id1 = SessionManager::extract_session_id_from_json(&h1, Some(&body)).expect("sid 1");
    let id2 = SessionManager::extract_session_id_from_json(&h2, Some(&body)).expect("sid 2");
    assert_eq!(id1, id2);
}

#[test]
fn extract_session_id_fallback_changes_when_message_fingerprint_changes() {
    let mut headers = HeaderMap::new();
    headers.insert(header::USER_AGENT, HeaderValue::from_static("ua"));

    let body1 = serde_json::json!({
        "messages": [{ "role": "user", "content": "hello" }]
    });
    let body2 = serde_json::json!({
        "messages": [{ "role": "user", "content": "goodbye" }]
    });

    let id1 = SessionManager::extract_session_id_from_json(&headers, Some(&body1)).expect("sid 1");
    let id2 = SessionManager::extract_session_id_from_json(&headers, Some(&body2)).expect("sid 2");
    assert_ne!(id1, id2);
}

#[test]
fn extract_session_id_fallback_uses_only_first_three_segments() {
    let headers = HeaderMap::new();

    let body_with_four = serde_json::json!({
        "messages": [
            { "role": "user", "content": "a" },
            { "role": "assistant", "content": "b" },
            { "role": "user", "content": "c" },
            { "role": "assistant", "content": "d" }
        ]
    });
    let body_with_three = serde_json::json!({
        "messages": [
            { "role": "user", "content": "a" },
            { "role": "assistant", "content": "b" },
            { "role": "user", "content": "c" }
        ]
    });

    let id1 =
        SessionManager::extract_session_id_from_json(&headers, Some(&body_with_four)).expect("sid");
    let id2 = SessionManager::extract_session_id_from_json(&headers, Some(&body_with_three))
        .expect("sid");
    assert_eq!(id1, id2);
}

#[test]
fn extract_session_id_fallback_treats_content_parts_equivalent_to_string_content() {
    let headers = HeaderMap::new();

    let body_parts = serde_json::json!({
        "messages": [
            { "role": "user", "content": [{ "text": "he" }, { "text": "llo" }] }
        ]
    });
    let body_string = serde_json::json!({
        "messages": [
            { "role": "user", "content": "hello" }
        ]
    });

    let id1 =
        SessionManager::extract_session_id_from_json(&headers, Some(&body_parts)).expect("sid");
    let id2 =
        SessionManager::extract_session_id_from_json(&headers, Some(&body_string)).expect("sid");
    assert_eq!(id1, id2);
}

#[test]
fn extract_session_id_fallback_supports_input_string_shape() {
    let body = serde_json::json!({ "input": "hello" });

    let mut h1 = HeaderMap::new();
    h1.insert(header::USER_AGENT, HeaderValue::from_static("ua-1"));
    let mut h2 = HeaderMap::new();
    h2.insert(header::USER_AGENT, HeaderValue::from_static("ua-2"));

    let id1 = SessionManager::extract_session_id_from_json(&h1, Some(&body)).expect("sid 1");
    let id2 = SessionManager::extract_session_id_from_json(&h2, Some(&body)).expect("sid 2");
    assert_eq!(id1, id2);
}

#[test]
fn extract_session_id_fallback_distinguishes_different_api_keys() {
    let body = serde_json::json!({ "messages": [{ "role": "user", "content": "hello" }] });

    let mut h1 = HeaderMap::new();
    h1.insert("x-api-key", HeaderValue::from_static("key-a-123456789"));
    let mut h2 = HeaderMap::new();
    h2.insert("x-api-key", HeaderValue::from_static("key-b-123456789"));

    let id1 = SessionManager::extract_session_id_from_json(&h1, Some(&body)).expect("sid 1");
    let id2 = SessionManager::extract_session_id_from_json(&h2, Some(&body)).expect("sid 2");
    assert_ne!(id1, id2);
}
