//! Usage: Gateway proxy handler implementation (request forwarding + failover + circuit breaker + logging).
//!
//! Note: this module is being split into smaller submodules under `handler/`.

use super::caches::RECENT_TRACE_DEDUP_TTL_SECS;
use super::request_context::{RequestContext, RequestContextParts};
use super::request_end::{
    emit_request_event_and_enqueue_request_log, emit_request_event_and_spawn_request_log,
    RequestEndArgs, RequestEndDeps,
};
use super::{
    cli_proxy_guard::cli_proxy_enabled_cached,
    errors::{error_response, error_response_with_retry_after},
    failover::{select_next_provider_id_from_order, should_reuse_provider},
    is_claude_count_tokens_request,
};
use super::{ErrorCategory, GatewayErrorCode};

use crate::shared::mutex_ext::MutexExt;
use crate::{providers, session_manager, settings, usage};
use axum::{
    body::{to_bytes, Body, Bytes},
    http::{header, HeaderValue, Request, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use super::super::codex_session_id;
use super::super::events::{emit_gateway_log, emit_request_start_event};
use super::super::manager::GatewayAppState;
use super::super::response_fixer;
use super::super::util::{
    body_for_introspection, compute_all_providers_unavailable_fingerprint,
    compute_request_fingerprint, extract_idempotency_key_hash, infer_requested_model_info,
    new_trace_id, now_unix_millis, now_unix_seconds, MAX_REQUEST_BODY_BYTES,
};
use super::super::warmup;

const DEFAULT_FAILOVER_MAX_ATTEMPTS_PER_PROVIDER: u32 = 5;
const DEFAULT_FAILOVER_MAX_PROVIDERS_TO_TRY: u32 = 5;

#[derive(Debug, Clone, Copy)]
enum EarlyErrorKind {
    CliProxyDisabled,
    BodyTooLarge,
    InvalidCliKey,
    NoEnabledProvider,
}

#[derive(Debug, Clone, Copy)]
struct EarlyErrorContract {
    status: StatusCode,
    error_code: &'static str,
    error_category: Option<&'static str>,
    excluded_from_stats: bool,
}

fn early_error_contract(kind: EarlyErrorKind) -> EarlyErrorContract {
    match kind {
        EarlyErrorKind::CliProxyDisabled => EarlyErrorContract {
            status: StatusCode::FORBIDDEN,
            error_code: GatewayErrorCode::CliProxyDisabled.as_str(),
            error_category: Some(ErrorCategory::NonRetryableClientError.as_str()),
            excluded_from_stats: true,
        },
        EarlyErrorKind::BodyTooLarge => EarlyErrorContract {
            status: StatusCode::PAYLOAD_TOO_LARGE,
            error_code: GatewayErrorCode::BodyTooLarge.as_str(),
            error_category: None,
            excluded_from_stats: false,
        },
        EarlyErrorKind::InvalidCliKey => EarlyErrorContract {
            status: StatusCode::BAD_REQUEST,
            error_code: GatewayErrorCode::InvalidCliKey.as_str(),
            error_category: None,
            excluded_from_stats: false,
        },
        EarlyErrorKind::NoEnabledProvider => EarlyErrorContract {
            status: StatusCode::SERVICE_UNAVAILABLE,
            error_code: GatewayErrorCode::NoEnabledProvider.as_str(),
            error_category: None,
            excluded_from_stats: false,
        },
    }
}

fn body_too_large_message(err: &str) -> String {
    format!("failed to read request body: {err}")
}

fn no_enabled_provider_message(cli_key: &str) -> String {
    format!("no enabled provider for cli_key={cli_key}")
}

fn cli_proxy_disabled_message(cli_key: &str, error: Option<&str>) -> String {
    match error {
        Some(err) => format!(
            "CLI 代理状态读取失败（按未开启处理）：{err}；请在首页开启 {cli_key} 的 CLI 代理开关后重试"
        ),
        None => format!("CLI 代理未开启：请在首页开启 {cli_key} 的 CLI 代理开关后重试"),
    }
}

fn cli_proxy_guard_special_settings_json(
    cache_hit: bool,
    cache_ttl_ms: i64,
    error: Option<&str>,
) -> String {
    serde_json::json!([{
        "type": "cli_proxy_guard",
        "scope": "request",
        "hit": true,
        "enabled": false,
        "cacheHit": cache_hit,
        "cacheTtlMs": cache_ttl_ms,
        "error": error,
    }])
    .to_string()
}

pub(in crate::gateway) async fn proxy_impl(
    state: GatewayAppState,
    cli_key: String,
    forwarded_path: String,
    req: Request<Body>,
) -> Response {
    let started = Instant::now();
    let mut trace_id = new_trace_id();
    let created_at_ms = now_unix_millis() as i64;
    let created_at = (created_at_ms / 1000).max(0);
    let method = req.method().clone();
    let method_hint = method.to_string();
    let query = req.uri().query().map(str::to_string);
    let is_claude_count_tokens = is_claude_count_tokens_request(&cli_key, &forwarded_path);

    if crate::shared::cli_key::is_supported_cli_key(cli_key.as_str()) {
        let enabled_snapshot = cli_proxy_enabled_cached(&state.app, &cli_key);
        if !enabled_snapshot.enabled {
            if !enabled_snapshot.cache_hit {
                if let Some(err) = enabled_snapshot.error.as_deref() {
                    emit_gateway_log(
                        &state.app,
                        "warn",
                        GatewayErrorCode::CliProxyGuardError.as_str(),
                        format!(
                            "CLI 代理开关状态读取失败（按未开启处理）cli={cli_key} trace_id={trace_id} err={err}"
                        ),
                    );
                }
            }

            let contract = early_error_contract(EarlyErrorKind::CliProxyDisabled);
            let message = cli_proxy_disabled_message(&cli_key, enabled_snapshot.error.as_deref());
            let resp = error_response(
                contract.status,
                trace_id.clone(),
                contract.error_code,
                message,
                vec![],
            );

            let special_settings_json = cli_proxy_guard_special_settings_json(
                enabled_snapshot.cache_hit,
                enabled_snapshot.cache_ttl_ms,
                enabled_snapshot.error.as_deref(),
            );

            let duration_ms = started.elapsed().as_millis();
            emit_request_event_and_enqueue_request_log(RequestEndArgs {
                deps: RequestEndDeps::new(&state.app, &state.db, &state.log_tx),
                trace_id: trace_id.as_str(),
                cli_key: cli_key.as_str(),
                method: method_hint.as_str(),
                path: forwarded_path.as_str(),
                query: query.as_deref(),
                excluded_from_stats: contract.excluded_from_stats,
                status: Some(contract.status.as_u16()),
                error_category: contract.error_category,
                error_code: Some(contract.error_code),
                duration_ms,
                event_ttfb_ms: None,
                log_ttfb_ms: None,
                attempts: &[],
                special_settings_json: Some(special_settings_json),
                session_id: None,
                requested_model: None,
                created_at_ms,
                created_at,
                usage_metrics: None,
                log_usage_metrics: None,
                usage: None,
            })
            .await;

            return resp;
        }
    }

    let (mut headers, body) = {
        let (parts, body) = req.into_parts();
        (parts.headers, body)
    };

    let mut body_bytes = match to_bytes(body, MAX_REQUEST_BODY_BYTES).await {
        Ok(bytes) => bytes,
        Err(err) => {
            let contract = early_error_contract(EarlyErrorKind::BodyTooLarge);
            let resp = error_response(
                contract.status,
                trace_id.clone(),
                contract.error_code,
                body_too_large_message(&err.to_string()),
                vec![],
            );

            let duration_ms = started.elapsed().as_millis();
            emit_request_event_and_enqueue_request_log(RequestEndArgs {
                deps: RequestEndDeps::new(&state.app, &state.db, &state.log_tx),
                trace_id: trace_id.as_str(),
                cli_key: cli_key.as_str(),
                method: method_hint.as_str(),
                path: forwarded_path.as_str(),
                query: query.as_deref(),
                excluded_from_stats: contract.excluded_from_stats,
                status: Some(contract.status.as_u16()),
                error_category: contract.error_category,
                error_code: Some(contract.error_code),
                duration_ms,
                event_ttfb_ms: None,
                log_ttfb_ms: None,
                attempts: &[],
                special_settings_json: None,
                session_id: None,
                requested_model: None,
                created_at_ms,
                created_at,
                usage_metrics: None,
                log_usage_metrics: None,
                usage: None,
            })
            .await;
            return resp;
        }
    };

    let mut introspection_json = {
        let introspection_body = body_for_introspection(&headers, &body_bytes);
        serde_json::from_slice::<serde_json::Value>(introspection_body.as_ref()).ok()
    };
    let requested_model_info = infer_requested_model_info(
        &forwarded_path,
        query.as_deref(),
        introspection_json.as_ref(),
    );
    let requested_model = requested_model_info.model;
    let requested_model_location = requested_model_info.location;

    let settings_cfg = settings::read(&state.app).ok();
    let intercept_warmup = settings_cfg
        .as_ref()
        .map(|cfg| cfg.intercept_anthropic_warmup_requests)
        .unwrap_or(false);
    let enable_thinking_signature_rectifier = settings_cfg
        .as_ref()
        .map(|cfg| cfg.enable_thinking_signature_rectifier)
        .unwrap_or(true);
    let enable_thinking_signature_rectifier =
        enable_thinking_signature_rectifier && !is_claude_count_tokens;
    let enable_response_fixer = settings_cfg
        .as_ref()
        .map(|cfg| cfg.enable_response_fixer)
        .unwrap_or(true);
    let response_fixer_fix_encoding = settings_cfg
        .as_ref()
        .map(|cfg| cfg.response_fixer_fix_encoding)
        .unwrap_or(true);
    let response_fixer_fix_sse_format = settings_cfg
        .as_ref()
        .map(|cfg| cfg.response_fixer_fix_sse_format)
        .unwrap_or(true);
    let response_fixer_fix_truncated_json = settings_cfg
        .as_ref()
        .map(|cfg| cfg.response_fixer_fix_truncated_json)
        .unwrap_or(true);
    let response_fixer_max_json_depth = settings_cfg
        .as_ref()
        .map(|cfg| cfg.response_fixer_max_json_depth)
        .unwrap_or(response_fixer::DEFAULT_MAX_JSON_DEPTH as u32);
    let response_fixer_max_fix_size = settings_cfg
        .as_ref()
        .map(|cfg| cfg.response_fixer_max_fix_size)
        .unwrap_or(response_fixer::DEFAULT_MAX_FIX_SIZE as u32);
    let provider_base_url_ping_cache_ttl_seconds = settings_cfg
        .as_ref()
        .map(|cfg| cfg.provider_base_url_ping_cache_ttl_seconds)
        .unwrap_or(settings::DEFAULT_PROVIDER_BASE_URL_PING_CACHE_TTL_SECONDS);
    let enable_codex_session_id_completion = settings_cfg
        .as_ref()
        .map(|cfg| cfg.enable_codex_session_id_completion)
        .unwrap_or(true);

    let response_fixer_stream_config = response_fixer::ResponseFixerConfig {
        fix_encoding: response_fixer_fix_encoding,
        fix_sse_format: response_fixer_fix_sse_format,
        fix_truncated_json: response_fixer_fix_truncated_json,
        max_json_depth: response_fixer_max_json_depth as usize,
        max_fix_size: response_fixer_max_fix_size as usize,
    };
    let response_fixer_non_stream_config = response_fixer::ResponseFixerConfig {
        fix_encoding: response_fixer_fix_encoding,
        fix_sse_format: false,
        fix_truncated_json: response_fixer_fix_truncated_json,
        max_json_depth: response_fixer_max_json_depth as usize,
        max_fix_size: response_fixer_max_fix_size as usize,
    };

    let is_warmup_request = if cli_key == "claude" && intercept_warmup {
        let introspection_body = body_for_introspection(&headers, &body_bytes);
        warmup::is_anthropic_warmup_request(&forwarded_path, introspection_body.as_ref())
    } else {
        false
    };

    if is_warmup_request {
        let duration_ms = started.elapsed().as_millis();
        let response_body =
            warmup::build_warmup_response_body(requested_model.as_deref(), &trace_id);

        let special_settings_json = serde_json::json!([{
            "type": "warmup_intercept",
            "scope": "request",
            "hit": true,
            "reason": "anthropic_warmup_intercepted",
            "note": "已由 aio-coding-hub 抢答，未转发上游；写入日志但排除统计",
        }])
        .to_string();

        emit_request_start_event(
            &state.app,
            trace_id.clone(),
            cli_key.clone(),
            method_hint.clone(),
            forwarded_path.clone(),
            query.clone(),
            requested_model.clone(),
            created_at,
        );
        let warmup_attempts = [super::super::events::FailoverAttempt {
            provider_id: 0,
            provider_name: "Warmup".to_string(),
            base_url: "/__aio__/warmup".to_string(),
            outcome: "success".to_string(),
            status: Some(StatusCode::OK.as_u16()),
            provider_index: None,
            retry_index: None,
            session_reuse: Some(false),
            error_category: None,
            error_code: None,
            decision: None,
            reason: None,
            attempt_started_ms: None,
            attempt_duration_ms: None,
            circuit_state_before: None,
            circuit_state_after: None,
            circuit_failure_count: None,
            circuit_failure_threshold: None,
        }];

        emit_request_event_and_spawn_request_log(RequestEndArgs {
            deps: RequestEndDeps::new(&state.app, &state.db, &state.log_tx),
            trace_id: trace_id.as_str(),
            cli_key: cli_key.as_str(),
            method: method_hint.as_str(),
            path: forwarded_path.as_str(),
            query: query.as_deref(),
            excluded_from_stats: true,
            status: Some(StatusCode::OK.as_u16()),
            error_category: None,
            error_code: None,
            duration_ms,
            event_ttfb_ms: Some(duration_ms),
            log_ttfb_ms: Some(duration_ms),
            attempts: &warmup_attempts,
            special_settings_json: Some(special_settings_json),
            session_id: None,
            requested_model: requested_model.clone(),
            created_at_ms,
            created_at,
            usage_metrics: Some(usage::UsageMetrics::default()),
            log_usage_metrics: Some(usage::UsageMetrics {
                input_tokens: Some(0),
                output_tokens: Some(0),
                total_tokens: Some(0),
                cache_read_input_tokens: Some(0),
                cache_creation_input_tokens: Some(0),
                cache_creation_5m_input_tokens: Some(0),
                cache_creation_1h_input_tokens: Some(0),
            }),
            usage: None,
        });

        let mut resp = (StatusCode::OK, Json(response_body)).into_response();
        resp.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json; charset=utf-8"),
        );
        resp.headers_mut()
            .insert("x-aio-intercepted", HeaderValue::from_static("warmup"));
        resp.headers_mut().insert(
            "x-aio-intercepted-by",
            HeaderValue::from_static("aio-coding-hub"),
        );
        if let Ok(v) = HeaderValue::from_str(&trace_id) {
            resp.headers_mut().insert("x-trace-id", v);
        }
        resp.headers_mut().insert(
            "x-aio-upstream-meta-url",
            HeaderValue::from_static("/__aio__/warmup"),
        );
        return resp;
    }

    let special_settings: Arc<Mutex<Vec<serde_json::Value>>> = Arc::new(Mutex::new(Vec::new()));

    let mut strip_request_content_encoding_seed = false;
    if cli_key == "codex" && enable_codex_session_id_completion {
        let mut cache = state.codex_session_cache.lock_or_recover();
        let result = codex_session_id::complete_codex_session_identifiers(
            &mut cache,
            created_at,
            created_at_ms,
            &mut headers,
            introspection_json.as_mut(),
        );

        if result.changed_body {
            if let Some(root) = introspection_json.as_ref() {
                if let Ok(next) = serde_json::to_vec(root) {
                    body_bytes = Bytes::from(next);
                    strip_request_content_encoding_seed = true;
                }
            }
        }

        if let Ok(mut settings) = special_settings.lock() {
            settings.push(serde_json::json!({
                "type": "codex_session_id_completion",
                "scope": "request",
                "hit": result.applied,
                "sessionId": result.session_id,
                "action": result.action,
                "source": result.source,
                "changedHeader": result.changed_headers,
                "changedBody": result.changed_body,
            }));
        }
    }

    let session_id = session_manager::SessionManager::extract_session_id_from_json(
        &headers,
        introspection_json.as_ref(),
    );
    let session_id = if is_claude_count_tokens {
        None
    } else {
        session_id
    };
    let allow_session_reuse = if is_claude_count_tokens {
        false
    } else {
        should_reuse_provider(introspection_json.as_ref())
    };

    let respond_invalid_cli_key = |err: String| -> Response {
        let contract = early_error_contract(EarlyErrorKind::InvalidCliKey);
        let resp = error_response(
            contract.status,
            trace_id.clone(),
            contract.error_code,
            err,
            vec![],
        );

        let duration_ms = started.elapsed().as_millis();
        emit_request_event_and_spawn_request_log(RequestEndArgs {
            deps: RequestEndDeps::new(&state.app, &state.db, &state.log_tx),
            trace_id: trace_id.as_str(),
            cli_key: cli_key.as_str(),
            method: method_hint.as_str(),
            path: forwarded_path.as_str(),
            query: query.as_deref(),
            excluded_from_stats: contract.excluded_from_stats,
            status: Some(contract.status.as_u16()),
            error_category: contract.error_category,
            error_code: Some(contract.error_code),
            duration_ms,
            event_ttfb_ms: None,
            log_ttfb_ms: None,
            attempts: &[],
            special_settings_json: None,
            session_id: session_id.clone(),
            requested_model: requested_model.clone(),
            created_at_ms,
            created_at,
            usage_metrics: None,
            log_usage_metrics: None,
            usage: None,
        });

        resp
    };

    let bound_sort_mode_id = session_id.as_deref().and_then(|sid| {
        state
            .session
            .get_bound_sort_mode_id(&cli_key, sid, created_at)
    });

    let (effective_sort_mode_id, mut providers) = match bound_sort_mode_id {
        Some(sort_mode_id) => {
            let providers = match providers::list_enabled_for_gateway_in_mode(
                &state.db,
                &cli_key,
                sort_mode_id,
            ) {
                Ok(v) => v,
                Err(err) => return respond_invalid_cli_key(err.to_string()),
            };
            (sort_mode_id, providers)
        }
        None => {
            let selection =
                match providers::list_enabled_for_gateway_using_active_mode(&state.db, &cli_key) {
                    Ok(v) => v,
                    Err(err) => return respond_invalid_cli_key(err.to_string()),
                };
            (selection.sort_mode_id, selection.providers)
        }
    };

    let mut bound_provider_order: Option<Vec<i64>> = None;
    if let Some(sid) = session_id.as_deref() {
        let provider_order: Vec<i64> = providers.iter().map(|p| p.id).collect();
        state.session.bind_sort_mode(
            &cli_key,
            sid,
            effective_sort_mode_id,
            Some(provider_order),
            created_at,
        );

        bound_provider_order = state
            .session
            .get_bound_provider_order(&cli_key, sid, created_at);

        if let Some(order) = bound_provider_order.as_ref() {
            if !order.is_empty() && providers.len() > 1 {
                let mut by_id: HashMap<i64, providers::ProviderForGateway> =
                    HashMap::with_capacity(providers.len());
                let mut original_ids: Vec<i64> = Vec::with_capacity(providers.len());
                for item in providers.drain(..) {
                    original_ids.push(item.id);
                    by_id.insert(item.id, item);
                }

                let mut reordered: Vec<providers::ProviderForGateway> =
                    Vec::with_capacity(original_ids.len());
                for provider_id in order {
                    if let Some(item) = by_id.remove(provider_id) {
                        reordered.push(item);
                    }
                }
                for provider_id in original_ids {
                    if let Some(item) = by_id.remove(&provider_id) {
                        reordered.push(item);
                    }
                }
                providers = reordered;
            }
        }
    }

    if providers.is_empty() {
        let contract = early_error_contract(EarlyErrorKind::NoEnabledProvider);
        let message = no_enabled_provider_message(&cli_key);
        let resp = error_response(
            contract.status,
            trace_id.clone(),
            contract.error_code,
            message,
            vec![],
        );
        let duration_ms = started.elapsed().as_millis();
        emit_request_event_and_enqueue_request_log(RequestEndArgs {
            deps: RequestEndDeps::new(&state.app, &state.db, &state.log_tx),
            trace_id: trace_id.as_str(),
            cli_key: cli_key.as_str(),
            method: method_hint.as_str(),
            path: forwarded_path.as_str(),
            query: query.as_deref(),
            excluded_from_stats: contract.excluded_from_stats,
            status: Some(contract.status.as_u16()),
            error_category: contract.error_category,
            error_code: Some(contract.error_code),
            duration_ms,
            event_ttfb_ms: None,
            log_ttfb_ms: None,
            attempts: &[],
            special_settings_json: None,
            session_id,
            requested_model,
            created_at_ms,
            created_at,
            usage_metrics: None,
            log_usage_metrics: None,
            usage: None,
        })
        .await;
        return resp;
    }

    // NOTE: model whitelist filtering removed (Claude uses slot-based model mapping).

    let mut session_bound_provider_id: Option<i64> = None;
    if allow_session_reuse {
        if let Some(bound_provider_id) = session_id
            .as_deref()
            .and_then(|sid| state.session.get_bound_provider(&cli_key, sid, created_at))
        {
            if let Some(idx) = providers.iter().position(|p| p.id == bound_provider_id) {
                session_bound_provider_id = Some(bound_provider_id);
                if idx > 0 {
                    let chosen = providers.remove(idx);
                    providers.insert(0, chosen);
                }
            } else if let Some(order) = bound_provider_order.as_deref() {
                if !order.is_empty() && providers.len() > 1 {
                    let current_provider_ids: HashSet<i64> =
                        providers.iter().map(|p| p.id).collect();
                    if let Some(next_provider_id) = select_next_provider_id_from_order(
                        bound_provider_id,
                        order,
                        &current_provider_ids,
                    ) {
                        if let Some(idx) = providers.iter().position(|p| p.id == next_provider_id) {
                            if idx > 0 {
                                providers.rotate_left(idx);
                            }
                        }
                    }
                }
            }
        }
    }

    let (unavailable_fingerprint_key, unavailable_fingerprint_debug) =
        compute_all_providers_unavailable_fingerprint(
            &cli_key,
            effective_sort_mode_id,
            &method_hint,
            &forwarded_path,
        );

    let idempotency_key_hash = extract_idempotency_key_hash(&headers);

    let introspection_body = body_for_introspection(&headers, &body_bytes);
    let (fingerprint_key, fingerprint_debug) = compute_request_fingerprint(
        &cli_key,
        &method_hint,
        &forwarded_path,
        query.as_deref(),
        session_id.as_deref(),
        requested_model.as_deref(),
        idempotency_key_hash,
        introspection_body.as_ref(),
    );

    if let Ok(mut cache) = state.recent_errors.lock() {
        let now_unix = now_unix_seconds() as i64;
        let cached_error = cache
            .get_error(now_unix, fingerprint_key, &fingerprint_debug)
            .or_else(|| {
                cache.get_error(
                    now_unix,
                    unavailable_fingerprint_key,
                    &unavailable_fingerprint_debug,
                )
            });

        if let Some(entry) = cached_error {
            let any_allowed = providers
                .iter()
                .any(|p| state.circuit.should_allow(p.id, now_unix).allow);
            if !any_allowed {
                trace_id = entry.trace_id.clone();
                cache.upsert_trace_id(
                    now_unix,
                    fingerprint_key,
                    trace_id.clone(),
                    fingerprint_debug.clone(),
                    RECENT_TRACE_DEDUP_TTL_SECS,
                );
                return error_response_with_retry_after(
                    entry.status,
                    entry.trace_id,
                    entry.error_code,
                    entry.message,
                    vec![],
                    entry.retry_after_seconds,
                );
            }

            cache.remove_error(fingerprint_key);
            cache.remove_error(unavailable_fingerprint_key);
        } else if let Some(existing) =
            cache.get_trace_id(now_unix, fingerprint_key, &fingerprint_debug)
        {
            trace_id = existing;
        }

        cache.upsert_trace_id(
            now_unix,
            fingerprint_key,
            trace_id.clone(),
            fingerprint_debug.clone(),
            RECENT_TRACE_DEDUP_TTL_SECS,
        );
    }

    emit_request_start_event(
        &state.app,
        trace_id.clone(),
        cli_key.clone(),
        method_hint.clone(),
        forwarded_path.clone(),
        query.clone(),
        requested_model.clone(),
        created_at,
    );

    let (
        mut max_attempts_per_provider,
        mut max_providers_to_try,
        provider_cooldown_secs,
        upstream_first_byte_timeout_secs,
        upstream_stream_idle_timeout_secs,
        upstream_request_timeout_non_streaming_secs,
    ) = match settings_cfg.as_ref() {
        Some(cfg) => (
            cfg.failover_max_attempts_per_provider.max(1),
            cfg.failover_max_providers_to_try.max(1),
            cfg.provider_cooldown_seconds as i64,
            cfg.upstream_first_byte_timeout_seconds,
            cfg.upstream_stream_idle_timeout_seconds,
            cfg.upstream_request_timeout_non_streaming_seconds,
        ),
        None => (
            DEFAULT_FAILOVER_MAX_ATTEMPTS_PER_PROVIDER,
            DEFAULT_FAILOVER_MAX_PROVIDERS_TO_TRY,
            settings::DEFAULT_PROVIDER_COOLDOWN_SECONDS as i64,
            settings::DEFAULT_UPSTREAM_FIRST_BYTE_TIMEOUT_SECONDS,
            settings::DEFAULT_UPSTREAM_STREAM_IDLE_TIMEOUT_SECONDS,
            settings::DEFAULT_UPSTREAM_REQUEST_TIMEOUT_NON_STREAMING_SECONDS,
        ),
    };

    if is_claude_count_tokens {
        max_attempts_per_provider = 1;
        max_providers_to_try = 1;
    }

    super::forwarder::forward(RequestContext::from_handler_parts(RequestContextParts {
        state,
        cli_key,
        forwarded_path,
        req_method: method,
        method_hint,
        query,
        trace_id,
        started,
        created_at_ms,
        created_at,
        session_id,
        requested_model,
        requested_model_location,
        effective_sort_mode_id,
        providers,
        session_bound_provider_id,
        headers,
        body_bytes,
        introspection_json,
        strip_request_content_encoding_seed,
        special_settings,
        provider_base_url_ping_cache_ttl_seconds,
        max_attempts_per_provider,
        max_providers_to_try,
        provider_cooldown_secs,
        upstream_first_byte_timeout_secs,
        upstream_stream_idle_timeout_secs,
        upstream_request_timeout_non_streaming_secs,
        fingerprint_key,
        fingerprint_debug,
        unavailable_fingerprint_key,
        unavailable_fingerprint_debug,
        enable_thinking_signature_rectifier,
        enable_response_fixer,
        response_fixer_stream_config,
        response_fixer_non_stream_config,
    }))
    .await
}

#[cfg(test)]
mod tests {
    use super::{
        body_too_large_message, cli_proxy_disabled_message, cli_proxy_guard_special_settings_json,
        early_error_contract, no_enabled_provider_message, EarlyErrorKind,
    };
    use crate::gateway::proxy::{ErrorCategory, GatewayErrorCode};
    use axum::http::StatusCode;

    #[test]
    fn cli_proxy_disabled_message_without_error_is_actionable() {
        let message = cli_proxy_disabled_message("claude", None);
        assert!(message.contains("CLI 代理未开启"));
        assert!(message.contains("claude"));
        assert!(message.contains("首页开启"));
    }

    #[test]
    fn cli_proxy_disabled_message_with_error_preserves_context() {
        let message = cli_proxy_disabled_message("codex", Some("manifest read failed"));
        assert!(message.contains("CLI 代理状态读取失败"));
        assert!(message.contains("manifest read failed"));
        assert!(message.contains("codex"));
    }

    #[test]
    fn cli_proxy_guard_special_settings_json_has_expected_shape() {
        let encoded = cli_proxy_guard_special_settings_json(false, 5000, Some("boom"));
        let value: serde_json::Value =
            serde_json::from_str(&encoded).expect("special settings should be valid json");

        let row = value
            .as_array()
            .and_then(|rows| rows.first())
            .expect("special settings should contain one object");

        assert_eq!(
            row.get("type").and_then(|v| v.as_str()),
            Some("cli_proxy_guard")
        );
        assert_eq!(row.get("scope").and_then(|v| v.as_str()), Some("request"));
        assert_eq!(row.get("hit").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(row.get("enabled").and_then(|v| v.as_bool()), Some(false));
        assert_eq!(row.get("cacheHit").and_then(|v| v.as_bool()), Some(false));
        assert_eq!(row.get("cacheTtlMs").and_then(|v| v.as_i64()), Some(5000));
        assert_eq!(row.get("error").and_then(|v| v.as_str()), Some("boom"));
    }

    #[test]
    fn early_error_contracts_match_expected_status_and_codes() {
        let cli_proxy = early_error_contract(EarlyErrorKind::CliProxyDisabled);
        assert_eq!(cli_proxy.status, StatusCode::FORBIDDEN);
        assert_eq!(
            cli_proxy.error_code,
            GatewayErrorCode::CliProxyDisabled.as_str()
        );
        assert_eq!(
            cli_proxy.error_category,
            Some(ErrorCategory::NonRetryableClientError.as_str())
        );
        assert!(cli_proxy.excluded_from_stats);

        let body_too_large = early_error_contract(EarlyErrorKind::BodyTooLarge);
        assert_eq!(body_too_large.status, StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(
            body_too_large.error_code,
            GatewayErrorCode::BodyTooLarge.as_str()
        );
        assert_eq!(body_too_large.error_category, None);
        assert!(!body_too_large.excluded_from_stats);

        let invalid_cli = early_error_contract(EarlyErrorKind::InvalidCliKey);
        assert_eq!(invalid_cli.status, StatusCode::BAD_REQUEST);
        assert_eq!(
            invalid_cli.error_code,
            GatewayErrorCode::InvalidCliKey.as_str()
        );
        assert_eq!(invalid_cli.error_category, None);
        assert!(!invalid_cli.excluded_from_stats);

        let no_provider = early_error_contract(EarlyErrorKind::NoEnabledProvider);
        assert_eq!(no_provider.status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(
            no_provider.error_code,
            GatewayErrorCode::NoEnabledProvider.as_str()
        );
        assert_eq!(no_provider.error_category, None);
        assert!(!no_provider.excluded_from_stats);
    }

    #[test]
    fn body_too_large_message_includes_prefix_and_error() {
        let message = body_too_large_message("stream exceeded limit");
        assert!(message.contains("failed to read request body:"));
        assert!(message.contains("stream exceeded limit"));
    }

    #[test]
    fn no_enabled_provider_message_preserves_cli_key() {
        let message = no_enabled_provider_message("codex");
        assert_eq!(message, "no enabled provider for cli_key=codex");
    }
}
