use super::*;

// -- ClaudeModels::map_model --

#[test]
fn claude_models_no_config_keeps_original() {
    let models = ClaudeModels::default();
    assert_eq!(
        models.map_model("claude-sonnet-4", false),
        "claude-sonnet-4"
    );
}

#[test]
fn claude_models_thinking_prefers_reasoning_model() {
    let models = ClaudeModels {
        main_model: Some("glm-main".to_string()),
        reasoning_model: Some("glm-thinking".to_string()),
        haiku_model: Some("glm-haiku".to_string()),
        sonnet_model: Some("glm-sonnet".to_string()),
        opus_model: Some("glm-opus".to_string()),
    }
    .normalized();

    assert_eq!(models.map_model("claude-sonnet-4", true), "glm-thinking");
}

#[test]
fn claude_models_type_slot_selected_by_substring() {
    let models = ClaudeModels {
        main_model: Some("glm-main".to_string()),
        haiku_model: Some("glm-haiku".to_string()),
        sonnet_model: Some("glm-sonnet".to_string()),
        opus_model: Some("glm-opus".to_string()),
        ..Default::default()
    }
    .normalized();

    assert_eq!(models.map_model("claude-haiku-4", false), "glm-haiku");
    assert_eq!(models.map_model("claude-sonnet-4", false), "glm-sonnet");
    assert_eq!(models.map_model("claude-opus-4", false), "glm-opus");
}

#[test]
fn claude_models_falls_back_to_main_model() {
    let models = ClaudeModels {
        main_model: Some("glm-main".to_string()),
        ..Default::default()
    }
    .normalized();

    assert_eq!(models.map_model("some-unknown-model", false), "glm-main");
}

// -- ClaudeModels::has_any --

#[test]
fn claude_models_has_any_false_for_default() {
    assert!(!ClaudeModels::default().has_any());
}

#[test]
fn claude_models_has_any_true_with_main_model() {
    let models = ClaudeModels {
        main_model: Some("test".to_string()),
        ..Default::default()
    };
    assert!(models.has_any());
}

// -- normalize_model_slot --

#[test]
fn normalize_model_slot_trims_whitespace() {
    assert_eq!(
        normalize_model_slot(Some("  model-name  ".to_string())),
        Some("model-name".to_string())
    );
}

#[test]
fn normalize_model_slot_returns_none_for_empty() {
    assert!(normalize_model_slot(Some("".to_string())).is_none());
}

#[test]
fn normalize_model_slot_returns_none_for_whitespace_only() {
    assert!(normalize_model_slot(Some("   ".to_string())).is_none());
}

#[test]
fn normalize_model_slot_returns_none_for_none() {
    assert!(normalize_model_slot(None).is_none());
}

#[test]
fn normalize_model_slot_truncates_long_names() {
    let long_name = "a".repeat(MAX_MODEL_NAME_LEN + 50);
    let result = normalize_model_slot(Some(long_name));
    assert_eq!(result.as_ref().map(|s| s.len()), Some(MAX_MODEL_NAME_LEN));
}

// -- DailyResetMode::parse --

#[test]
fn daily_reset_mode_parse_fixed() {
    let mode = DailyResetMode::parse("fixed").unwrap();
    assert_eq!(mode.as_str(), "fixed");
}

#[test]
fn daily_reset_mode_parse_rolling() {
    let mode = DailyResetMode::parse("rolling").unwrap();
    assert_eq!(mode.as_str(), "rolling");
}

#[test]
fn daily_reset_mode_parse_invalid() {
    assert!(DailyResetMode::parse("invalid").is_none());
}

#[test]
fn daily_reset_mode_parse_trims_whitespace() {
    assert!(DailyResetMode::parse(" fixed ").is_some());
}

// -- ProviderBaseUrlMode::parse --

#[test]
fn base_url_mode_parse_order() {
    let mode = ProviderBaseUrlMode::parse("order").unwrap();
    assert_eq!(mode.as_str(), "order");
}

#[test]
fn base_url_mode_parse_ping() {
    let mode = ProviderBaseUrlMode::parse("ping").unwrap();
    assert_eq!(mode.as_str(), "ping");
}

#[test]
fn base_url_mode_parse_invalid() {
    assert!(ProviderBaseUrlMode::parse("random").is_none());
}

// -- parse_reset_time_hms --

#[test]
fn parse_reset_time_valid_hm() {
    assert_eq!(parse_reset_time_hms("08:30"), Some((8, 30, 0)));
}

#[test]
fn parse_reset_time_valid_hms() {
    assert_eq!(parse_reset_time_hms("23:59:59"), Some((23, 59, 59)));
}

#[test]
fn parse_reset_time_single_digit_hour() {
    assert_eq!(parse_reset_time_hms("8:30"), Some((8, 30, 0)));
}

#[test]
fn parse_reset_time_midnight() {
    assert_eq!(parse_reset_time_hms("00:00"), Some((0, 0, 0)));
}

#[test]
fn parse_reset_time_rejects_invalid_hour() {
    assert!(parse_reset_time_hms("25:00").is_none());
}

#[test]
fn parse_reset_time_rejects_invalid_minute() {
    assert!(parse_reset_time_hms("12:60").is_none());
}

#[test]
fn parse_reset_time_rejects_empty() {
    assert!(parse_reset_time_hms("").is_none());
}

#[test]
fn parse_reset_time_rejects_no_colon() {
    assert!(parse_reset_time_hms("1234").is_none());
}

