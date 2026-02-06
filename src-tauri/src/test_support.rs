//! Usage: Public test helpers for integration tests.

use std::path::PathBuf;

fn serialize_json(
    value: impl serde::Serialize,
) -> crate::shared::error::AppResult<serde_json::Value> {
    Ok(serde_json::to_value(value)
        .map_err(|e| format!("SYSTEM_ERROR: failed to serialize json: {e}"))?)
}

pub fn app_data_dir<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<PathBuf> {
    crate::infra::app_paths::app_data_dir(app)
}

pub fn db_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<PathBuf> {
    crate::infra::db::db_path(app)
}

pub fn init_db<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<()> {
    crate::infra::db::init(app).map(|_| ())
}

pub fn mcp_read_target_bytes<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
) -> crate::shared::error::AppResult<Option<Vec<u8>>> {
    crate::infra::mcp_sync::read_target_bytes(app, cli_key).map_err(Into::into)
}

pub fn mcp_restore_target_bytes<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
    bytes: Option<Vec<u8>>,
) -> crate::shared::error::AppResult<()> {
    crate::infra::mcp_sync::restore_target_bytes(app, cli_key, bytes).map_err(Into::into)
}

pub fn mcp_swap_local_for_workspace_switch<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
    managed_server_keys: Vec<String>,
    from_workspace_id: Option<i64>,
    to_workspace_id: i64,
) -> crate::shared::error::AppResult<()> {
    let set: std::collections::HashSet<String> = managed_server_keys.into_iter().collect();
    crate::domain::mcp::swap_local_mcp_servers_for_workspace_switch(
        app,
        cli_key,
        &set,
        from_workspace_id,
        to_workspace_id,
    )?;
    Ok(())
}

pub fn mcp_import_servers_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    workspace_id: i64,
    servers: serde_json::Value,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let db = crate::infra::db::init(app)?;
    let servers: Vec<crate::domain::mcp::McpImportServer> = serde_json::from_value(servers)
        .map_err(|e| format!("SEC_INVALID_INPUT: invalid mcp import servers json: {e}"))?;
    let report = crate::domain::mcp::import_servers(app, &db, workspace_id, servers)?;
    serialize_json(report)
}

pub fn mcp_import_from_workspace_cli_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    workspace_id: i64,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let db = crate::infra::db::init(app)?;
    let report = crate::domain::mcp::import_servers_from_workspace_cli(app, &db, workspace_id)?;
    serialize_json(report)
}

pub fn mcp_servers_list_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    workspace_id: i64,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let db = crate::infra::db::init(app)?;
    let rows = crate::domain::mcp::list_for_workspace(&db, workspace_id)?;
    serialize_json(rows)
}

pub fn workspace_active_id_by_cli<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
) -> crate::shared::error::AppResult<i64> {
    let db = crate::infra::db::init(app)?;
    let result = crate::workspaces::list_by_cli(&db, cli_key)?;
    result.active_id.ok_or_else(|| {
        format!("DB_NOT_FOUND: active workspace not found for cli_key={cli_key}").into()
    })
}

pub fn codex_config_toml_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<PathBuf> {
    crate::infra::codex_paths::codex_config_toml_path(app)
}

pub fn codex_config_toml_raw_set<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    toml: String,
) -> crate::shared::error::AppResult<()> {
    crate::infra::codex_config::codex_config_toml_set_raw(app, toml).map(|_| ())
}

pub fn skills_swap_local_for_workspace_switch<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
    from_workspace_id: Option<i64>,
    to_workspace_id: i64,
) -> crate::shared::error::AppResult<()> {
    let _ = crate::domain::skills::swap_local_skills_for_workspace_switch(
        app,
        cli_key,
        from_workspace_id,
        to_workspace_id,
    )?;
    Ok(())
}

pub fn plugins_swap_local_for_workspace_switch<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
    from_workspace_id: Option<i64>,
    to_workspace_id: i64,
) -> crate::shared::error::AppResult<()> {
    let _ = crate::domain::claude_plugins::swap_local_plugins_for_workspace_switch(
        app,
        cli_key,
        from_workspace_id,
        to_workspace_id,
    )?;
    Ok(())
}

