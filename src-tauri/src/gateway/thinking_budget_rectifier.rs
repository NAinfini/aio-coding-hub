pub(super) type ThinkingBudgetRectifierTrigger = &'static str;

pub(super) const TRIGGER_BUDGET_TOKENS_TOO_LOW: ThinkingBudgetRectifierTrigger =
    "budget_tokens_too_low";

const MAX_THINKING_BUDGET: u64 = 32_000;
const MAX_TOKENS_VALUE: u64 = 64_000;
const MIN_MAX_TOKENS_FOR_BUDGET: u64 = MAX_THINKING_BUDGET + 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ThinkingBudgetRectifierSnapshot {
    pub(super) max_tokens: Option<u64>,
    pub(super) thinking_type: Option<String>,
    pub(super) thinking_budget_tokens: Option<u64>,
}

#[derive(Debug, Clone)]
pub(super) struct ThinkingBudgetRectifierResult {
    pub(super) applied: bool,
    pub(super) before: ThinkingBudgetRectifierSnapshot,
    pub(super) after: ThinkingBudgetRectifierSnapshot,
}

pub(super) fn detect_trigger(error_message: &str) -> Option<ThinkingBudgetRectifierTrigger> {
    if error_message.trim().is_empty() {
        return None;
    }

    let lower = error_message.to_lowercase();
    let has_budget_tokens_ref = lower.contains("budget_tokens") || lower.contains("budget tokens");
    let has_thinking_ref = lower.contains("thinking");
    let has_1024_constraint = lower.contains("greater than or equal to 1024")
        || lower.contains(">= 1024")
        || (lower.contains("1024") && lower.contains("input should be"));

    if has_budget_tokens_ref && has_thinking_ref && has_1024_constraint {
        return Some(TRIGGER_BUDGET_TOKENS_TOO_LOW);
    }

    None
}

fn snapshot(message: &serde_json::Value) -> ThinkingBudgetRectifierSnapshot {
    let message_obj = message.as_object();
    let max_tokens = message_obj
        .and_then(|v| v.get("max_tokens"))
        .and_then(|v| v.as_u64());

    let thinking_obj = message_obj
        .and_then(|v| v.get("thinking"))
        .and_then(|v| v.as_object());

    let thinking_type = thinking_obj
        .and_then(|v| v.get("type"))
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    let thinking_budget_tokens = thinking_obj
        .and_then(|v| v.get("budget_tokens"))
        .and_then(|v| v.as_u64());

    ThinkingBudgetRectifierSnapshot {
        max_tokens,
        thinking_type,
        thinking_budget_tokens,
    }
}

pub(super) fn rectify_anthropic_request_message(
    message: &mut serde_json::Value,
) -> ThinkingBudgetRectifierResult {
    let before = snapshot(message);

    let Some(message_obj) = message.as_object_mut() else {
        return ThinkingBudgetRectifierResult {
            applied: false,
            before: before.clone(),
            after: before,
        };
    };

    let thinking_type = message_obj
        .get("thinking")
        .and_then(|v| v.as_object())
        .and_then(|v| v.get("type"))
        .and_then(|v| v.as_str());

    if thinking_type == Some("adaptive") {
        return ThinkingBudgetRectifierResult {
            applied: false,
            before: before.clone(),
            after: before,
        };
    }

    if !message_obj.get("thinking").is_some_and(|v| v.is_object()) {
        message_obj.insert(
            "thinking".to_string(),
            serde_json::Value::Object(serde_json::Map::new()),
        );
    }

    let thinking_obj = message_obj
        .get_mut("thinking")
        .and_then(|v| v.as_object_mut())
        .expect("thinking object must exist");
    thinking_obj.insert(
        "type".to_string(),
        serde_json::Value::String("enabled".to_string()),
    );
    thinking_obj.insert(
        "budget_tokens".to_string(),
        serde_json::Value::Number(serde_json::Number::from(MAX_THINKING_BUDGET)),
    );

    let current_max_tokens = message_obj.get("max_tokens").and_then(|v| v.as_u64());
    if current_max_tokens.is_none()
        || current_max_tokens.is_some_and(|v| v < MIN_MAX_TOKENS_FOR_BUDGET)
    {
        message_obj.insert(
            "max_tokens".to_string(),
            serde_json::Value::Number(serde_json::Number::from(MAX_TOKENS_VALUE)),
        );
    }

    let after = snapshot(message);
    let applied = before != after;

    ThinkingBudgetRectifierResult {
        applied,
        before,
        after,
    }
}

#[cfg(test)]
mod tests;
