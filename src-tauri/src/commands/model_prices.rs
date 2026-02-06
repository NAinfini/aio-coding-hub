//! Usage: Model pricing related Tauri commands.

use crate::app_state::{ensure_db_ready, DbInitState};
use crate::{blocking, cost_stats, model_price_aliases, model_prices, model_prices_sync};

#[tauri::command]
pub(crate) async fn model_prices_list(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    cli_key: String,
) -> Result<Vec<model_prices::ModelPriceSummary>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("model_prices_list", move || {
        model_prices::list_by_cli(&db, &cli_key)
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn model_price_upsert(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    cli_key: String,
    model: String,
    price_json: String,
) -> Result<model_prices::ModelPriceSummary, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("model_price_upsert", move || {
        model_prices::upsert(&db, &cli_key, &model, &price_json)
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn model_prices_sync_basellm(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    force: Option<bool>,
) -> Result<model_prices_sync::ModelPricesSyncReport, String> {
    let db = ensure_db_ready(app.clone(), db_state.inner()).await?;
    let report = model_prices_sync::sync_basellm(&app, db.clone(), force.unwrap_or(false))
        .await
        .map_err(|e| e.to_string())?;

    let db_for_backfill = db.clone();
    if let Err(err) = blocking::run(
        "model_prices_sync_basellm_backfill_missing_cost",
        move || {
            cost_stats::backfill_missing_v1(
                &db_for_backfill,
                "allTime",
                None,
                None,
                Some("claude"),
                None,
                None,
                5000,
            )
        },
    )
    .await
    {
        tracing::warn!("模型定价同步后缺失成本回填失败: {}", err);
    }

    Ok(report)
}

#[tauri::command]
pub(crate) async fn model_price_aliases_get(
    app: tauri::AppHandle,
) -> Result<model_price_aliases::ModelPriceAliasesV1, String> {
    blocking::run(
        "model_price_aliases_get",
        move || -> crate::shared::error::AppResult<model_price_aliases::ModelPriceAliasesV1> {
            Ok(model_price_aliases::read_fail_open(&app))
        },
    )
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn model_price_aliases_set(
    app: tauri::AppHandle,
    aliases: model_price_aliases::ModelPriceAliasesV1,
) -> Result<model_price_aliases::ModelPriceAliasesV1, String> {
    blocking::run("model_price_aliases_set", move || {
        model_price_aliases::write(&app, aliases)
    })
    .await
    .map_err(Into::into)
}
