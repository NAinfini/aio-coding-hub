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

#[allow(clippy::too_many_arguments)]
pub(super) fn resolve_session_bound_provider_id(
    db: &crate::db::Db,
    session: &session_manager::SessionManager,
    cli_key: &str,
    session_id: Option<&str>,
    created_at: i64,
    allow_session_reuse: bool,
    forced_provider_id: Option<i64>,
    providers: &mut Vec<providers::ProviderForGateway>,
    bound_provider_order: Option<&[i64]>,
) -> Option<i64> {
    let bound_provider_id =
        session_id.and_then(|sid| session.get_bound_provider(cli_key, sid, created_at));

    if allow_session_reuse && forced_provider_id.is_none() {
        if let Some(bound_provider_id) = bound_provider_id {
            if !providers.iter().any(|p| p.id == bound_provider_id) {
                if let Ok(Some(bound_provider)) =
                    providers::get_for_gateway_by_id(db, cli_key, bound_provider_id)
                {
                    providers.insert(0, bound_provider);
                }
            }
        }
    }

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

#[cfg(test)]
mod tests {
    use super::resolve_session_bound_provider_id;
    use crate::{providers, session_manager};

    fn ids(items: &[providers::ProviderForGateway]) -> Vec<i64> {
        items.iter().map(|p| p.id).collect()
    }

    fn insert_provider(
        db: &crate::db::Db,
        name: &str,
        enabled: bool,
    ) -> providers::ProviderSummary {
        providers::upsert(
            db,
            None,
            "claude",
            name,
            vec!["https://example.com".to_string()],
            "order",
            Some("k"),
            enabled,
            1.0,
            Some(100),
            None,
            None,
            None,
            Some("fixed"),
            Some("00:00:00"),
            None,
            None,
            None,
            None,
        )
        .expect("insert provider")
    }

    #[test]
    fn resolve_session_bound_provider_id_inserts_disabled_bound_provider() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let db = crate::db::init_for_tests(&db_path).expect("init db");

        let p1 = insert_provider(&db, "P1", true);
        let p2 = insert_provider(&db, "P2", true);
        let id1 = p1.id;
        let id2 = p2.id;

        providers::set_enabled(&db, id1, false).expect("disable provider 1");

        let session = session_manager::SessionManager::new();
        let now = 1000;
        session.bind_success("claude", "sess_1", id1, None, now);

        let mut enabled = providers::list_enabled_for_gateway_in_mode(&db, "claude", None)
            .expect("list enabled providers");
        assert_eq!(ids(&enabled), vec![id2]);

        let order = vec![id1, id2];
        let selected = resolve_session_bound_provider_id(
            &db,
            &session,
            "claude",
            Some("sess_1"),
            now,
            true,
            None,
            &mut enabled,
            Some(&order),
        );

        assert_eq!(selected, Some(id1));
        assert_eq!(ids(&enabled), vec![id1, id2]);
    }

    #[test]
    fn resolve_session_bound_provider_id_skips_insertion_when_forced_provider_present() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let db = crate::db::init_for_tests(&db_path).expect("init db");

        let p1 = insert_provider(&db, "P1", true);
        let p2 = insert_provider(&db, "P2", true);
        let id1 = p1.id;
        let id2 = p2.id;

        providers::set_enabled(&db, id1, false).expect("disable provider 1");

        let session = session_manager::SessionManager::new();
        let now = 1000;
        session.bind_success("claude", "sess_1", id1, None, now);

        let mut enabled = providers::list_enabled_for_gateway_in_mode(&db, "claude", None)
            .expect("list enabled providers");
        assert_eq!(ids(&enabled), vec![id2]);

        let order = vec![id1, id2];
        let selected = resolve_session_bound_provider_id(
            &db,
            &session,
            "claude",
            Some("sess_1"),
            now,
            true,
            Some(id2),
            &mut enabled,
            Some(&order),
        );

        assert_eq!(selected, None);
        assert_eq!(ids(&enabled), vec![id2]);
    }

    #[test]
    fn resolve_session_bound_provider_id_does_not_insert_when_reuse_disabled() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let db = crate::db::init_for_tests(&db_path).expect("init db");

        let p1 = insert_provider(&db, "P1", true);
        let p2 = insert_provider(&db, "P2", true);
        let id1 = p1.id;
        let id2 = p2.id;

        providers::set_enabled(&db, id1, false).expect("disable provider 1");

        let session = session_manager::SessionManager::new();
        let now = 1000;
        session.bind_success("claude", "sess_1", id1, None, now);

        let mut enabled = providers::list_enabled_for_gateway_in_mode(&db, "claude", None)
            .expect("list enabled providers");
        assert_eq!(ids(&enabled), vec![id2]);

        let order = vec![id1, id2];
        let selected = resolve_session_bound_provider_id(
            &db,
            &session,
            "claude",
            Some("sess_1"),
            now,
            false,
            None,
            &mut enabled,
            Some(&order),
        );

        assert_eq!(selected, None);
        assert_eq!(ids(&enabled), vec![id2]);
    }
}
