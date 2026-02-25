//! Usage: Finalize responses for failover loop terminal states.

use super::super::super::abort_guard::RequestAbortGuard;
use super::super::super::caches::CachedGatewayError;
use super::super::super::errors::error_response_with_retry_after;
use super::super::super::GatewayErrorCode;
use super::{emit_request_event_and_enqueue_request_log, RequestEndArgs, RequestEndDeps};
use crate::gateway::events::FailoverAttempt;
use crate::gateway::manager::GatewayAppState;
use crate::gateway::response_fixer;
use crate::gateway::util::now_unix_seconds;
use crate::shared::mutex_ext::MutexExt;
use axum::http::StatusCode;
use axum::response::Response;
use std::sync::{Arc, Mutex};
use std::time::Instant;

const DEFAULT_SKIPPED_RETRY_AFTER_SECS: i64 = 30;

fn parse_recover_at_from_attempt_reason(reason: &str) -> Option<i64> {
    let marker = "until ";
    let start = reason.rfind(marker)?.saturating_add(marker.len());
    let suffix = reason.get(start..)?.trim_start();
    let digits: String = suffix
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse::<i64>().ok()
    }
}

fn retry_after_for_all_skipped(attempts: &[FailoverAttempt], now_unix: i64) -> u64 {
    let hinted_retry = attempts
        .iter()
        .filter_map(|attempt| attempt.reason.as_deref())
        .filter_map(parse_recover_at_from_attempt_reason)
        .filter(|recover_at| *recover_at > now_unix)
        .map(|recover_at| recover_at.saturating_sub(now_unix))
        .min()
        .unwrap_or(DEFAULT_SKIPPED_RETRY_AFTER_SECS);

    hinted_retry.max(1) as u64
}

fn is_quota_exceeded_attempt(attempt: &FailoverAttempt) -> bool {
    if attempt.reason.as_deref().is_some_and(|reason| {
        reason.contains("GATEWAY_SKIP: oauth account") && reason.contains("quota exceeded")
    }) {
        return true;
    }

    matches!(attempt.status, Some(429))
        && !attempt
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("rule=429_concurrency_limit"))
}

fn all_attempts_quota_exceeded(attempts: &[FailoverAttempt]) -> bool {
    !attempts.is_empty() && attempts.iter().all(is_quota_exceeded_attempt)
}

fn all_attempts_auth_rejected(attempts: &[FailoverAttempt]) -> bool {
    !attempts.is_empty()
        && attempts
            .iter()
            .all(|attempt| matches!(attempt.status, Some(401 | 403)))
}

pub(super) struct AllUnavailableInput<'a> {
    pub(super) state: &'a GatewayAppState,
    pub(super) abort_guard: &'a mut RequestAbortGuard,
    pub(super) cli_key: String,
    pub(super) method_hint: String,
    pub(super) forwarded_path: String,
    pub(super) query: Option<String>,
    pub(super) trace_id: String,
    pub(super) started: Instant,
    pub(super) created_at_ms: i64,
    pub(super) created_at: i64,
    pub(super) session_id: Option<String>,
    pub(super) requested_model: Option<String>,
    pub(super) special_settings: Arc<Mutex<Vec<serde_json::Value>>>,
    pub(super) earliest_available_unix: Option<i64>,
    pub(super) skipped_open: usize,
    pub(super) skipped_cooldown: usize,
    pub(super) skipped_limits: usize,
    pub(super) fingerprint_key: u64,
    pub(super) fingerprint_debug: String,
    pub(super) unavailable_fingerprint_key: u64,
    pub(super) unavailable_fingerprint_debug: String,
}

