//! Usage: CLI proxy configuration related Tauri commands.

use crate::app_state::{ensure_db_ready, DbInitState, GatewayState};
use crate::shared::mutex_ext::MutexExt;
use crate::{blocking, cli_proxy, settings};
use tauri::Emitter;
use tauri::Manager;

#[tauri::command]
pub(crate) async fn cli_proxy_status_all(
    app: tauri::AppHandle,
) -> Result<Vec<cli_proxy::CliProxyStatus>, String> {
    blocking::run("cli_proxy_status_all", move || cli_proxy::status_all(&app))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn cli_proxy_set_enabled(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    cli_key: String,
    enabled: bool,
) -> Result<cli_proxy::CliProxyResult, String> {
    let base_origin = if enabled {
        let db = ensure_db_ready(app.clone(), db_state.inner())
            .await
            .map_err(|e| e.to_string())?;

        blocking::run("cli_proxy_set_enabled_ensure_gateway", {
            let app = app.clone();
            let db = db.clone();
            move || -> crate::shared::error::AppResult<String> {
                let state = app.state::<GatewayState>();
                let mut manager = state.0.lock_or_recover();
                let status = if manager.status().running {
                    manager.status()
                } else {
                    let settings = settings::read(&app).unwrap_or_default();
                    let status = manager.start(&app, db, Some(settings.preferred_port))?;
                    let _ = app.emit("gateway:status", status.clone());
                    status
                };

                Ok(status.base_url.unwrap_or_else(|| {
                    format!(
                        "http://127.0.0.1:{}",
                        status.port.unwrap_or(settings::DEFAULT_GATEWAY_PORT)
                    )
                }))
            }
        })
        .await
        .map_err(|e| e.to_string())?
    } else {
        blocking::run("cli_proxy_set_enabled_read_settings", {
            let app = app.clone();
            move || -> crate::shared::error::AppResult<String> {
                let settings = settings::read(&app).unwrap_or_default();
                Ok(format!("http://127.0.0.1:{}", settings.preferred_port))
            }
        })
        .await
        .map_err(|e| e.to_string())?
    };

    blocking::run("cli_proxy_set_enabled_apply", move || {
        cli_proxy::set_enabled(&app, &cli_key, enabled, &base_origin)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn cli_proxy_sync_enabled(
    app: tauri::AppHandle,
    base_origin: String,
) -> Result<Vec<cli_proxy::CliProxyResult>, String> {
    blocking::run("cli_proxy_sync_enabled", move || {
        cli_proxy::sync_enabled(&app, &base_origin)
    })
    .await
    .map_err(|e| e.to_string())
}
