//! Usage: OAuth account related Tauri commands.

use crate::app_state::{ensure_db_ready, DbInitState};
use crate::blocking;
use crate::gateway::oauth::{callback_server, pkce, providers, token_exchange};
use crate::oauth_accounts;
use crate::shared::error::AppResult;
use crate::shared::time::now_unix_seconds;
use rand::RngCore;
use serde_json::Value;
use std::process::Command;
use tauri::Emitter;
use tokio::{task, time::Duration};

/// Codex usage/quota endpoint.
const CODEX_USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
/// Claude OAuth usage endpoint.
const CLAUDE_USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
/// User-Agent sent with Codex quota requests (matches upstream codex_cli_rs).
const CODEX_QUOTA_USER_AGENT: &str = "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal";

#[derive(Debug, Clone, serde::Serialize)]
pub(crate) struct OAuthAccountEditable {
    pub id: i64,
    pub cli_key: String,
    pub label: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub token_uri: Option<String>,
    pub expires_at: Option<i64>,
    pub last_refreshed_at: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub(crate) struct OAuthAccountLimitsSnapshot {
    pub account_id: i64,
    pub cli_key: String,
    pub limit_5h_text: Option<String>,
    pub limit_weekly_text: Option<String>,
    pub fetched_at: i64,
}

fn oauth_http_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(format!(
            "aio-coding-hub-oauth-command/{}",
            env!("CARGO_PKG_VERSION")
        ))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("SYSTEM_ERROR: oauth client init failed: {e}").into())
}

fn parse_status(raw: &str) -> AppResult<oauth_accounts::OAuthAccountStatus> {
    match raw.trim() {
        "active" => Ok(oauth_accounts::OAuthAccountStatus::Active),
        "quota_cooldown" => Ok(oauth_accounts::OAuthAccountStatus::QuotaCooldown),
        "disabled" => Ok(oauth_accounts::OAuthAccountStatus::Disabled),
        "expired" => Ok(oauth_accounts::OAuthAccountStatus::Expired),
        "error" => Ok(oauth_accounts::OAuthAccountStatus::Error),
        _ => Err(
            "SEC_INVALID_INPUT: status must be active|quota_cooldown|disabled|expired|error"
                .to_string()
                .into(),
        ),
    }
}

fn parse_remaining_percent_from_window(window: &Value) -> Option<f64> {
    if !window.is_object() {
        return None;
    }
    if let Some(used) = window
        .get("used_percent")
        .and_then(Value::as_f64)
        .or_else(|| window.get("usedPercent").and_then(Value::as_f64))
    {
        let remaining = (100.0 - used).clamp(0.0, 100.0);
        return Some(remaining);
    }
    let remaining = window
        .get("remaining_count")
        .and_then(Value::as_f64)
        .or_else(|| window.get("remainingCount").and_then(Value::as_f64));
    let total = window
        .get("total_count")
        .and_then(Value::as_f64)
        .or_else(|| window.get("totalCount").and_then(Value::as_f64));
    match (remaining, total) {
        (Some(rem), Some(t)) if t > 0.0 => Some((rem / t * 100.0).clamp(0.0, 100.0)),
        _ => None,
    }
}

fn format_percent_label(value: f64) -> String {
    format!("{:.0}%", value.clamp(0.0, 100.0))
}

fn parse_codex_limits(body: &Value) -> (Option<String>, Option<String>) {
    let rate_limit = body.get("rate_limit").unwrap_or(body);
    let primary = rate_limit
        .get("primary_window")
        .or_else(|| rate_limit.get("primaryWindow"))
        .or_else(|| body.get("5_hour_window"))
        .or_else(|| body.get("fiveHourWindow"));
    let secondary = rate_limit
        .get("secondary_window")
        .or_else(|| rate_limit.get("secondaryWindow"))
        .or_else(|| body.get("weekly_window"))
        .or_else(|| body.get("weeklyWindow"));

    let limit_5h = primary
        .and_then(parse_remaining_percent_from_window)
        .map(format_percent_label);
    let limit_weekly = secondary
        .and_then(parse_remaining_percent_from_window)
        .map(format_percent_label);
    (limit_5h, limit_weekly)
}

