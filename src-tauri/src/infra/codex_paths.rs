//! Usage: Resolve Codex user-level paths (supports $CODEX_HOME).

use std::path::{Path, PathBuf};
use tauri::Manager;

const ENV_CODEX_HOME: &str = "CODEX_HOME";

fn home_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .home_dir()
        .map_err(|e| format!("failed to resolve home dir: {e}"))
}

fn expand_tilde(home: &Path, raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed == "~" {
        return Some(home.to_path_buf());
    }

    let rest = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"));

    rest.map(|suffix| home.join(suffix))
}

fn resolve_under_home(home: &Path, raw: &str) -> PathBuf {
    if let Some(p) = expand_tilde(home, raw) {
        return p;
    }

    let candidate = PathBuf::from(raw);
    if candidate.is_absolute() {
        return candidate;
    }

    home.join(candidate)
}

pub fn codex_home_dir<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<PathBuf> {
    let home = home_dir(app)?;
    let raw = std::env::var(ENV_CODEX_HOME)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    Ok(match raw {
        Some(v) => resolve_under_home(&home, &v),
        None => home.join(".codex"),
    })
}

pub fn codex_config_toml_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<PathBuf> {
    Ok(codex_home_dir(app)?.join("config.toml"))
}

pub fn codex_auth_json_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<PathBuf> {
    Ok(codex_home_dir(app)?.join("auth.json"))
}

pub fn codex_agents_md_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<PathBuf> {
    Ok(codex_home_dir(app)?.join("AGENTS.md"))
}

pub fn codex_skills_dir<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<PathBuf> {
    Ok(codex_home_dir(app)?.join("skills"))
}

pub fn codex_sessions_dir<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<PathBuf> {
    Ok(codex_home_dir(app)?.join("sessions"))
}
