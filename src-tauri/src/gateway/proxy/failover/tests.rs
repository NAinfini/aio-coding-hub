use super::{retry_backoff_delay, select_next_provider_id_from_order, should_reuse_provider};
use serde_json::json;
use std::collections::HashSet;

fn set(ids: &[i64]) -> HashSet<i64> {
    ids.iter().copied().collect()
}

#[test]
fn select_next_provider_id_wraps_and_skips_missing() {
    let order = vec![1, 2, 3, 4];
    let current = set(&[2, 4]);

    assert_eq!(
        select_next_provider_id_from_order(4, &order, &current),
        Some(2)
    );
    assert_eq!(
        select_next_provider_id_from_order(2, &order, &current),
        Some(4)
    );
}

#[test]
fn select_next_provider_id_returns_none_when_no_candidate() {
    let order = vec![1, 2, 3];
    assert_eq!(
        select_next_provider_id_from_order(2, &order, &set(&[])),
        None
    );
    assert_eq!(
        select_next_provider_id_from_order(2, &order, &set(&[99])),
        None
    );
}

#[test]
fn select_next_provider_id_starts_from_head_when_bound_missing() {
    let order = vec![10, 20, 30];
    let current = set(&[30]);
    assert_eq!(
        select_next_provider_id_from_order(999, &order, &current),
        Some(30)
    );
}

#[test]
fn select_next_provider_id_handles_empty_order() {
    let current = set(&[1, 2, 3]);
    assert_eq!(select_next_provider_id_from_order(1, &[], &current), None);
}

#[test]
fn retry_backoff_delay_returns_none_for_non_retryable_status() {
    assert!(retry_backoff_delay(reqwest::StatusCode::BAD_REQUEST, 1).is_none());
    assert!(retry_backoff_delay(reqwest::StatusCode::UNAUTHORIZED, 1).is_none());
    assert!(retry_backoff_delay(reqwest::StatusCode::INTERNAL_SERVER_ERROR, 1).is_none());
}

#[test]
fn retry_backoff_delay_returns_delay_for_408_429() {
    // 408 Request Timeout
    let delay = retry_backoff_delay(reqwest::StatusCode::REQUEST_TIMEOUT, 1);
    assert!(delay.is_some());
    assert!(delay.unwrap().as_millis() >= 80);

    // 429 Too Many Requests
    let delay = retry_backoff_delay(reqwest::StatusCode::TOO_MANY_REQUESTS, 1);
    assert!(delay.is_some());
    assert!(delay.unwrap().as_millis() >= 80);
}

#[test]
fn retry_backoff_delay_increases_with_retry_index() {
    let delay1 = retry_backoff_delay(reqwest::StatusCode::TOO_MANY_REQUESTS, 1)
        .unwrap()
        .as_millis();
    let delay2 = retry_backoff_delay(reqwest::StatusCode::TOO_MANY_REQUESTS, 2)
        .unwrap()
        .as_millis();
    let delay3 = retry_backoff_delay(reqwest::StatusCode::TOO_MANY_REQUESTS, 3)
        .unwrap()
        .as_millis();

    assert!(delay2 > delay1);
    assert!(delay3 > delay2);
}

#[test]
fn retry_backoff_delay_caps_at_max() {
    // Very high retry index should cap at 800ms
    let delay = retry_backoff_delay(reqwest::StatusCode::TOO_MANY_REQUESTS, 100)
        .unwrap()
        .as_millis();
    assert_eq!(delay, 800);
}

#[test]
fn retry_backoff_delay_treats_zero_retry_index_as_first_retry() {
    let delay = retry_backoff_delay(reqwest::StatusCode::TOO_MANY_REQUESTS, 0)
        .unwrap()
        .as_millis();
    assert_eq!(delay, 80);
}

#[test]
fn should_reuse_provider_returns_false_for_none() {
    assert!(!should_reuse_provider(None));
}

#[test]
fn should_reuse_provider_returns_false_for_single_message() {
    let body = json!({
        "messages": [{"role": "user", "content": "hello"}]
    });
    assert!(!should_reuse_provider(Some(&body)));
}

#[test]
fn should_reuse_provider_returns_true_for_multiple_messages() {
    let body = json!({
        "messages": [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
            {"role": "user", "content": "how are you?"}
        ]
    });
    assert!(should_reuse_provider(Some(&body)));
}

#[test]
fn should_reuse_provider_checks_input_array() {
    let body = json!({
        "input": [
            {"type": "message", "content": "a"},
            {"type": "message", "content": "b"}
        ]
    });
    assert!(should_reuse_provider(Some(&body)));
}

#[test]
fn should_reuse_provider_checks_contents_array() {
    let body = json!({
        "contents": [
            {"parts": [{"text": "hello"}]},
            {"parts": [{"text": "world"}]}
        ]
    });
    assert!(should_reuse_provider(Some(&body)));
}

#[test]
fn should_reuse_provider_checks_nested_request_contents() {
    let body = json!({
        "request": {
            "contents": [
                {"parts": [{"text": "a"}]},
                {"parts": [{"text": "b"}]}
            ]
        }
    });
    assert!(should_reuse_provider(Some(&body)));
}

#[test]
fn should_reuse_provider_returns_false_for_empty_messages() {
    let body = json!({
        "messages": []
    });
    assert!(!should_reuse_provider(Some(&body)));
}