fn extract_utilization(window: &Value) -> Option<f64> {
    window
        .get("utilization")
        .and_then(Value::as_f64)
        .or_else(|| {
            window
                .get("utilization")
                .and_then(Value::as_str)?
                .parse::<f64>()
                .ok()
        })
}

fn parse_claude_limits(body: &Value) -> (Option<String>, Option<String>) {
    let limit_5h = body
        .get("five_hour")
        .and_then(extract_utilization)
        .map(|used| format_percent_label(100.0 - used));
    let limit_weekly = body
        .get("seven_day")
        .and_then(extract_utilization)
        .map(|used| format_percent_label(100.0 - used));
    (limit_5h, limit_weekly)
}

fn full_to_summary(full: oauth_accounts::OAuthAccount) -> oauth_accounts::OAuthAccountSummary {
    oauth_accounts::OAuthAccountSummary {
        id: full.id,
        cli_key: full.cli_key,
        label: full.label,
        email: full.email,
        provider_type: full.provider_type,
        expires_at: full.expires_at,
        refresh_lead_s: full.refresh_lead_s,
        status: full.status,
        last_error: full.last_error,
        last_refreshed_at: full.last_refreshed_at,
        quota_exceeded: full.quota_exceeded,
        quota_recover_at: full.quota_recover_at,
        created_at: full.created_at,
        updated_at: full.updated_at,
    }
}

fn full_to_editable(full: oauth_accounts::OAuthAccount) -> OAuthAccountEditable {
    OAuthAccountEditable {
        id: full.id,
        cli_key: full.cli_key,
        label: full.label,
        access_token: full.access_token,
        refresh_token: full.refresh_token,
        id_token: full.id_token,
        token_uri: full.token_uri,
        expires_at: full.expires_at,
        last_refreshed_at: full.last_refreshed_at,
    }
}

