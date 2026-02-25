//! Usage: Gateway proxy failover loop (provider iteration + retries + upstream response handling).

mod attempt_record;
mod claude_model_mapping;
mod context;
mod event_helpers;
mod finalize;
mod provider_gate;
mod provider_limits;
mod request_end_helpers;
mod send;
mod send_timeout;
mod success_event_stream;
mod success_non_stream;
mod thinking_signature_rectifier_400;
mod upstream_error;

use super::super::request_context::RequestContext;
use attempt_record::{
    record_system_failure_and_decide, record_system_failure_and_decide_no_cooldown,
    RecordSystemFailureArgs,
};
use event_helpers::{
    emit_attempt_event_and_log, emit_attempt_event_and_log_with_circuit_before,
    AttemptCircuitFields,
};
use request_end_helpers::{
    emit_request_event_and_enqueue_request_log, RequestEndArgs, RequestEndDeps,
};

use super::super::{
    errors::{classify_upstream_status, error_response},
    failover::{retry_backoff_delay, select_provider_base_url_for_request, FailoverDecision},
    http_util::{
        build_response, has_gzip_content_encoding, has_non_identity_content_encoding,
        is_event_stream, maybe_gunzip_response_body_bytes_with_limit,
    },
    ErrorCategory, GatewayErrorCode,
};