pub(super) async fn all_providers_unavailable(input: AllUnavailableInput<'_>) -> Response {
    let AllUnavailableInput {
        state,
        abort_guard,
        cli_key,
        method_hint,
        forwarded_path,
        query,
        trace_id,
        started,
        created_at_ms,
        created_at,
        session_id,
        requested_model,
        special_settings,
        earliest_available_unix,
        skipped_open,
        skipped_cooldown,
        skipped_limits,
        fingerprint_key,
        fingerprint_debug,
        unavailable_fingerprint_key,
        unavailable_fingerprint_debug,
    } = input;

    let now_unix = now_unix_seconds() as i64;
    let retry_after_seconds = earliest_available_unix
        .and_then(|t| t.checked_sub(now_unix))
        .filter(|v| *v > 0)
        .map(|v| v as u64);

    let message = format!(
        "no provider available (skipped: open={skipped_open}, cooldown={skipped_cooldown}, limits={skipped_limits}) for cli_key={cli_key}",
    );

    // Disk log: all providers unavailable (circuit breaker / cooldown / limits).
    tracing::error!(
        trace_id = %trace_id,
        error_code = GatewayErrorCode::AllProvidersUnavailable.as_str(),
        cli_key = %cli_key,
        skipped_open = skipped_open,
        skipped_cooldown = skipped_cooldown,
        skipped_limits = skipped_limits,
        "all providers unavailable"
    );

    let resp = error_response_with_retry_after(
        StatusCode::SERVICE_UNAVAILABLE,
        trace_id.clone(),
        GatewayErrorCode::AllProvidersUnavailable.as_str(),
        message.clone(),
        vec![],
        retry_after_seconds,
    );

    let duration_ms = started.elapsed().as_millis();
    emit_request_event_and_enqueue_request_log(RequestEndArgs {
        deps: RequestEndDeps::new(&state.app, &state.db, &state.log_tx),
        trace_id: trace_id.as_str(),
        cli_key: cli_key.as_str(),
        method: method_hint.as_str(),
        path: forwarded_path.as_str(),
        query: query.as_deref(),
        excluded_from_stats: false,
        status: Some(StatusCode::SERVICE_UNAVAILABLE.as_u16()),
        error_category: None,
        error_code: Some(GatewayErrorCode::AllProvidersUnavailable.as_str()),
        duration_ms,
        event_ttfb_ms: None,
        log_ttfb_ms: None,
        attempts: &[],
        special_settings_json: response_fixer::special_settings_json(&special_settings),
        session_id,
        requested_model,
        oauth_account_id: None,
        created_at_ms,
        created_at,
        usage_metrics: None,
        log_usage_metrics: None,
        usage: None,
    })
    .await;

    if let Some(retry_after_seconds) = retry_after_seconds.filter(|v| *v > 0) {
        let mut cache = state.recent_errors.lock_or_recover();
        cache.insert_error(
            now_unix,
            unavailable_fingerprint_key,
            CachedGatewayError {
                trace_id: trace_id.clone(),
                status: StatusCode::SERVICE_UNAVAILABLE,
                error_code: GatewayErrorCode::AllProvidersUnavailable.as_str(),
                message: message.clone(),
                retry_after_seconds: Some(retry_after_seconds),
                expires_at_unix: now_unix.saturating_add(retry_after_seconds as i64),
                fingerprint_debug: unavailable_fingerprint_debug.clone(),
            },
        );
        cache.insert_error(
            now_unix,
            fingerprint_key,
            CachedGatewayError {
                trace_id: trace_id.clone(),
                status: StatusCode::SERVICE_UNAVAILABLE,
                error_code: GatewayErrorCode::AllProvidersUnavailable.as_str(),
                message,
                retry_after_seconds: Some(retry_after_seconds),
                expires_at_unix: now_unix.saturating_add(retry_after_seconds as i64),
                fingerprint_debug: fingerprint_debug.clone(),
            },
        );
    }

    abort_guard.disarm();
    resp
}

pub(super) struct AllFailedInput<'a> {
    pub(super) state: &'a GatewayAppState,
    pub(super) abort_guard: &'a mut RequestAbortGuard,
    pub(super) attempts: Vec<FailoverAttempt>,
    pub(super) last_error_category: Option<&'static str>,
    pub(super) last_error_code: Option<&'static str>,
    pub(super) cli_key: String,
    pub(super) method_hint: String,
    pub(super) forwarded_path: String,
    pub(super) query: Option<String>,
    pub(super) trace_id: String,
    pub(super) started: Instant,
    pub(super) created_at_ms: i64,
    pub(super) created_at: i64,
    pub(super) session_id: Option<String>,
    pub(super) requested_model: Option<String>,
    pub(super) special_settings: Arc<Mutex<Vec<serde_json::Value>>>,
    pub(super) fingerprint_key: u64,
    pub(super) fingerprint_debug: String,
    pub(super) unavailable_fingerprint_key: u64,
    pub(super) unavailable_fingerprint_debug: String,
}