pub fn providers_list_by_cli_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let db = crate::infra::db::init(app)?;
    let providers = crate::providers::list_by_cli(&db, cli_key)?;
    serialize_json(providers)
}

#[allow(clippy::too_many_arguments)]
pub fn provider_upsert_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    provider_id: Option<i64>,
    cli_key: &str,
    name: &str,
    base_urls: Vec<String>,
    base_url_mode: &str,
    api_key: Option<&str>,
    enabled: bool,
    cost_multiplier: f64,
    priority: Option<i64>,
    claude_models: Option<serde_json::Value>,
    limit_5h_usd: Option<f64>,
    limit_daily_usd: Option<f64>,
    daily_reset_mode: Option<&str>,
    daily_reset_time: Option<&str>,
    limit_weekly_usd: Option<f64>,
    limit_monthly_usd: Option<f64>,
    limit_total_usd: Option<f64>,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let db = crate::infra::db::init(app)?;
    let claude_models = match claude_models {
        None => None,
        Some(value) => Some(
            serde_json::from_value::<crate::providers::ClaudeModels>(value)
                .map_err(|e| format!("SEC_INVALID_INPUT: invalid claude_models json: {e}"))?,
        ),
    };

    let provider = crate::providers::upsert(
        &db,
        provider_id,
        cli_key,
        name,
        base_urls,
        base_url_mode,
        api_key,
        enabled,
        cost_multiplier,
        priority,
        claude_models,
        limit_5h_usd,
        limit_daily_usd,
        daily_reset_mode,
        daily_reset_time,
        limit_weekly_usd,
        limit_monthly_usd,
        limit_total_usd,
    )?;
    serialize_json(provider)
}

pub fn provider_set_enabled_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    provider_id: i64,
    enabled: bool,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let db = crate::infra::db::init(app)?;
    let provider = crate::providers::set_enabled(&db, provider_id, enabled)?;
    serialize_json(provider)
}

pub fn provider_delete<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    provider_id: i64,
) -> crate::shared::error::AppResult<bool> {
    let db = crate::infra::db::init(app)?;
    crate::providers::delete(&db, provider_id)?;
    Ok(true)
}

pub fn providers_reorder_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
    ordered_provider_ids: Vec<i64>,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let db = crate::infra::db::init(app)?;
    let providers = crate::providers::reorder(&db, cli_key, ordered_provider_ids)?;
    serialize_json(providers)
}

pub fn cli_proxy_set_enabled_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
    enabled: bool,
    base_origin: &str,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let result = crate::infra::cli_proxy::set_enabled(app, cli_key, enabled, base_origin)?;
    serialize_json(result)
}

pub fn cli_proxy_startup_repair_incomplete_enable_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let results = crate::infra::cli_proxy::startup_repair_incomplete_enable(app)?;
    serialize_json(results)
}

pub fn cli_proxy_restore_enabled_keep_state_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let results = crate::infra::cli_proxy::restore_enabled_keep_state(app)?;
    serialize_json(results)
}

pub fn cli_manager_codex_config_set_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    patch: serde_json::Value,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let patch: crate::infra::codex_config::CodexConfigPatch = serde_json::from_value(patch)
        .map_err(|e| format!("SEC_INVALID_INPUT: invalid codex config patch: {e}"))?;
    let state = crate::infra::codex_config::codex_config_set(app, patch)?;
    serialize_json(state)
}

pub fn cli_manager_claude_settings_set_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    patch: serde_json::Value,
) -> crate::shared::error::AppResult<serde_json::Value> {
    let patch: crate::infra::claude_settings::ClaudeSettingsPatch =
        serde_json::from_value(patch)
            .map_err(|e| format!("SEC_INVALID_INPUT: invalid claude settings patch: {e}"))?;
    let state = crate::infra::claude_settings::claude_settings_set(app, patch)?;
    serialize_json(state)
}