fn build_oauth_state() -> String {
    use rand::rngs::OsRng;
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn build_authorize_url(
    cfg: providers::OAuthProviderConfig,
    redirect_uri: &str,
    state: &str,
    code_challenge: &str,
) -> AppResult<String> {
    let mut url = reqwest::Url::parse(cfg.auth_url)
        .map_err(|e| format!("SYSTEM_ERROR: invalid oauth auth url: {e}"))?;
    {
        let scope = cfg.scopes.join(" ");
        let mut query = url.query_pairs_mut();
        query.append_pair("response_type", "code");
        query.append_pair("client_id", cfg.client_id);
        query.append_pair("redirect_uri", redirect_uri);
        query.append_pair("scope", &scope);
        query.append_pair("state", state);
        query.append_pair("code_challenge", code_challenge);
        query.append_pair("code_challenge_method", "S256");
        match cfg.key {
            providers::OAuthProviderKey::Claude => {
                query.append_pair("code", "true");
            }
            providers::OAuthProviderKey::Codex => {
                query.append_pair("id_token_add_organizations", "true");
                query.append_pair("codex_cli_simplified_flow", "true");
                query.append_pair("originator", "codex_cli_rs");
            }
            providers::OAuthProviderKey::Gemini => {
                query.append_pair("access_type", "offline");
                query.append_pair("prompt", "consent");
            }
        }
    }
    Ok(url.to_string())
}

fn open_browser(url: &str) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        build_windows_open_browser_command(url)
            .spawn()
            .map_err(|e| format!("SYSTEM_ERROR: failed to open browser: {e}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("SYSTEM_ERROR: failed to open browser: {e}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("SYSTEM_ERROR: failed to open browser: {e}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("SYSTEM_ERROR: browser open is unsupported on this platform"
        .to_string()
        .into())
}

#[cfg(target_os = "windows")]
fn build_windows_open_browser_command(url: &str) -> Command {
    let mut cmd = Command::new("rundll32.exe");
    // Use Windows URL protocol handler directly to force opening the default browser.
    // `explorer <url>` may open File Explorer for some URL shapes on certain setups.
    cmd.arg("url.dll,FileProtocolHandler").arg(url);
    cmd
}

#[cfg(all(test, target_os = "windows"))]
mod windows_open_browser_tests {
    use super::build_windows_open_browser_command;
    use std::ffi::OsStr;

    #[test]
    fn windows_browser_command_uses_protocol_handler() {
        let cmd = build_windows_open_browser_command("https://example.com/auth?x=1&y=2");

        assert_eq!(cmd.get_program(), OsStr::new("rundll32.exe"));
        let args = cmd
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert_eq!(
            args,
            vec![
                "url.dll,FileProtocolHandler",
                "https://example.com/auth?x=1&y=2"
            ]
        );
    }
}

#[tauri::command]
pub(crate) async fn oauth_accounts_list(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    cli_key: String,
) -> Result<Vec<oauth_accounts::OAuthAccountSummary>, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("oauth_accounts_list", move || {
        let conn = db.open_connection()?;
        oauth_accounts::list_by_cli(&conn, &cli_key)
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn oauth_account_get(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    id: i64,
) -> Result<OAuthAccountEditable, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run(
        "oauth_account_get",
        move || -> AppResult<OAuthAccountEditable> {
            let conn = db.open_connection()?;
            let full = oauth_accounts::get_by_id(&conn, id)?;
            Ok(full_to_editable(full))
        },
    )
    .await
    .map_err(Into::into)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn oauth_account_upsert(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    account_id: Option<i64>,
    cli_key: String,
    label: String,
    email: Option<String>,
    provider_type: String,
    access_token: Option<String>,
    refresh_token: Option<String>,
    id_token: Option<String>,
    token_uri: Option<String>,
    client_id: Option<String>,
    client_secret: Option<String>,
    expires_at: Option<i64>,
    last_refreshed_at: Option<i64>,
    refresh_lead_s: Option<i64>,
    status: Option<String>,
) -> Result<oauth_accounts::OAuthAccountSummary, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run("oauth_account_upsert", move || {
        let conn = db.open_connection()?;
        oauth_accounts::upsert(
            &conn,
            account_id,
            &cli_key,
            &label,
            email.as_deref(),
            &provider_type,
            access_token.as_deref(),
            refresh_token.as_deref(),
            id_token.as_deref(),
            token_uri.as_deref(),
            client_id.as_deref(),
            client_secret.as_deref(),
            expires_at,
            refresh_lead_s,
            last_refreshed_at,
            status.as_deref(),
        )
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn oauth_account_delete(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    id: i64,
) -> Result<bool, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run(
        "oauth_account_delete",
        move || -> crate::shared::error::AppResult<bool> {
            let conn = db.open_connection()?;
            oauth_accounts::delete(&conn, id)?;
            Ok(true)
        },
    )
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn oauth_account_set_status(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    id: i64,
    status: String,
    error: Option<String>,
) -> Result<oauth_accounts::OAuthAccountSummary, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    blocking::run(
        "oauth_account_set_status",
        move || -> AppResult<oauth_accounts::OAuthAccountSummary> {
            let conn = db.open_connection()?;
            oauth_accounts::mark_status(&conn, id, parse_status(&status)?, error.as_deref())?;
            let full = oauth_accounts::get_by_id(&conn, id)?;
            Ok(full_to_summary(full))
        },
    )
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn oauth_account_force_refresh(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    id: i64,
) -> Result<oauth_accounts::OAuthAccountSummary, String> {
    let db = ensure_db_ready(app.clone(), db_state.inner()).await?;

    let account = blocking::run("oauth_account_force_refresh_load", {
        let db = db.clone();
        move || -> AppResult<oauth_accounts::OAuthAccountForGateway> {
            let conn = db.open_connection()?;
            oauth_accounts::get_for_gateway(&conn, id)
        }
    })
    .await?;

    let client = oauth_http_client().map_err(|e| e.to_string())?;
    let refreshed = crate::gateway::oauth::refresh::refresh_account_access_token(&client, &account)
        .await
        .map_err(|e| e.to_string())?;
    let (effective_access_token, id_token_to_store) =
        token_exchange::resolve_effective_access_token(
            &account.cli_key,
            &refreshed,
            account.id_token.as_deref(),
        );
    let expires_at = refreshed.expires_at.or(account.expires_at);

    blocking::run(
        "oauth_account_force_refresh_save",
        move || -> AppResult<oauth_accounts::OAuthAccountSummary> {
            let conn = db.open_connection()?;
            oauth_accounts::update_tokens(
                &conn,
                id,
                &effective_access_token,
                id_token_to_store.as_deref(),
                expires_at,
                refreshed.refresh_token.as_deref(),
            )?;
            let full = oauth_accounts::get_by_id(&conn, id)?;
            Ok(full_to_summary(full))
        },
    )
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn oauth_account_manual_add(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    cli_key: String,
    label: String,
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
    token_uri: Option<String>,
    expires_at: Option<i64>,
    last_refreshed_at: Option<i64>,
) -> Result<oauth_accounts::OAuthAccountSummary, String> {
    if let Some(value) = last_refreshed_at {
        if value <= 0 {
            return Err("SEC_INVALID_INPUT: last_refreshed_at must be > 0".to_string());
        }
    }
    let db = ensure_db_ready(app, db_state.inner()).await?;
    let cfg = providers::config_for_cli_key(&cli_key)
        .ok_or_else(|| "SEC_INVALID_INPUT: unsupported cli_key for oauth".to_string())?;
    let token_uri = token_uri.unwrap_or_else(|| cfg.token_url.to_string());
    blocking::run("oauth_account_manual_add", move || {
        let conn = db.open_connection()?;
        oauth_accounts::upsert(
            &conn,
            None,
            &cli_key,
            &label,
            None,
            cfg.key.as_provider_type(),
            Some(&access_token),
            refresh_token.as_deref(),
            id_token.as_deref(),
            Some(&token_uri),
            Some(cfg.client_id),
            cfg.client_secret,
            expires_at,
            Some(3600),
            last_refreshed_at,
            Some("active"),
        )
    })
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub(crate) async fn oauth_start_login(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    account_id: Option<i64>,
    cli_key: String,
    provider_type: String,
    label: String,
) -> Result<oauth_accounts::OAuthAccountSummary, String> {
    let db = ensure_db_ready(app.clone(), db_state.inner()).await?;
    let cfg = providers::config_for_provider_type(&provider_type)
        .ok_or_else(|| "SEC_INVALID_INPUT: unsupported provider_type".to_string())?;
    if cfg.key.as_cli_key() != cli_key.trim() {
        return Err("SEC_INVALID_INPUT: cli_key/provider_type mismatch".to_string());
    }

    let pkce = pkce::generate_pkce_pair();
    let state = build_oauth_state();
    let callback_listener = callback_server::bind_callback_listener(cfg.default_callback_port)
        .await
        .map_err(|e| e.to_string())?;
    let callback_port = callback_listener.port();
    let redirect_uri = providers::make_redirect_uri(cfg, callback_port);
    let auth_url = build_authorize_url(cfg, &redirect_uri, &state, &pkce.code_challenge)
        .map_err(|e| e.to_string())?;

    let _ = app.emit(
        "oauth-login-progress",
        serde_json::json!({ "cli_key": cli_key.as_str(), "step": "waiting_callback" }),
    );
    let callback_state = state.clone();
    let callback_task = task::spawn(async move {
        callback_server::wait_for_callback(
            callback_listener,
            &callback_state,
            Duration::from_secs(300),
        )
        .await
    });
    // Yield once so the callback task can bind the local listener before browser redirect happens.
    task::yield_now().await;

    if let Err(err) = open_browser(&auth_url) {
        callback_task.abort();
        let _ = app.emit(
            "oauth-login-progress",
            serde_json::json!({ "cli_key": cli_key.as_str(), "step": "error" }),
        );
        return Err(err.to_string());
    }

    let callback_payload = callback_task
        .await
        .map_err(|e| format!("SYSTEM_ERROR: oauth callback task failed: {e}"))?
        .map_err(|e| e.to_string())?;
    if let Some(err_code) = callback_payload.error.as_deref() {
        let description = callback_payload
            .error_description
            .as_deref()
            .unwrap_or("oauth login failed");
        let _ = app.emit(
            "oauth-login-progress",
            serde_json::json!({ "cli_key": cli_key.as_str(), "step": "error" }),
        );
        return Err(format!(
            "SYSTEM_ERROR: oauth provider returned error={err_code}: {description}"
        ));
    }
    let code = callback_payload
        .code
        .ok_or_else(|| "SYSTEM_ERROR: oauth callback missing code".to_string())?;

    let _ = app.emit(
        "oauth-login-progress",
        serde_json::json!({ "cli_key": cli_key.as_str(), "step": "exchanging" }),
    );

    let client = oauth_http_client().map_err(|e| e.to_string())?;
    let token_set = token_exchange::exchange_authorization_code(
        &client,
        &token_exchange::TokenExchangeRequest {
            token_uri: cfg.token_url.to_string(),
            client_id: cfg.client_id.to_string(),
            client_secret: cfg.client_secret.map(str::to_string),
            code,
            redirect_uri: redirect_uri.clone(),
            code_verifier: pkce.code_verifier,
        },
    )
    .await
    .map_err(|e| e.to_string())?;
    let (effective_access_token, id_token_to_store) =
        token_exchange::resolve_effective_access_token(&cli_key, &token_set, None);

    let cli_key_for_save = cli_key.clone();
    let label_for_save = label.clone();
    let provider_type_for_save = provider_type.clone();
    let summary = blocking::run("oauth_start_login_save_account", move || {
        let conn = db.open_connection()?;
        oauth_accounts::upsert(
            &conn,
            account_id,
            &cli_key_for_save,
            &label_for_save,
            None,
            &provider_type_for_save,
            Some(&effective_access_token),
            token_set.refresh_token.as_deref(),
            id_token_to_store.as_deref(),
            Some(cfg.token_url),
            Some(cfg.client_id),
            cfg.client_secret,
            token_set.expires_at,
            Some(3600),
            None,
            Some("active"),
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    let _ = app.emit(
        "oauth-login-progress",
        serde_json::json!({ "cli_key": cli_key.as_str(), "step": "done" }),
    );

    Ok(summary)
}

#[tauri::command]
pub(crate) async fn oauth_account_fetch_limits(
    app: tauri::AppHandle,
    db_state: tauri::State<'_, DbInitState>,
    id: i64,
) -> Result<OAuthAccountLimitsSnapshot, String> {
    let db = ensure_db_ready(app, db_state.inner()).await?;
    let account = blocking::run("oauth_account_fetch_limits_load", move || {
        let conn = db.open_connection()?;
        oauth_accounts::get_by_id(&conn, id)
    })
    .await
    .map_err(|e| e.to_string())?;

    let client = oauth_http_client().map_err(|e| e.to_string())?;

    let (limit_5h_text, limit_weekly_text) = match account.cli_key.as_str() {
        "codex" => {
            let response = client
                .get(CODEX_USAGE_URL)
                .header("Authorization", format!("Bearer {}", account.access_token))
                .header("User-Agent", CODEX_QUOTA_USER_AGENT)
                .header("Content-Type", "application/json")
                .send()
                .await
                .map_err(|e| format!("SYSTEM_ERROR: codex quota request failed: {e}"))?;
            if !response.status().is_success() {
                return Err(format!(
                    "SYSTEM_ERROR: codex quota request failed with status {}",
                    response.status()
                ));
            }
            let body = response
                .json::<Value>()
                .await
                .map_err(|e| format!("SYSTEM_ERROR: codex quota parse failed: {e}"))?;
            parse_codex_limits(&body)
        }
        "claude" => {
            let response = client
                .get(CLAUDE_USAGE_URL)
                .header("Authorization", format!("Bearer {}", account.access_token))
                .header("anthropic-beta", "oauth-2025-04-20")
                .header("Accept", "application/json")
                .send()
                .await
                .map_err(|e| format!("SYSTEM_ERROR: claude quota request failed: {e}"))?;
            if !response.status().is_success() {
                return Err(format!(
                    "SYSTEM_ERROR: claude quota request failed with status {}",
                    response.status()
                ));
            }
            let body = response
                .json::<Value>()
                .await
                .map_err(|e| format!("SYSTEM_ERROR: claude quota parse failed: {e}"))?;
            parse_claude_limits(&body)
        }
        "gemini" => {
            return Err(
                "SYSTEM_ERROR: Gemini limit fetch requires project context; not supported from account-only fetch"
                    .to_string(),
            )
        }
        _ => return Err("SEC_INVALID_INPUT: unsupported cli_key for oauth limit fetch".to_string()),
    };

    Ok(OAuthAccountLimitsSnapshot {
        account_id: account.id,
        cli_key: account.cli_key,
        limit_5h_text,
        limit_weekly_text,
        fetched_at: now_unix_seconds(),
    })
}
