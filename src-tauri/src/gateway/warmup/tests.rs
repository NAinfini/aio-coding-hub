use super::*;

#[test]
fn warmup_request_matches_strict_shape() {
    let body = serde_json::json!({
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": " Warmup ",
                        "cache_control": { "type": "ephemeral" }
                    }
                ]
            }
        ]
    });
    assert!(is_anthropic_warmup_request("/v1/messages", Some(&body)));
}

#[test]
fn warmup_request_rejects_wrong_path() {
    let body = serde_json::json!({
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "warmup",
                        "cache_control": { "type": "ephemeral" }
                    }
                ]
            }
        ]
    });
    assert!(!is_anthropic_warmup_request(
        "/v1/messages/count_tokens",
        Some(&body)
    ));
}

#[test]
fn warmup_request_rejects_missing_cache_control() {
    let body = serde_json::json!({
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "warmup"
                    }
                ]
            }
        ]
    });
    assert!(!is_anthropic_warmup_request("/v1/messages", Some(&body)));
}
