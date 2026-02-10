use super::super::failover::should_reuse_provider;
use super::provider_order;
use crate::gateway::manager::GatewayAppState;
use crate::{providers, session_manager};

pub(super) struct ProviderSelection {
    pub(super) effective_sort_mode_id: Option<i64>,
    pub(super) providers: Vec<providers::ProviderForGateway>,
    pub(super) bound_provider_order: Option<Vec<i64>>,
}

pub(super) fn select_providers_with_session_binding(
    state: &GatewayAppState,
    cli_key: &str,
    session_id: Option<&str>,
    created_at: i64,
) -> crate::shared::error::AppResult<ProviderSelection> {
    let bound_sort_mode_id = session_id.and_then(|sid| {
        state
            .session
            .get_bound_sort_mode_id(cli_key, sid, created_at)
    });

    let (effective_sort_mode_id, mut providers) = match bound_sort_mode_id {
        Some(sort_mode_id) => {
            let providers =
                providers::list_enabled_for_gateway_in_mode(&state.db, cli_key, sort_mode_id)?;
            (sort_mode_id, providers)
        }
        None => {
            let selection =
                providers::list_enabled_for_gateway_using_active_mode(&state.db, cli_key)?;
            (selection.sort_mode_id, selection.providers)
        }
    };

    let mut bound_provider_order: Option<Vec<i64>> = None;
    if let Some(sid) = session_id {
        let provider_order: Vec<i64> = providers.iter().map(|p| p.id).collect();
        state.session.bind_sort_mode(
            cli_key,
            sid,
            effective_sort_mode_id,
            Some(provider_order),
            created_at,
        );

        bound_provider_order = state
            .session
            .get_bound_provider_order(cli_key, sid, created_at);

        if let Some(order) = bound_provider_order.as_deref() {
            provider_order::reorder_providers_by_bound_order(&mut providers, order);
        }
    }

    Ok(ProviderSelection {
        effective_sort_mode_id,
        providers,
        bound_provider_order,
    })
}

pub(super) fn resolve_session_routing_decision(
    headers: &axum::http::HeaderMap,
    introspection_json: Option<&serde_json::Value>,
    is_claude_count_tokens: bool,
) -> SessionRoutingDecision {
    let extracted_session_id =
        session_manager::SessionManager::extract_session_id_from_json(headers, introspection_json);

    let session_id = if is_claude_count_tokens {
        None
    } else {
        extracted_session_id
    };

    let allow_session_reuse = if is_claude_count_tokens {
        false
    } else {
        should_reuse_provider(introspection_json)
    };

    SessionRoutingDecision {
        session_id,
        allow_session_reuse,
    }
}

pub(super) fn apply_session_reuse_provider_binding(
    allow_session_reuse: bool,
    providers: &mut Vec<providers::ProviderForGateway>,
    bound_provider_id: Option<i64>,
    bound_provider_order: Option<&[i64]>,
) -> Option<i64> {
    if !allow_session_reuse {
        return None;
    }
    let bound_provider_id = bound_provider_id?;

    provider_order::apply_session_provider_preference(
        providers,
        bound_provider_id,
        bound_provider_order,
    )
}

pub(super) fn resolve_session_bound_provider_id(
    state: &GatewayAppState,
    cli_key: &str,
    session_id: Option<&str>,
    created_at: i64,
    allow_session_reuse: bool,
    providers: &mut Vec<providers::ProviderForGateway>,
    bound_provider_order: Option<&[i64]>,
) -> Option<i64> {
    let bound_provider_id =
        session_id.and_then(|sid| state.session.get_bound_provider(cli_key, sid, created_at));

    apply_session_reuse_provider_binding(
        allow_session_reuse,
        providers,
        bound_provider_id,
        bound_provider_order,
    )
}

pub(super) struct SessionRoutingDecision {
    pub(super) session_id: Option<String>,
    pub(super) allow_session_reuse: bool,
}
