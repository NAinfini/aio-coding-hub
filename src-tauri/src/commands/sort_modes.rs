//! Usage: Provider sort modes related Tauri commands.

use crate::app_state::{ensure_db_ready, DbInitState};
use crate::{blocking, sort_modes};

#[tauri::command]
pub(crate) async fn sort_modes_list(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
) -> Result<Vec<sort_modes::SortModeSummary>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("sort_modes_list", move || sort_modes::list_modes(&db)).await
}

#[tauri::command]
pub(crate) async fn sort_mode_create(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    name: String,
) -> Result<sort_modes::SortModeSummary, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("sort_mode_create", move || {
        sort_modes::create_mode(&db, &name)
    })
    .await
}

#[tauri::command]
pub(crate) async fn sort_mode_rename(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    mode_id: i64,
    name: String,
) -> Result<sort_modes::SortModeSummary, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("sort_mode_rename", move || {
        sort_modes::rename_mode(&db, mode_id, &name)
    })
    .await
}

#[tauri::command]
pub(crate) async fn sort_mode_delete(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    mode_id: i64,
) -> Result<bool, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("sort_mode_delete", move || {
        sort_modes::delete_mode(&db, mode_id)?;
        Ok(true)
    })
    .await
}

#[tauri::command]
pub(crate) async fn sort_mode_active_list(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
) -> Result<Vec<sort_modes::SortModeActiveRow>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("sort_mode_active_list", move || {
        sort_modes::list_active(&db)
    })
    .await
}

#[tauri::command]
pub(crate) async fn sort_mode_active_set(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    cli_key: String,
    mode_id: Option<i64>,
) -> Result<sort_modes::SortModeActiveRow, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("sort_mode_active_set", move || {
        sort_modes::set_active(&db, &cli_key, mode_id)
    })
    .await
}

#[tauri::command]
pub(crate) async fn sort_mode_providers_list(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    mode_id: i64,
    cli_key: String,
) -> Result<Vec<i64>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("sort_mode_providers_list", move || {
        sort_modes::list_mode_providers(&db, mode_id, &cli_key)
    })
    .await
}

#[tauri::command]
pub(crate) async fn sort_mode_providers_set_order(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    mode_id: i64,
    cli_key: String,
    ordered_provider_ids: Vec<i64>,
) -> Result<Vec<i64>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("sort_mode_providers_set_order", move || {
        sort_modes::set_mode_providers_order(&db, mode_id, &cli_key, ordered_provider_ids)
    })
    .await
}
