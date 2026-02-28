use super::context::CommonCtx;
use crate::gateway::claude_metadata_user_id_injection::{
    inject_from_json_bytes, ClaudeMetadataUserIdInjectionOutcome,
};
use crate::gateway::util::body_for_introspection;
use crate::shared::mutex_ext::MutexExt;
use axum::body::Bytes;
use axum::http::HeaderMap;

pub(super) struct ApplyClaudeMetadataUserIdInjectionInput<'a> {
    pub(super) ctx: CommonCtx<'a>,
    pub(super) provider_id: i64,
    pub(super) enabled: bool,
    pub(super) session_id: Option<&'a str>,
    pub(super) base_headers: &'a HeaderMap,
    pub(super) forwarded_path: &'a str,
    pub(super) upstream_body_bytes: &'a mut Bytes,
    pub(super) strip_request_content_encoding: &'a mut bool,
}

pub(super) fn apply_if_needed(input: ApplyClaudeMetadataUserIdInjectionInput<'_>) {
    let ApplyClaudeMetadataUserIdInjectionInput {
        ctx,
        provider_id,
        enabled,
        session_id,
        base_headers,
        forwarded_path,
        upstream_body_bytes,
        strip_request_content_encoding,
    } = input;
    if ctx.cli_key != "claude" || forwarded_path != "/v1/messages" || !enabled {
        return;
    }

    let body_for_parse = if *strip_request_content_encoding {
        std::borrow::Cow::Borrowed(upstream_body_bytes.as_ref())
    } else {
        body_for_introspection(base_headers, upstream_body_bytes.as_ref())
    };

    match inject_from_json_bytes(provider_id, session_id, body_for_parse.as_ref()) {
        ClaudeMetadataUserIdInjectionOutcome::Injected { body_bytes } => {
            *upstream_body_bytes = Bytes::from(body_bytes);
            *strip_request_content_encoding = true;
            let mut settings = ctx.special_settings.lock_or_recover();
            settings.push(serde_json::json!({
                "type": "claude_metadata_user_id_injection",
                "scope": "request",
                "hit": true,
                "action": "injected",
                "reason": "injected",
                "keyId": provider_id,
                "sessionId": session_id,
            }));
        }
        ClaudeMetadataUserIdInjectionOutcome::Skipped(skip) => {
            let mut settings = ctx.special_settings.lock_or_recover();
            settings.push(serde_json::json!({
                "type": "claude_metadata_user_id_injection",
                "scope": "request",
                "hit": false,
                "action": "skipped",
                "reason": skip.reason,
                "keyId": provider_id,
                "sessionId": session_id,
                "error": skip.error,
            }));
        }
    }
}
