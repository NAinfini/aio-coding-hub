//! Usage: Request logs and trace detail related Tauri commands.

use crate::app_state::{ensure_db_ready, DbInitState};
use crate::{blocking, request_attempt_logs, request_logs};

#[tauri::command]
pub(crate) async fn request_logs_list(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    cli_key: String,
    limit: Option<u32>,
) -> Result<Vec<request_logs::RequestLogSummary>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    let limit = limit.unwrap_or(50).clamp(1, 500) as usize;
    blocking::run("request_logs_list", move || {
        request_logs::list_recent(&db, &cli_key, limit)
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn request_logs_list_all(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    limit: Option<u32>,
) -> Result<Vec<request_logs::RequestLogSummary>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    let limit = limit.unwrap_or(50).clamp(1, 500) as usize;
    blocking::run("request_logs_list_all", move || {
        request_logs::list_recent_all(&db, limit)
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn request_logs_list_after_id(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    cli_key: String,
    after_id: i64,
    limit: Option<u32>,
) -> Result<Vec<request_logs::RequestLogSummary>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    let limit = limit.unwrap_or(50).clamp(1, 500) as usize;
    blocking::run("request_logs_list_after_id", move || {
        request_logs::list_after_id(&db, &cli_key, after_id, limit)
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn request_logs_list_after_id_all(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    after_id: i64,
    limit: Option<u32>,
) -> Result<Vec<request_logs::RequestLogSummary>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    let limit = limit.unwrap_or(50).clamp(1, 500) as usize;
    blocking::run("request_logs_list_after_id_all", move || {
        request_logs::list_after_id_all(&db, after_id, limit)
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn request_log_get(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    log_id: i64,
) -> Result<request_logs::RequestLogDetail, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("request_log_get", move || {
        request_logs::get_by_id(&db, log_id)
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn request_log_get_by_trace_id(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    trace_id: String,
) -> Result<Option<request_logs::RequestLogDetail>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("request_log_get_by_trace_id", move || {
        request_logs::get_by_trace_id(&db, &trace_id)
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn request_attempt_logs_by_trace_id(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    trace_id: String,
    limit: Option<u32>,
) -> Result<Vec<request_attempt_logs::RequestAttemptLog>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    let limit = limit.unwrap_or(50).clamp(1, 200) as usize;
    blocking::run("request_attempt_logs_by_trace_id", move || {
        request_attempt_logs::list_by_trace_id(&db, &trace_id, limit)
    })
    .await
    .map_err(Into::into)
}
