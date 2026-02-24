use super::{
    extract_server_tool_flags_from_message_json, extract_web_search_requests_from_message_json,
    SseTextAccumulator,
};

#[test]
fn sse_signature_delta_is_accumulated() {
    let mut acc = SseTextAccumulator::default();
    let sse = concat!(
        "event: message\n",
        "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"THINK1\",\"signature\":\"\"}}\n",
        "\n",
        "event: message\n",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"THINK2\"}}\n",
        "\n",
        "event: message\n",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"SIG_PART_1\"}}\n",
        "\n",
        "event: message\n",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"SIG_PART_2\"}}\n",
        "\n",
        "event: message\n",
        "data: {\"type\":\"content_block_stop\",\"index\":0}\n",
        "\n",
    );

    acc.ingest_chunk(sse.as_bytes());
    acc.finalize();

    assert!(acc.thinking_block_seen);
    assert_eq!(acc.thinking_full, "THINK1THINK2");
    assert_eq!(acc.signature_full, "SIG_PART_1SIG_PART_2");
    assert!(acc.signature_from_delta);
    assert_eq!(acc.signature_chars, "SIG_PART_1SIG_PART_2".chars().count());
}

#[test]
fn sse_error_event_is_detected() {
    let mut acc = SseTextAccumulator::default();
    let sse = concat!(
        "event: error\n",
        "data: {\"error\":\"Claude API error\",\"status\":400,\"details\":\"{\\\"type\\\":\\\"error\\\",\\\"error\\\":{\\\"type\\\":\\\"invalid_request_error\\\",\\\"message\\\":\\\"This model does not support the effort parameter.\\\"},\\\"request_id\\\":\\\"req_123\\\"}\"}\n",
        "\n",
    );

    acc.ingest_chunk(sse.as_bytes());
    acc.finalize();

    assert!(acc.error_event_seen);
    assert_eq!(acc.error_status, Some(400));
    assert!(acc.error_message.contains("invalid_request_error"));
    assert!(acc
        .error_message
        .contains("This model does not support the effort parameter."));
    assert!(acc.error_message.contains("request_id=req_123"));
}

#[test]
fn sse_web_search_tool_use_is_detected() {
    let mut acc = SseTextAccumulator::default();
    let sse = concat!(
        "event: message\n",
        "data: {\"type\":\"message_start\",\"message\":{\"usage\":{\"server_tool_use\":{\"web_search_requests\":2}}}}\n",
        "\n",
        "event: message\n",
        "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"server_tool_use\",\"name\":\"web_search\"}}\n",
        "\n",
        "event: message\n",
        "data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"web_search_tool_result\",\"content\":[{\"type\":\"web_search_result\",\"url\":\"https://www.helpaio.com/x\"},{\"type\":\"web_search_result\",\"url\":\"  https://example.com  \"},{\"type\":\"text\",\"text\":\"ignore\"}]}}\n",
        "\n",
    );

    acc.ingest_chunk(sse.as_bytes());
    acc.finalize();

    assert!(acc.server_tool_use_seen);
    assert!(acc.web_search_tool_result_seen);
    assert_eq!(acc.web_search_requests_count, Some(2));
    assert_eq!(
        acc.web_search_result_urls,
        vec![
            "https://www.helpaio.com/x".to_string(),
            "https://example.com".to_string()
        ]
    );
}

#[test]
fn web_search_signals_are_extracted_from_message_json() {
    let value: serde_json::Value = serde_json::json!({
        "type": "message",
        "content": [
            { "type": "server_tool_use", "name": "web_search" },
            {
                "type": "web_search_tool_result",
                "content": [
                    { "type": "web_search_result", "url": "https://www.helpaio.com/a" }
                ]
            }
        ],
        "usage": {
            "server_tool_use": {
                "web_search_requests": 1
            }
        }
    });

    let (srv, ws, urls) = extract_server_tool_flags_from_message_json(&value);
    assert!(srv);
    assert!(ws);
    assert_eq!(urls, vec!["https://www.helpaio.com/a".to_string()]);

    let count = extract_web_search_requests_from_message_json(&value);
    assert_eq!(count, Some(1));
}
