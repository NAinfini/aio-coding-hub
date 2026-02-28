use super::*;
use serde_json::json;

#[test]
fn detect_trigger_budget_tokens_too_low() {
    let msg = "thinking.enabled.budget_tokens: Input should be greater than or equal to 1024";
    assert_eq!(detect_trigger(msg), Some(TRIGGER_BUDGET_TOKENS_TOO_LOW));

    let msg2 = "budget_tokens must be >= 1024 when thinking is enabled";
    assert_eq!(detect_trigger(msg2), Some(TRIGGER_BUDGET_TOKENS_TOO_LOW));
}

#[test]
fn detect_trigger_unrelated_error() {
    assert_eq!(detect_trigger("invalid signature in thinking block"), None);
    assert_eq!(detect_trigger(""), None);
}

#[test]
fn rectify_sets_budget_and_max_tokens() {
    let mut message = json!({
        "model": "claude-test",
        "messages": [ { "role": "user", "content": [ { "type": "text", "text": "hi" } ] } ],
        "max_tokens": 10,
        "thinking": { "type": "enabled", "budget_tokens": 512 }
    });

    let result = rectify_anthropic_request_message(&mut message);
    assert!(result.applied);
    assert_eq!(result.before.thinking_budget_tokens, Some(512));
    assert_eq!(result.after.thinking_budget_tokens, Some(32_000));
    assert_eq!(message["thinking"]["type"].as_str(), Some("enabled"));
    assert_eq!(message["thinking"]["budget_tokens"].as_u64(), Some(32_000));
    assert_eq!(message["max_tokens"].as_u64(), Some(64_000));
}

#[test]
fn rectify_skips_adaptive_thinking() {
    let mut message = json!({
        "model": "claude-test",
        "messages": [ { "role": "user", "content": [ { "type": "text", "text": "hi" } ] } ],
        "thinking": { "type": "adaptive", "budget_tokens": 512 }
    });

    let result = rectify_anthropic_request_message(&mut message);
    assert!(!result.applied);
    assert_eq!(message["thinking"]["type"].as_str(), Some("adaptive"));
    assert_eq!(message["thinking"]["budget_tokens"].as_u64(), Some(512));
}
