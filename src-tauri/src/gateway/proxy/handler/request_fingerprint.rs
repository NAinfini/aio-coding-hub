use super::super::caches::RECENT_TRACE_DEDUP_TTL_SECS;
use super::super::errors::error_response_with_retry_after;
use crate::gateway::manager::GatewayAppState;
use crate::gateway::util::{
    body_for_introspection, compute_all_providers_unavailable_fingerprint,
    compute_request_fingerprint, extract_idempotency_key_hash, now_unix_seconds,
};
use crate::shared::mutex_ext::MutexExt;
use axum::body::Bytes;
use axum::response::Response;

#[derive(Debug, Clone)]
pub(super) struct RequestFingerprints {
    pub(super) fingerprint_key: u64,
    pub(super) fingerprint_debug: String,
    pub(super) unavailable_fingerprint_key: u64,
    pub(super) unavailable_fingerprint_debug: String,
}

#[allow(clippy::too_many_arguments)]
pub(super) fn build_request_fingerprints(
    cli_key: &str,
    effective_sort_mode_id: Option<i64>,
    method_hint: &str,
    forwarded_path: &str,
    query: Option<&str>,
    session_id: Option<&str>,
    requested_model: Option<&str>,
    headers: &axum::http::HeaderMap,
    body_bytes: &Bytes,
) -> RequestFingerprints {
    let (unavailable_fingerprint_key, unavailable_fingerprint_debug) =
        compute_all_providers_unavailable_fingerprint(
            cli_key,
            effective_sort_mode_id,
            method_hint,
            forwarded_path,
        );

    let idempotency_key_hash = extract_idempotency_key_hash(headers);
    let introspection_body = body_for_introspection(headers, body_bytes);
    let (fingerprint_key, fingerprint_debug) = compute_request_fingerprint(
        cli_key,
        method_hint,
        forwarded_path,
        query,
        session_id,
        requested_model,
        idempotency_key_hash,
        introspection_body.as_ref(),
    );

    RequestFingerprints {
        fingerprint_key,
        fingerprint_debug,
        unavailable_fingerprint_key,
        unavailable_fingerprint_debug,
    }
}

pub(super) fn apply_recent_error_cache_gate(
    state: &GatewayAppState,
    fingerprints: &RequestFingerprints,
    trace_id: String,
) -> Result<String, Box<Response>> {
    let mut next_trace_id = trace_id;

    let mut cache = state.recent_errors.lock_or_recover();
    let now_unix = now_unix_seconds() as i64;
    let cached_error = cache
        .get_error(
            now_unix,
            fingerprints.fingerprint_key,
            &fingerprints.fingerprint_debug,
        )
        .or_else(|| {
            cache.get_error(
                now_unix,
                fingerprints.unavailable_fingerprint_key,
                &fingerprints.unavailable_fingerprint_debug,
            )
        });

    if let Some(entry) = cached_error {
        next_trace_id = entry.trace_id.clone();
        cache.upsert_trace_id(
            now_unix,
            fingerprints.fingerprint_key,
            next_trace_id.clone(),
            fingerprints.fingerprint_debug.clone(),
            RECENT_TRACE_DEDUP_TTL_SECS,
        );
        return Err(Box::new(error_response_with_retry_after(
            entry.status,
            entry.trace_id,
            entry.error_code,
            entry.message,
            vec![],
            entry.retry_after_seconds,
        )));
    } else if let Some(existing) = cache.get_trace_id(
        now_unix,
        fingerprints.fingerprint_key,
        &fingerprints.fingerprint_debug,
    ) {
        next_trace_id = existing;
    }

    cache.upsert_trace_id(
        now_unix,
        fingerprints.fingerprint_key,
        next_trace_id.clone(),
        fingerprints.fingerprint_debug.clone(),
        RECENT_TRACE_DEDUP_TTL_SECS,
    );

    Ok(next_trace_id)
}
