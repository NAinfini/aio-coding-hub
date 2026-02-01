//! Usage: Public test helpers for integration tests.

use std::path::PathBuf;

fn serialize_json(value: impl serde::Serialize) -> Result<serde_json::Value, String> {
    serde_json::to_value(value).map_err(|e| format!("SYSTEM_ERROR: failed to serialize json: {e}"))
}

pub fn app_data_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    crate::infra::app_paths::app_data_dir(app)
}

pub fn db_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    crate::infra::db::db_path(app)
}

pub fn init_db<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    crate::infra::db::init(app).map(|_| ())
}

pub fn mcp_read_target_bytes<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
) -> Result<Option<Vec<u8>>, String> {
    crate::infra::mcp_sync::read_target_bytes(app, cli_key)
}

pub fn mcp_restore_target_bytes<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
    bytes: Option<Vec<u8>>,
) -> Result<(), String> {
    crate::infra::mcp_sync::restore_target_bytes(app, cli_key, bytes)
}

pub fn codex_config_toml_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<PathBuf, String> {
    crate::infra::codex_paths::codex_config_toml_path(app)
}

pub fn providers_list_by_cli_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
) -> Result<serde_json::Value, String> {
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
) -> Result<serde_json::Value, String> {
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
) -> Result<serde_json::Value, String> {
    let db = crate::infra::db::init(app)?;
    let provider = crate::providers::set_enabled(&db, provider_id, enabled)?;
    serialize_json(provider)
}

pub fn provider_delete<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    provider_id: i64,
) -> Result<bool, String> {
    let db = crate::infra::db::init(app)?;
    crate::providers::delete(&db, provider_id)?;
    Ok(true)
}

pub fn providers_reorder_json<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cli_key: &str,
    ordered_provider_ids: Vec<i64>,
) -> Result<serde_json::Value, String> {
    let db = crate::infra::db::init(app)?;
    let providers = crate::providers::reorder(&db, cli_key, ordered_provider_ids)?;
    serialize_json(providers)
}