pub(super) async fn all_providers_failed(input: AllFailedInput<'_>) -> Response {
    let AllFailedInput {
        state,
        abort_guard,
        attempts,
        last_error_category,
        last_error_code,
        cli_key,
        method_hint,
        forwarded_path,
        query,
        trace_id,
        started,
        created_at_ms,
        created_at,
        session_id,
        requested_model,
        special_settings,
        fingerprint_key,
        fingerprint_debug,
        unavailable_fingerprint_key,
        unavailable_fingerprint_debug,
    } = input;

    let now_unix = now_unix_seconds() as i64;
    let all_skipped =
        !attempts.is_empty() && attempts.iter().all(|attempt| attempt.outcome == "skipped");
    let all_quota_exceeded = all_attempts_quota_exceeded(&attempts);
    let all_auth_rejected = all_attempts_auth_rejected(&attempts);
    let retry_after_seconds = all_skipped.then(|| retry_after_for_all_skipped(&attempts, now_unix));
    let status = if all_skipped {
        StatusCode::SERVICE_UNAVAILABLE
    } else {
        StatusCode::BAD_GATEWAY
    };
    let final_error_code = if all_quota_exceeded {
        GatewayErrorCode::AllProvidersQuotaExceeded.as_str()
    } else if all_auth_rejected {
        GatewayErrorCode::AuthRejected.as_str()
    } else if all_skipped {
        GatewayErrorCode::AllProvidersUnavailable.as_str()
    } else {
        last_error_code.unwrap_or(GatewayErrorCode::UpstreamAllFailed.as_str())
    };
    let message = if all_quota_exceeded {
        format!("all providers quota exceeded for cli_key={cli_key}")
    } else if all_auth_rejected {
        format!("all providers rejected auth for cli_key={cli_key}")
    } else if all_skipped {
        format!("all providers skipped for cli_key={cli_key}")
    } else {
        format!("all providers failed for cli_key={cli_key}")
    };

    // Disk log: all providers tried and failed.
    tracing::error!(
        trace_id = %trace_id,
        error_code = final_error_code,
        all_skipped = all_skipped,
        status = status.as_u16(),
        cli_key = %cli_key,
        attempt_count = attempts.len(),
        duration_ms = %started.elapsed().as_millis(),
        "all providers failed"
    );

    let resp = error_response_with_retry_after(
        status,
        trace_id.clone(),
        final_error_code,
        message.clone(),
        attempts.clone(),
        retry_after_seconds,
    );

    let duration_ms = started.elapsed().as_millis();
    emit_request_event_and_enqueue_request_log(RequestEndArgs {
        deps: RequestEndDeps::new(&state.app, &state.db, &state.log_tx),
        trace_id: trace_id.as_str(),
        cli_key: cli_key.as_str(),
        method: method_hint.as_str(),
        path: forwarded_path.as_str(),
        query: query.as_deref(),
        excluded_from_stats: false,
        status: Some(status.as_u16()),
        error_category: last_error_category,
        error_code: Some(final_error_code),
        duration_ms,
        event_ttfb_ms: None,
        log_ttfb_ms: None,
        attempts: attempts.as_slice(),
        special_settings_json: response_fixer::special_settings_json(&special_settings),
        session_id,
        requested_model,
        oauth_account_id: None,
        created_at_ms,
        created_at,
        usage_metrics: None,
        log_usage_metrics: None,
        usage: None,
    })
    .await;

    if let Some(retry_after_seconds) = retry_after_seconds {
        let mut cache = state.recent_errors.lock_or_recover();
        cache.insert_error(
            now_unix,
            unavailable_fingerprint_key,
            CachedGatewayError {
                trace_id: trace_id.clone(),
                status,
                error_code: final_error_code,
                message: message.clone(),
                retry_after_seconds: Some(retry_after_seconds),
                expires_at_unix: now_unix.saturating_add(retry_after_seconds as i64),
                fingerprint_debug: unavailable_fingerprint_debug.clone(),
            },
        );
        cache.insert_error(
            now_unix,
            fingerprint_key,
            CachedGatewayError {
                trace_id: trace_id.clone(),
                status,
                error_code: final_error_code,
                message,
                retry_after_seconds: Some(retry_after_seconds),
                expires_at_unix: now_unix.saturating_add(retry_after_seconds as i64),
                fingerprint_debug: fingerprint_debug.clone(),
            },
        );
    }

    abort_guard.disarm();
    resp
}