#[test]
fn parse_reset_time_rejects_three_digit_hour() {
    assert!(parse_reset_time_hms("123:00").is_none());
}

// -- normalize_reset_time_hms_lossy --

#[test]
fn normalize_reset_time_lossy_valid_input() {
    assert_eq!(normalize_reset_time_hms_lossy("8:30"), "08:30:00");
}

#[test]
fn normalize_reset_time_lossy_invalid_falls_back() {
    assert_eq!(normalize_reset_time_hms_lossy("invalid"), "00:00:00");
}

// -- normalize_reset_time_hms_strict --

#[test]
fn normalize_reset_time_strict_valid_input() {
    assert_eq!(
        normalize_reset_time_hms_strict("daily_reset_time", "8:30").unwrap(),
        "08:30:00"
    );
}

#[test]
fn normalize_reset_time_strict_rejects_invalid() {
    assert!(normalize_reset_time_hms_strict("daily_reset_time", "invalid").is_err());
}

// -- validate_limit_usd --

#[test]
fn validate_limit_usd_none_passes() {
    assert_eq!(validate_limit_usd("test", None).unwrap(), None);
}

#[test]
fn validate_limit_usd_zero_passes() {
    assert_eq!(validate_limit_usd("test", Some(0.0)).unwrap(), Some(0.0));
}

#[test]
fn validate_limit_usd_positive_passes() {
    assert_eq!(
        validate_limit_usd("test", Some(100.0)).unwrap(),
        Some(100.0)
    );
}

#[test]
fn validate_limit_usd_rejects_negative() {
    assert!(validate_limit_usd("test", Some(-1.0)).is_err());
}

#[test]
fn validate_limit_usd_rejects_infinity() {
    assert!(validate_limit_usd("test", Some(f64::INFINITY)).is_err());
}

#[test]
fn validate_limit_usd_rejects_nan() {
    assert!(validate_limit_usd("test", Some(f64::NAN)).is_err());
}

#[test]
fn validate_limit_usd_rejects_over_max() {
    assert!(validate_limit_usd("test", Some(MAX_LIMIT_USD + 1.0)).is_err());
}

#[test]
fn validate_limit_usd_accepts_max() {
    assert_eq!(
        validate_limit_usd("test", Some(MAX_LIMIT_USD)).unwrap(),
        Some(MAX_LIMIT_USD)
    );
}

// -- normalize_base_urls --

#[test]
fn normalize_base_urls_valid_single() {
    let result = normalize_base_urls(vec!["https://api.example.com".to_string()]).unwrap();
    assert_eq!(result, vec!["https://api.example.com"]);
}

#[test]
fn normalize_base_urls_deduplicates() {
    let result = normalize_base_urls(vec![
        "https://api.example.com".to_string(),
        "https://api.example.com".to_string(),
    ])
    .unwrap();
    assert_eq!(result.len(), 1);
}

#[test]
fn normalize_base_urls_trims_whitespace() {
    let result = normalize_base_urls(vec!["  https://api.example.com  ".to_string()]).unwrap();
    assert_eq!(result, vec!["https://api.example.com"]);
}

#[test]
fn normalize_base_urls_skips_empty_entries() {
    let result = normalize_base_urls(vec![
        "".to_string(),
        "https://api.example.com".to_string(),
        "  ".to_string(),
    ])
    .unwrap();
    assert_eq!(result, vec!["https://api.example.com"]);
}

#[test]
fn normalize_base_urls_rejects_all_empty() {
    assert!(normalize_base_urls(vec!["".to_string(), "  ".to_string()]).is_err());
}

#[test]
fn normalize_base_urls_rejects_invalid_url() {
    assert!(normalize_base_urls(vec!["not a url".to_string()]).is_err());
}

// -- base_urls_from_row --

#[test]
fn base_urls_from_row_parses_json_array() {
    let result = base_urls_from_row(
        "https://fallback.com",
        r#"["https://a.com","https://b.com"]"#,
    );
    assert_eq!(result, vec!["https://a.com", "https://b.com"]);
}

#[test]
fn base_urls_from_row_falls_back_to_base_url() {
    let result = base_urls_from_row("https://fallback.com", "[]");
    assert_eq!(result, vec!["https://fallback.com"]);
}

#[test]
fn base_urls_from_row_handles_invalid_json() {
    let result = base_urls_from_row("https://fallback.com", "not json");
    assert_eq!(result, vec!["https://fallback.com"]);
}

#[test]
fn base_urls_from_row_deduplicates() {
    let result = base_urls_from_row("", r#"["https://a.com","https://a.com","https://b.com"]"#);
    assert_eq!(result, vec!["https://a.com", "https://b.com"]);
}

#[test]
fn base_urls_from_row_returns_empty_string_vec_when_all_empty() {
    let result = base_urls_from_row("", "[]");
    assert_eq!(result, vec![""]);
}

// -- claude_models_from_json --

#[test]
fn claude_models_from_json_valid() {
    let models = claude_models_from_json(r#"{"main_model":"test-model"}"#);
    assert_eq!(models.main_model, Some("test-model".to_string()));
}

#[test]
fn claude_models_from_json_invalid_returns_default() {
    let models = claude_models_from_json("not json");
    assert!(!models.has_any());
}

#[test]
fn claude_models_from_json_empty_object() {
    let models = claude_models_from_json("{}");
    assert!(!models.has_any());
}
