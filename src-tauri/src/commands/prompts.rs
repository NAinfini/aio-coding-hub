//! Usage: Prompt templates related Tauri commands.

use crate::app_state::{ensure_db_ready, DbInitState};
use crate::{blocking, prompts};

#[tauri::command]
pub(crate) async fn prompts_list(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    workspace_id: i64,
) -> Result<Vec<prompts::PromptSummary>, String> {
    let db = ensure_db_ready(app, db_state.inner())
        .await
        .map_err(|e| e.to_string())?;
    blocking::run("prompts_list", move || {
        prompts::list_by_workspace(&db, workspace_id)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn prompts_default_sync_from_files(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
) -> Result<prompts::DefaultPromptSyncReport, String> {
    let db = ensure_db_ready(app.clone(), db_state.inner())
        .await
        .map_err(|e| e.to_string())?;
    blocking::run("prompts_default_sync_from_files", move || {
        prompts::default_sync_from_files(&app, &db)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn prompt_upsert(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    prompt_id: Option<i64>,
    workspace_id: i64,
    name: String,
    content: String,
    enabled: bool,
) -> Result<prompts::PromptSummary, String> {
    let db = ensure_db_ready(app.clone(), db_state.inner())
        .await
        .map_err(|e| e.to_string())?;
    blocking::run("prompt_upsert", move || {
        prompts::upsert(&app, &db, prompt_id, workspace_id, &name, &content, enabled)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn prompt_set_enabled(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    prompt_id: i64,
    enabled: bool,
) -> Result<prompts::PromptSummary, String> {
    let db = ensure_db_ready(app.clone(), db_state.inner())
        .await
        .map_err(|e| e.to_string())?;
    blocking::run("prompt_set_enabled", move || {
        prompts::set_enabled(&app, &db, prompt_id, enabled)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn prompt_delete(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    prompt_id: i64,
) -> Result<bool, String> {
    let db = ensure_db_ready(app.clone(), db_state.inner())
        .await
        .map_err(|e| e.to_string())?;
    blocking::run(
        "prompt_delete",
        move || -> crate::shared::error::AppResult<bool> {
            prompts::delete(&app, &db, prompt_id)?;
            Ok(true)
        },
    )
    .await
    .map_err(|e| e.to_string())
}
