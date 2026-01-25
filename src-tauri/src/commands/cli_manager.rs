//! Usage: CLI environment / integration related Tauri commands.

use crate::{blocking, cli_manager, codex_config};

#[tauri::command]
pub(crate) async fn cli_manager_claude_info_get(
    app: tauri::AppHandle,
) -> Result<cli_manager::ClaudeCliInfo, String> {
    blocking::run("cli_manager_claude_info_get", move || {
        cli_manager::claude_info_get(&app)
    })
    .await
}

#[tauri::command]
pub(crate) async fn cli_manager_codex_info_get(
    app: tauri::AppHandle,
) -> Result<cli_manager::SimpleCliInfo, String> {
    blocking::run("cli_manager_codex_info_get", move || {
        cli_manager::codex_info_get(&app)
    })
    .await
}

#[tauri::command]
pub(crate) async fn cli_manager_codex_config_get(
    app: tauri::AppHandle,
) -> Result<codex_config::CodexConfigState, String> {
    blocking::run("cli_manager_codex_config_get", move || {
        codex_config::codex_config_get(&app)
    })
    .await
}

#[tauri::command]
pub(crate) async fn cli_manager_codex_config_set(
    app: tauri::AppHandle,
    patch: codex_config::CodexConfigPatch,
) -> Result<codex_config::CodexConfigState, String> {
    blocking::run("cli_manager_codex_config_set", move || {
        codex_config::codex_config_set(&app, patch)
    })
    .await
}

#[tauri::command]
pub(crate) async fn cli_manager_gemini_info_get(
    app: tauri::AppHandle,
) -> Result<cli_manager::SimpleCliInfo, String> {
    blocking::run("cli_manager_gemini_info_get", move || {
        cli_manager::gemini_info_get(&app)
    })
    .await
}

#[tauri::command]
pub(crate) async fn cli_manager_claude_env_set(
    app: tauri::AppHandle,
    mcp_timeout_ms: Option<u64>,
    disable_error_reporting: bool,
) -> Result<cli_manager::ClaudeEnvState, String> {
    blocking::run("cli_manager_claude_env_set", move || {
        cli_manager::claude_env_set(&app, mcp_timeout_ms, disable_error_reporting)
    })
    .await
}