use crate::gateway::oauth::refresh::{
    refresh_account_access_token_with_linear_retry, refreshed_recently, should_refresh_now,
    MIN_REFRESH_RETRY_INTERVAL_SECS,
};
use crate::gateway::oauth::token_exchange::resolve_effective_access_token;
use crate::oauth_accounts::{self, OAuthAccountForGateway, OAuthAccountStatus};
use crate::providers::{ProviderAuthMode, ProviderForGateway};
use crate::usage;
use axum::{
    body::{Body, Bytes},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::gateway::events::{emit_attempt_event, FailoverAttempt, GatewayAttemptEvent};
use crate::gateway::response_fixer;
use crate::gateway::streams::{
    spawn_usage_sse_relay_body, FirstChunkStream, GunzipStream, TimingOnlyTeeStream,
    UsageBodyBufferTeeStream, UsageSseTeeStream,
};
use crate::gateway::thinking_signature_rectifier;
use crate::gateway::util::{
    body_for_introspection, build_target_url, ensure_cli_required_headers, inject_provider_auth,
    now_unix_seconds, strip_hop_headers,
};

use context::{
    build_stream_finalize_ctx, AttemptCtx, CommonCtx, CommonCtxArgs, CommonCtxOwned, LoopControl,
    LoopState, ProviderCtx, ProviderCtxOwned, MAX_NON_SSE_BODY_BYTES,
};

const CODEX_ORIGINATOR_HEADER_VALUE: &str = "codex_cli_rs";
const OAUTH_REFRESH_INLINE_MAX_ATTEMPTS: u32 = 3;

struct FinalizeOwnedCommon {
    cli_key: String,
    method_hint: String,
    forwarded_path: String,
    query: Option<String>,
    trace_id: String,
    session_id: Option<String>,
    requested_model: Option<String>,
    special_settings: Arc<Mutex<Vec<serde_json::Value>>>,
}

fn finalize_owned_from_input(input: &RequestContext) -> FinalizeOwnedCommon {
    FinalizeOwnedCommon {
        cli_key: input.cli_key.clone(),
        method_hint: input.method_hint.clone(),
        forwarded_path: input.forwarded_path.clone(),
        query: input.query.clone(),
        trace_id: input.trace_id.clone(),
        session_id: input.session_id.clone(),
        requested_model: input.requested_model.clone(),
        special_settings: input.special_settings.clone(),
    }
}

fn load_oauth_account_for_provider(
    conn: &rusqlite::Connection,
    cli_key: &str,
    provider: &ProviderForGateway,
) -> crate::shared::error::AppResult<OAuthAccountForGateway> {
    let account_id = provider.oauth_account_id.ok_or_else(|| {
        "SEC_INVALID_INPUT: provider oauth_account_id is required when auth_mode=oauth".to_string()
    })?;
    if account_id <= 0 {
        return Err(format!("SEC_INVALID_INPUT: invalid oauth_account_id={account_id}").into());
    }

    let account = oauth_accounts::get_for_gateway(conn, account_id)?;
    if account.cli_key != cli_key {
        return Err(format!(
            "SEC_INVALID_INPUT: oauth account cli_key mismatch: expected={cli_key}, actual={}",
            account.cli_key
        )
        .into());
    }
    if !matches!(
        account.status,
        OAuthAccountStatus::Active | OAuthAccountStatus::QuotaCooldown
    ) {
        return Err(format!("SEC_INVALID_INPUT: oauth account {account_id} is not active").into());
    }

    Ok(account)
}

fn oauth_token_from_account(
    account: &OAuthAccountForGateway,
) -> crate::shared::error::AppResult<String> {
    let token = account.access_token.trim();
    if token.is_empty() {
        return Err("SEC_INVALID_INPUT: oauth access_token is empty"
            .to_string()
            .into());
    }
    Ok(token.to_string())
}

fn is_codex_chatgpt_backend(
    cli_key: &str,
    provider: &ProviderForGateway,
    provider_base_url: &str,
) -> bool {
    if cli_key != "codex" || !matches!(provider.auth_mode, ProviderAuthMode::Oauth) {
        return false;
    }

    let Ok(url) = reqwest::Url::parse(provider_base_url) else {
        return false;
    };
    let path = url.path().trim_end_matches('/');
    path.ends_with("/backend-api/codex")
}

fn normalize_codex_chatgpt_forwarded_path(forwarded_path: &str) -> String {
    if forwarded_path == "/v1" {
        return "/".to_string();
    }
    if let Some(stripped) = forwarded_path.strip_prefix("/v1/") {
        return format!("/{stripped}");
    }
    forwarded_path.to_string()
}

fn parse_codex_chatgpt_account_id(id_token: Option<&str>) -> Option<String> {
    let token = id_token.map(str::trim).filter(|value| !value.is_empty())?;
    let payload_part = token.split('.').nth(1)?;
    let payload = URL_SAFE_NO_PAD.decode(payload_part).ok().or_else(|| {
        let mut padded = payload_part.to_string();
        while padded.len() % 4 != 0 {
            padded.push('=');
        }
        URL_SAFE_NO_PAD.decode(padded).ok()
    })?;
    let json: serde_json::Value = serde_json::from_slice(&payload).ok()?;
    json.get("https://api.openai.com/auth")
        .and_then(|value| value.get("chatgpt_account_id"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn resolve_codex_chatgpt_account_id(
    state: &crate::gateway::manager::GatewayAppState,
    cli_key: &str,
    provider: &ProviderForGateway,
) -> crate::shared::error::AppResult<Option<String>> {
    if cli_key != "codex" || !matches!(provider.auth_mode, ProviderAuthMode::Oauth) {
        return Ok(None);
    }
    let account_id = provider.oauth_account_id.ok_or_else(|| {
        "SEC_INVALID_INPUT: provider oauth_account_id is required when auth_mode=oauth".to_string()
    })?;
    if account_id <= 0 {
        return Err(format!("SEC_INVALID_INPUT: invalid oauth_account_id={account_id}").into());
    }

    let conn = state.db.open_connection()?;
    let account = oauth_accounts::get_for_gateway(&conn, account_id)?;
    if account.cli_key != "codex" {
        return Ok(None);
    }
    Ok(parse_codex_chatgpt_account_id(account.id_token.as_deref()))
}

fn maybe_inject_codex_chatgpt_headers(headers: &mut HeaderMap, account_id: Option<&str>) {
    if !headers.contains_key("originator") {
        headers.insert(
            "originator",
            HeaderValue::from_static(CODEX_ORIGINATOR_HEADER_VALUE),
        );
    }
    if headers.contains_key("chatgpt-account-id") {
        return;
    }
    let Some(value) = account_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    if let Ok(header_value) = HeaderValue::from_str(value) {
        headers.insert("chatgpt-account-id", header_value);
    }
}

fn maybe_enforce_codex_chatgpt_store_false(
    forwarded_path: &str,
    upstream_body_bytes: &mut Bytes,
    strip_request_content_encoding: &mut bool,
) {
    if forwarded_path != "/responses" {
        return;
    }
    let Ok(mut root) = serde_json::from_slice::<serde_json::Value>(upstream_body_bytes.as_ref())
    else {
        return;
    };
    let Some(obj) = root.as_object_mut() else {
        return;
    };
    let needs_update = !matches!(obj.get("store"), Some(serde_json::Value::Bool(false)));
    if !needs_update {
        return;
    }
    obj.insert("store".to_string(), serde_json::Value::Bool(false));
    if let Ok(encoded) = serde_json::to_vec(&root) {
        *upstream_body_bytes = Bytes::from(encoded);
        *strip_request_content_encoding = true;
    }
}

async fn refresh_oauth_account_inline(
    state: &crate::gateway::manager::GatewayAppState,
    account: &OAuthAccountForGateway,
    now_unix: i64,
) -> crate::shared::error::AppResult<OAuthAccountForGateway> {
    if refreshed_recently(
        account.last_refreshed_at,
        now_unix,
        MIN_REFRESH_RETRY_INTERVAL_SECS,
    ) {
        let conn = state.db.open_connection()?;
        return oauth_accounts::get_for_gateway(&conn, account.id);
    }

    let refreshed = refresh_account_access_token_with_linear_retry(
        &state.client,
        account,
        OAUTH_REFRESH_INLINE_MAX_ATTEMPTS,
    )
    .await?;
    let (effective_access_token, id_token_to_store) =
        resolve_effective_access_token(&account.cli_key, &refreshed, account.id_token.as_deref());
    let expires_at = refreshed.expires_at.or(account.expires_at);
    let conn = state.db.open_connection()?;
    oauth_accounts::update_tokens(
        &conn,
        account.id,
        &effective_access_token,
        id_token_to_store.as_deref(),
        expires_at,
        refreshed.refresh_token.as_deref(),
    )?;
    oauth_accounts::get_for_gateway(&conn, account.id)
}

fn record_oauth_account_refresh_failure(
    state: &crate::gateway::manager::GatewayAppState,
    account_id: i64,
    err_text: &str,
) {
    if let Ok(conn) = state.db.open_connection() {
        let _ = oauth_accounts::record_refresh_failure(&conn, account_id, Some(err_text));
    }
}

async fn resolve_effective_credential(
    state: &crate::gateway::manager::GatewayAppState,
    cli_key: &str,
    provider: &ProviderForGateway,
) -> crate::shared::error::AppResult<String> {
    match provider.auth_mode {
        ProviderAuthMode::ApiKey => {
            let api_key = provider.api_key_plaintext.trim();
            if api_key.is_empty() {
                return Err("SEC_INVALID_INPUT: provider api_key is empty"
                    .to_string()
                    .into());
            }
            Ok(api_key.to_string())
        }
        ProviderAuthMode::Oauth => {
            let now_unix = now_unix_seconds() as i64;
            let mut account = {
                let conn = state.db.open_connection()?;
                let mut account = load_oauth_account_for_provider(&conn, cli_key, provider)?;

                if account.quota_exceeded {
                    match account.quota_recover_at {
                        Some(recover_at) if recover_at > now_unix => {
                            return Err(format!(
                                "GATEWAY_SKIP: oauth account {} quota exceeded until {}",
                                account.id, recover_at
                            )
                            .into());
                        }
                        _ => {
                            if oauth_accounts::clear_quota(&conn, account.id)? {
                                crate::gateway::oauth::quota_cache::invalidate_cli(cli_key);
                            }
                            account = oauth_accounts::get_for_gateway(&conn, account.id)?;
                        }
                    }
                }

                account
            };

            if should_refresh_now(account.expires_at, account.refresh_lead_s, now_unix) {
                match refresh_oauth_account_inline(state, &account, now_unix).await {
                    Ok(updated) => account = updated,
                    Err(err) => {
                        let err_text = err.to_string();
                        record_oauth_account_refresh_failure(state, account.id, &err_text);
                        let fallback_token_still_valid = account
                            .expires_at
                            .map(|expires_at| expires_at > now_unix)
                            .unwrap_or(false);
                        if fallback_token_still_valid {
                            tracing::warn!(
                                oauth_account_id = account.id,
                                cli_key = %cli_key,
                                "oauth inline refresh failed; fallback to existing token: {}",
                                err_text
                            );
                        } else {
                            return Err(err);
                        }
                    }
                }
            }

            oauth_token_from_account(&account)
        }
    }
}

async fn refresh_oauth_credential_after_401(
    state: &crate::gateway::manager::GatewayAppState,
    cli_key: &str,
    provider: &ProviderForGateway,
) -> crate::shared::error::AppResult<String> {
    if !matches!(provider.auth_mode, ProviderAuthMode::Oauth) {
        return Err("SEC_INVALID_INPUT: provider is not oauth mode"
            .to_string()
            .into());
    }

    let account = {
        let conn = state.db.open_connection()?;
        load_oauth_account_for_provider(&conn, cli_key, provider)?
    };
    let now_unix = now_unix_seconds() as i64;
    let refreshed = refresh_oauth_account_inline(state, &account, now_unix)
        .await
        .or_else(|err| {
            let err_text = err.to_string();
            record_oauth_account_refresh_failure(state, account.id, &err_text);
            Err(err)
        })?;

    oauth_token_from_account(&refreshed)
}

pub(super) async fn run(mut input: RequestContext) -> Response {
    let method = input.req_method.clone();
    let started = input.started;
    let created_at_ms = input.created_at_ms;
    let created_at = input.created_at;

    let introspection_body = body_for_introspection(&input.base_headers, input.body_bytes.as_ref());
    let ctx = CommonCtx::from(CommonCtxArgs {
        state: &input.state,
        cli_key: &input.cli_key,
        forwarded_path: &input.forwarded_path,
        method_hint: &input.method_hint,
        query: &input.query,
        trace_id: &input.trace_id,
        started,
        created_at_ms,
        created_at,
        session_id: &input.session_id,
        requested_model: &input.requested_model,
        effective_sort_mode_id: input.effective_sort_mode_id,
        special_settings: &input.special_settings,
        provider_cooldown_secs: input.provider_cooldown_secs,
        upstream_first_byte_timeout_secs: input.upstream_first_byte_timeout_secs,
        upstream_bootstrap_retries: input.upstream_bootstrap_retries,
        upstream_first_byte_timeout: input.upstream_first_byte_timeout,
        upstream_stream_idle_timeout: input.upstream_stream_idle_timeout,
        upstream_request_timeout_non_streaming: input.upstream_request_timeout_non_streaming,
        max_attempts_per_provider: input.max_attempts_per_provider,
        enable_response_fixer: input.enable_response_fixer,
        response_fixer_stream_config: input.response_fixer_stream_config,
        response_fixer_non_stream_config: input.response_fixer_non_stream_config,
        introspection_body: introspection_body.as_ref(),
    });
    let mut attempts: Vec<FailoverAttempt> = Vec::new();
    let mut failed_provider_ids: HashSet<i64> = HashSet::new();
    let mut last_error_category: Option<&'static str> = None;
    let mut last_error_code: Option<&'static str> = None;

    let max_providers_to_try = (input.max_providers_to_try as usize).max(1);
    let mut providers_tried: usize = 0;
    let mut earliest_available_unix: Option<i64> = None;
    let mut skipped_open: usize = 0;
    let mut skipped_cooldown: usize = 0;
    let mut skipped_limits: usize = 0;

    for provider in input.providers.iter() {
        if providers_tried >= max_providers_to_try {
            break;
        }

        let provider_id = provider.id;
        let provider_name_base = if provider.name.trim().is_empty() {
            format!("Provider #{} (auto-fixed)", provider.id)
        } else {
            provider.name.clone()
        };
        let provider_base_url_display = provider
            .base_urls
            .first()
            .cloned()
            .unwrap_or_else(String::new);

        if failed_provider_ids.contains(&provider_id) {
            continue;
        }

        let Some(gate_allow) = provider_gate::gate_provider(provider_gate::ProviderGateInput {
            ctx,
            provider_id,
            provider_name_base: &provider_name_base,
            provider_base_url_display: &provider_base_url_display,
            earliest_available_unix: &mut earliest_available_unix,
            skipped_open: &mut skipped_open,
            skipped_cooldown: &mut skipped_cooldown,
        }) else {
            // Record skipped provider (circuit breaker gate)
            attempts.push(FailoverAttempt {
                provider_id,
                provider_name: provider_name_base.clone(),
                base_url: provider_base_url_display.clone(),
                outcome: "skipped".to_string(),
                status: None,
                provider_index: None,
                retry_index: None,
                session_reuse: None,
                error_category: Some("circuit_breaker"),
                error_code: Some(GatewayErrorCode::ProviderCircuitOpen.as_str()),
                decision: Some("skip"),
                reason: Some("provider skipped by circuit breaker".to_string()),
                attempt_started_ms: Some(started.elapsed().as_millis()),
                attempt_duration_ms: Some(0),
                circuit_state_before: None,
                circuit_state_after: None,
                circuit_failure_count: None,
                circuit_failure_threshold: None,
            });
            continue;
        };

        if !provider_limits::gate_provider(provider_limits::ProviderLimitsInput {
            ctx,
            provider,
            earliest_available_unix: &mut earliest_available_unix,
            skipped_limits: &mut skipped_limits,
        }) {
            // Record skipped provider (rate limit gate)
            attempts.push(FailoverAttempt {
                provider_id,
                provider_name: provider_name_base.clone(),
                base_url: provider_base_url_display.clone(),
                outcome: "skipped".to_string(),
                status: None,
                provider_index: None,
                retry_index: None,
                session_reuse: None,
                error_category: Some("rate_limit"),
                error_code: Some(GatewayErrorCode::ProviderRateLimited.as_str()),
                decision: Some("skip"),
                reason: Some("provider skipped by rate limit".to_string()),
                attempt_started_ms: Some(started.elapsed().as_millis()),
                attempt_duration_ms: Some(0),
                circuit_state_before: None,
                circuit_state_after: None,
                circuit_failure_count: None,
                circuit_failure_threshold: None,
            });
            continue;
        }

        let mut effective_credential =
            match resolve_effective_credential(&input.state, &input.cli_key, provider).await {
                Ok(value) => value,
                Err(err) => {
                    let err_text = err.to_string();
                    tracing::warn!(
                        trace_id = %input.trace_id,
                        cli_key = %input.cli_key,
                        provider_id = provider_id,
                        provider_name = %provider_name_base,
                        "provider skipped by credential resolution: {}",
                        err_text
                    );
                    attempts.push(FailoverAttempt {
                        provider_id,
                        provider_name: provider_name_base.clone(),
                        base_url: provider_base_url_display.clone(),
                        outcome: "skipped".to_string(),
                        status: None,
                        provider_index: None,
                        retry_index: None,
                        session_reuse: None,
                        error_category: Some("auth"),
                        error_code: Some(GatewayErrorCode::InternalError.as_str()),
                        decision: Some("skip"),
                        reason: Some(format!(
                            "provider skipped by credential resolution: {err_text}"
                        )),
                        attempt_started_ms: Some(started.elapsed().as_millis()),
                        attempt_duration_ms: Some(0),
                        circuit_state_before: None,
                        circuit_state_after: None,
                        circuit_failure_count: None,
                        circuit_failure_threshold: None,
                    });
                    continue;
                }
            };

        let provider_max_attempts = if matches!(provider.auth_mode, ProviderAuthMode::Oauth) {
            input.max_attempts_per_provider.max(2)
        } else {
            input.max_attempts_per_provider
        };
        let mut oauth_reactive_refreshed_once = false;
        let ctx = CommonCtx {
            max_attempts_per_provider: provider_max_attempts,
            ..ctx
        };

        // NOTE: model whitelist filtering removed (Claude uses slot-based model mapping).

        let provider_base_url_base = select_provider_base_url_for_request(
            &input.state,
            provider,
            input.provider_base_url_ping_cache_ttl_seconds,
        )
        .await;
        let use_codex_chatgpt_backend =
            is_codex_chatgpt_backend(&input.cli_key, provider, &provider_base_url_base);
        let mut codex_chatgpt_account_id = if use_codex_chatgpt_backend {
            match resolve_codex_chatgpt_account_id(&input.state, &input.cli_key, provider) {
                Ok(value) => value,
                Err(err) => {
                    tracing::warn!(
                        provider_id = provider.id,
                        cli_key = %input.cli_key,
                        "failed to resolve codex ChatGPT account id from oauth account: {}",
                        err
                    );
                    None
                }
            }
        } else {
            None
        };

        let mut circuit_snapshot = gate_allow.circuit_after;

        providers_tried = providers_tried.saturating_add(1);
        let provider_index = providers_tried as u32;
        let session_reuse = match input.session_bound_provider_id {
            Some(id) => (id == provider_id && provider_index == 1).then_some(true),
            None => None,
        };
        let provider_ctx = ProviderCtx {
            provider_id,
            provider_name_base: &provider_name_base,
            provider_base_url_base: &provider_base_url_base,
            provider_index,
            session_reuse,
            oauth_account_id: provider.oauth_account_id,
        };

        let mut upstream_forwarded_path = input.forwarded_path.clone();
        let mut upstream_query = input.query.clone();
        let mut upstream_body_bytes = input.body_bytes.clone();
        let mut strip_request_content_encoding = input.strip_request_content_encoding_seed;
        let mut thinking_signature_rectifier_retried = false;

        claude_model_mapping::apply_if_needed(
            ctx,
            provider,
            provider_ctx,
            input.requested_model_location,
            input.introspection_json.as_ref(),
            claude_model_mapping::UpstreamRequestMut {
                forwarded_path: &mut upstream_forwarded_path,
                query: &mut upstream_query,
                body_bytes: &mut upstream_body_bytes,
                strip_request_content_encoding: &mut strip_request_content_encoding,
            },
        );
        if use_codex_chatgpt_backend {
            upstream_forwarded_path =
                normalize_codex_chatgpt_forwarded_path(&upstream_forwarded_path);
            maybe_enforce_codex_chatgpt_store_false(
                &upstream_forwarded_path,
                &mut upstream_body_bytes,
                &mut strip_request_content_encoding,
            );
        }

        for retry_index in 1..=provider_max_attempts {
            let attempt_index = attempts.len().saturating_add(1) as u32;
            let attempt_started_ms = started.elapsed().as_millis();
            let attempt_started = Instant::now();
            let circuit_before = circuit_snapshot.clone();
            let attempt_ctx = AttemptCtx {
                attempt_index,
                retry_index,
                attempt_started_ms,
                attempt_started,
                circuit_before: &circuit_before,
            };

            let url = match build_target_url(
                &provider_base_url_base,
                &upstream_forwarded_path,
                upstream_query.as_deref(),
            ) {
                Ok(u) => u,
                Err(err) => {
                    let category = ErrorCategory::SystemError;
                    let error_code = GatewayErrorCode::InternalError.as_str();
                    let decision = FailoverDecision::SwitchProvider;

                    let outcome = format!(
                        "build_target_url_error: category={} code={} decision={} err={err}",
                        category.as_str(),
                        error_code,
                        decision.as_str(),
                    );
                    let loop_state = LoopState::new(
                        &mut attempts,
                        &mut failed_provider_ids,
                        &mut last_error_category,
                        &mut last_error_code,
                        &mut circuit_snapshot,
                        &mut input.abort_guard,
                    );
                    match record_system_failure_and_decide_no_cooldown(RecordSystemFailureArgs {
                        ctx,
                        provider_ctx,
                        attempt_ctx,
                        loop_state,
                        status: None,
                        error_code,
                        decision,
                        outcome,
                        reason: format!("invalid base_url: {err}"),
                    })
                    .await
                    {
                        LoopControl::ContinueRetry => continue,
                        LoopControl::BreakRetry => break,
                        LoopControl::Return(resp) => return resp,
                    }
                }
            };

            // Realtime routing UX: emit an attempt event as soon as a provider is selected (before awaiting upstream).
            //
            // Note: do NOT enqueue attempt_logs for this "started" event (avoid DB noise/IO); completion events still get persisted.
            emit_attempt_event(
                &input.state.app,
                GatewayAttemptEvent {
                    trace_id: input.trace_id.clone(),
                    cli_key: input.cli_key.clone(),
                    method: input.method_hint.clone(),
                    path: input.forwarded_path.clone(),
                    query: input.query.clone(),
                    attempt_index,
                    provider_id,
                    session_reuse,
                    provider_name: provider_name_base.clone(),
                    base_url: provider_base_url_base.clone(),
                    outcome: "started".to_string(),
                    status: None,
                    attempt_started_ms,
                    attempt_duration_ms: 0,
                    circuit_state_before: Some(circuit_before.state.as_str()),
                    circuit_state_after: None,
                    circuit_failure_count: Some(circuit_before.failure_count),
                    circuit_failure_threshold: Some(circuit_before.failure_threshold),
                },
            );

            let mut headers = input.base_headers.clone();
            ensure_cli_required_headers(&input.cli_key, &mut headers);

            // Always override auth headers to avoid leaking any official OAuth tokens to a third-party relay base_url.
            inject_provider_auth(&input.cli_key, effective_credential.trim(), &mut headers);
            if use_codex_chatgpt_backend {
                maybe_inject_codex_chatgpt_headers(
                    &mut headers,
                    codex_chatgpt_account_id.as_deref(),
                );
            }
            if strip_request_content_encoding {
                headers.remove(header::CONTENT_ENCODING);
            }

            let send_result = send::send_upstream(
                ctx,
                method.clone(),
                url,
                headers,
                upstream_body_bytes.clone(),
            )
            .await;

            match send_result {
                send::SendResult::Ok(resp) => {
                    let status = resp.status();
                    let response_headers = resp.headers().clone();

                    if status.is_success() {
                        if is_event_stream(&response_headers) {
                            let loop_state = LoopState::new(
                                &mut attempts,
                                &mut failed_provider_ids,
                                &mut last_error_category,
                                &mut last_error_code,
                                &mut circuit_snapshot,
                                &mut input.abort_guard,
                            );
                            match success_event_stream::handle_success_event_stream(
                                ctx,
                                provider_ctx,
                                attempt_ctx,
                                loop_state,
                                resp,
                                status,
                                response_headers,
                            )
                            .await
                            {
                                LoopControl::ContinueRetry => continue,
                                LoopControl::BreakRetry => break,
                                LoopControl::Return(resp) => return resp,
                            }
                        }

                        let loop_state = LoopState::new(
                            &mut attempts,
                            &mut failed_provider_ids,
                            &mut last_error_category,
                            &mut last_error_code,
                            &mut circuit_snapshot,
                            &mut input.abort_guard,
                        );
                        match success_non_stream::handle_success_non_stream(
                            ctx,
                            provider_ctx,
                            attempt_ctx,
                            loop_state,
                            resp,
                            status,
                            response_headers,
                        )
                        .await
                        {
                            LoopControl::ContinueRetry => continue,
                            LoopControl::BreakRetry => break,
                            LoopControl::Return(resp) => return resp,
                        }
                    }

                    if status.as_u16() == 401
                        && matches!(provider.auth_mode, ProviderAuthMode::Oauth)
                        && !oauth_reactive_refreshed_once
                    {
                        oauth_reactive_refreshed_once = true;
                        match refresh_oauth_credential_after_401(
                            &input.state,
                            &input.cli_key,
                            provider,
                        )
                        .await
                        {
                            Ok(refreshed_credential) => {
                                effective_credential = refreshed_credential;
                                if use_codex_chatgpt_backend {
                                    codex_chatgpt_account_id =
                                        match resolve_codex_chatgpt_account_id(
                                            &input.state,
                                            &input.cli_key,
                                            provider,
                                        ) {
                                            Ok(value) => value,
                                            Err(err) => {
                                                tracing::warn!(
                                                    provider_id = provider.id,
                                                    cli_key = %input.cli_key,
                                                    "failed to resolve codex ChatGPT account id after oauth refresh: {}",
                                                    err
                                                );
                                                None
                                            }
                                        };
                                }
                                continue;
                            }
                            Err(err) => {
                                tracing::warn!(
                                    provider_id = provider.id,
                                    cli_key = %input.cli_key,
                                    "oauth reactive refresh failed: {}",
                                    err
                                );
                            }
                        }
                    }

                    let loop_state = LoopState::new(
                        &mut attempts,
                        &mut failed_provider_ids,
                        &mut last_error_category,
                        &mut last_error_code,
                        &mut circuit_snapshot,
                        &mut input.abort_guard,
                    );
                    match upstream_error::handle_non_success_response(
                        ctx,
                        provider_ctx,
                        attempt_ctx,
                        loop_state,
                        input.enable_thinking_signature_rectifier,
                        resp,
                        upstream_error::UpstreamRequestState {
                            upstream_body_bytes: &mut upstream_body_bytes,
                            strip_request_content_encoding: &mut strip_request_content_encoding,
                            thinking_signature_rectifier_retried:
                                &mut thinking_signature_rectifier_retried,
                        },
                    )
                    .await
                    {
                        LoopControl::ContinueRetry => continue,
                        LoopControl::BreakRetry => break,
                        LoopControl::Return(resp) => return resp,
                    }
                }
                send::SendResult::Timeout => {
                    let loop_state = LoopState::new(
                        &mut attempts,
                        &mut failed_provider_ids,
                        &mut last_error_category,
                        &mut last_error_code,
                        &mut circuit_snapshot,
                        &mut input.abort_guard,
                    );
                    match send_timeout::handle_timeout(ctx, provider_ctx, attempt_ctx, loop_state)
                        .await
                    {
                        LoopControl::ContinueRetry => continue,
                        LoopControl::BreakRetry => break,
                        LoopControl::Return(resp) => return resp,
                    }
                }
                send::SendResult::Err(err) => {
                    let loop_state = LoopState::new(
                        &mut attempts,
                        &mut failed_provider_ids,
                        &mut last_error_category,
                        &mut last_error_code,
                        &mut circuit_snapshot,
                        &mut input.abort_guard,
                    );
                    match upstream_error::handle_reqwest_error(
                        ctx,
                        provider_ctx,
                        attempt_ctx,
                        loop_state,
                        err,
                    )
                    .await
                    {
                        LoopControl::ContinueRetry => continue,
                        LoopControl::BreakRetry => break,
                        LoopControl::Return(resp) => return resp,
                    }
                }
            }
        }
    }

    if attempts.is_empty() && !input.providers.is_empty() {
        let owned = finalize_owned_from_input(&input);
        return finalize::all_providers_unavailable(finalize::AllUnavailableInput {
            state: &input.state,
            abort_guard: &mut input.abort_guard,
            cli_key: owned.cli_key,
            method_hint: owned.method_hint,
            forwarded_path: owned.forwarded_path,
            query: owned.query,
            trace_id: owned.trace_id,
            started,
            created_at_ms,
            created_at,
            session_id: owned.session_id,
            requested_model: owned.requested_model,
            special_settings: owned.special_settings,
            earliest_available_unix,
            skipped_open,
            skipped_cooldown,
            skipped_limits,
            fingerprint_key: input.fingerprint_key,
            fingerprint_debug: input.fingerprint_debug.clone(),
            unavailable_fingerprint_key: input.unavailable_fingerprint_key,
            unavailable_fingerprint_debug: input.unavailable_fingerprint_debug.clone(),
        })
        .await;
    }

    let owned = finalize_owned_from_input(&input);
    finalize::all_providers_failed(finalize::AllFailedInput {
        state: &input.state,
        abort_guard: &mut input.abort_guard,
        attempts,
        last_error_category,
        last_error_code,
        cli_key: owned.cli_key,
        method_hint: owned.method_hint,
        forwarded_path: owned.forwarded_path,
        query: owned.query,
        trace_id: owned.trace_id,
        started,
        created_at_ms,
        created_at,
        session_id: owned.session_id,
        requested_model: owned.requested_model,
        special_settings: owned.special_settings,
        fingerprint_key: input.fingerprint_key,
        fingerprint_debug: input.fingerprint_debug.clone(),
        unavailable_fingerprint_key: input.unavailable_fingerprint_key,
        unavailable_fingerprint_debug: input.unavailable_fingerprint_debug.clone(),
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderMap;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;

    fn encode_payload(payload: &serde_json::Value) -> String {
        URL_SAFE_NO_PAD.encode(serde_json::to_vec(payload).expect("serialize payload"))
    }

    #[test]
    fn normalize_codex_chatgpt_forwarded_path_strips_v1_prefix() {
        assert_eq!(
            normalize_codex_chatgpt_forwarded_path("/v1/responses"),
            "/responses"
        );
        assert_eq!(normalize_codex_chatgpt_forwarded_path("/v1"), "/");
        assert_eq!(
            normalize_codex_chatgpt_forwarded_path("/responses"),
            "/responses"
        );
    }

    #[test]
    fn parse_codex_chatgpt_account_id_reads_openai_auth_claim() {
        let payload = serde_json::json!({
            "https://api.openai.com/auth": {
                "chatgpt_account_id": "acc_123"
            }
        });
        let token = format!("x.{}.x", encode_payload(&payload));
        assert_eq!(
            parse_codex_chatgpt_account_id(Some(token.as_str())).as_deref(),
            Some("acc_123")
        );
    }

    #[test]
    fn maybe_enforce_codex_chatgpt_store_false_sets_store() {
        let mut body = Bytes::from_static(br#"{"model":"gpt-5.3-codex","stream":true}"#);
        let mut strip = false;
        maybe_enforce_codex_chatgpt_store_false("/responses", &mut body, &mut strip);
        let parsed: serde_json::Value =
            serde_json::from_slice(body.as_ref()).expect("valid json body");
        assert_eq!(parsed.get("store"), Some(&serde_json::Value::Bool(false)));
        assert!(strip);
    }

    #[test]
    fn maybe_inject_codex_chatgpt_headers_adds_originator_and_account() {
        let mut headers = HeaderMap::new();
        maybe_inject_codex_chatgpt_headers(&mut headers, Some("acc_123"));
        assert_eq!(
            headers.get("originator").and_then(|v| v.to_str().ok()),
            Some("codex_cli_rs")
        );
        assert_eq!(
            headers
                .get("chatgpt-account-id")
                .and_then(|v| v.to_str().ok()),
            Some("acc_123")
        );
    }

    #[test]
    fn oauth_token_from_account_accepts_jwt_shaped_codex_token() {
        let account = OAuthAccountForGateway {
            id: 7,
            cli_key: "codex".to_string(),
            access_token: " eyJ.mock.jwt ".to_string(),
            refresh_token: None,
            id_token: None,
            token_uri: None,
            client_id: None,
            client_secret: None,
            expires_at: None,
            refresh_lead_s: 3600,
            status: OAuthAccountStatus::Active,
            quota_exceeded: false,
            quota_recover_at: None,
            last_refreshed_at: None,
        };

        let token = oauth_token_from_account(&account).expect("jwt-like token should be accepted");
        assert_eq!(token, "eyJ.mock.jwt");
    }
}