#[cfg(test)]
mod tests {
    use super::{
        all_attempts_auth_rejected, all_attempts_quota_exceeded,
        parse_recover_at_from_attempt_reason, retry_after_for_all_skipped,
        DEFAULT_SKIPPED_RETRY_AFTER_SECS,
    };
    use crate::gateway::events::FailoverAttempt;

    fn skipped_attempt(reason: Option<&str>) -> FailoverAttempt {
        FailoverAttempt {
            provider_id: 1,
            provider_name: "p1".to_string(),
            base_url: "https://example.invalid".to_string(),
            outcome: "skipped".to_string(),
            status: None,
            provider_index: None,
            retry_index: None,
            session_reuse: None,
            error_category: Some("auth"),
            error_code: None,
            decision: Some("skip"),
            reason: reason.map(str::to_string),
            attempt_started_ms: Some(0),
            attempt_duration_ms: Some(0),
            circuit_state_before: None,
            circuit_state_after: None,
            circuit_failure_count: None,
            circuit_failure_threshold: None,
        }
    }

    #[test]
    fn parse_recover_at_from_attempt_reason_extracts_timestamp() {
        let reason = "provider skipped by credential resolution: GATEWAY_SKIP: oauth account 9 quota exceeded until 1700000032";
        assert_eq!(
            parse_recover_at_from_attempt_reason(reason),
            Some(1_700_000_032)
        );
    }

    #[test]
    fn retry_after_for_all_skipped_prefers_quota_recover_hint() {
        let now_unix = 1_700_000_000;
        let attempts = vec![skipped_attempt(Some(
            "provider skipped by credential resolution: GATEWAY_SKIP: oauth account 9 quota exceeded until 1700000042",
        ))];

        assert_eq!(retry_after_for_all_skipped(&attempts, now_unix), 42);
    }

    #[test]
    fn retry_after_for_all_skipped_falls_back_to_default_without_hint() {
        let now_unix = 1_700_000_000;
        let attempts = vec![skipped_attempt(Some(
            "provider skipped by credential resolution: SEC_INVALID_INPUT: oauth account 9 is not active",
        ))];

        assert_eq!(
            retry_after_for_all_skipped(&attempts, now_unix),
            DEFAULT_SKIPPED_RETRY_AFTER_SECS as u64
        );
    }

    #[test]
    fn all_attempts_auth_rejected_matches_401_403_only() {
        let auth_attempts = vec![
            FailoverAttempt {
                status: Some(401),
                ..skipped_attempt(None)
            },
            FailoverAttempt {
                status: Some(403),
                ..skipped_attempt(None)
            },
        ];
        assert!(all_attempts_auth_rejected(&auth_attempts));

        let mixed_attempts = vec![
            FailoverAttempt {
                status: Some(401),
                ..skipped_attempt(None)
            },
            FailoverAttempt {
                status: Some(429),
                ..skipped_attempt(None)
            },
        ];
        assert!(!all_attempts_auth_rejected(&mixed_attempts));
    }

    #[test]
    fn all_attempts_quota_exceeded_detects_quota_skips_and_429() {
        let quota_skip_attempts = vec![skipped_attempt(Some(
            "provider skipped by credential resolution: GATEWAY_SKIP: oauth account 9 quota exceeded until 1700000042",
        ))];
        assert!(all_attempts_quota_exceeded(&quota_skip_attempts));

        let quota_429_attempts = vec![FailoverAttempt {
            status: Some(429),
            reason: Some("status=429 retry_after=30s".to_string()),
            ..skipped_attempt(None)
        }];
        assert!(all_attempts_quota_exceeded(&quota_429_attempts));

        let concurrency_429 = vec![FailoverAttempt {
            status: Some(429),
            reason: Some("status=429 rule=429_concurrency_limit".to_string()),
            ..skipped_attempt(None)
        }];
        assert!(!all_attempts_quota_exceeded(&concurrency_429));
    }
}
