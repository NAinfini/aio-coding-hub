//! Usage: Read / patch Codex user-level `config.toml` ($CODEX_HOME/config.toml).

use crate::codex_paths;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
pub struct CodexConfigState {
    pub config_dir: String,
    pub config_path: String,
    pub can_open_config_dir: bool,
    pub exists: bool,

    pub model: Option<String>,
    pub approval_policy: Option<String>,
    pub sandbox_mode: Option<String>,
    pub model_reasoning_effort: Option<String>,
    pub file_opener: Option<String>,
    pub hide_agent_reasoning: Option<bool>,
    pub show_raw_agent_reasoning: Option<bool>,

    pub history_persistence: Option<String>,
    pub history_max_bytes: Option<u64>,

    pub sandbox_workspace_write_network_access: Option<bool>,

    pub tui_animations: Option<bool>,
    pub tui_alternate_screen: Option<String>,
    pub tui_show_tooltips: Option<bool>,
    pub tui_scroll_invert: Option<bool>,

    pub features_unified_exec: Option<bool>,
    pub features_shell_snapshot: Option<bool>,
    pub features_apply_patch_freeform: Option<bool>,
    pub features_web_search_request: Option<bool>,
    pub features_shell_tool: Option<bool>,
    pub features_exec_policy: Option<bool>,
    pub features_experimental_windows_sandbox: Option<bool>,
    pub features_elevated_windows_sandbox: Option<bool>,
    pub features_remote_compaction: Option<bool>,
    pub features_remote_models: Option<bool>,
    pub features_powershell_utf8: Option<bool>,
    pub features_child_agents_md: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CodexConfigPatch {
    pub model: Option<String>,
    pub approval_policy: Option<String>,
    pub sandbox_mode: Option<String>,
    pub model_reasoning_effort: Option<String>,
    pub file_opener: Option<String>,
    pub hide_agent_reasoning: Option<bool>,
    pub show_raw_agent_reasoning: Option<bool>,

    pub history_persistence: Option<String>,
    pub history_max_bytes: Option<u64>,

    pub sandbox_workspace_write_network_access: Option<bool>,

    pub tui_animations: Option<bool>,
    pub tui_alternate_screen: Option<String>,
    pub tui_show_tooltips: Option<bool>,
    pub tui_scroll_invert: Option<bool>,

    pub features_unified_exec: Option<bool>,
    pub features_shell_snapshot: Option<bool>,
    pub features_apply_patch_freeform: Option<bool>,
    pub features_web_search_request: Option<bool>,
    pub features_shell_tool: Option<bool>,
    pub features_exec_policy: Option<bool>,
    pub features_experimental_windows_sandbox: Option<bool>,
    pub features_elevated_windows_sandbox: Option<bool>,
    pub features_remote_compaction: Option<bool>,
    pub features_remote_models: Option<bool>,
    pub features_powershell_utf8: Option<bool>,
    pub features_child_agents_md: Option<bool>,
}

fn is_symlink(path: &Path) -> Result<bool, String> {
    std::fs::symlink_metadata(path)
        .map(|m| m.file_type().is_symlink())
        .map_err(|e| format!("failed to read metadata {}: {e}", path.display()))
}

fn read_optional_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read(path)
        .map(Some)
        .map_err(|e| format!("failed to read {}: {e}", path.display()))
}

fn write_file_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create dir {}: {e}", parent.display()))?;
    }

    let file_name = path.file_name().and_then(|v| v.to_str()).unwrap_or("file");
    let tmp_path = path.with_file_name(format!("{file_name}.aio-tmp"));

    std::fs::write(&tmp_path, bytes)
        .map_err(|e| format!("failed to write temp file {}: {e}", tmp_path.display()))?;

    if path.exists() {
        let _ = std::fs::remove_file(path);
    }

    std::fs::rename(&tmp_path, path)
        .map_err(|e| format!("failed to finalize file {}: {e}", path.display()))?;

    Ok(())
}

fn write_file_atomic_if_changed(path: &Path, bytes: &[u8]) -> Result<bool, String> {
    if let Ok(existing) = std::fs::read(path) {
        if existing == bytes {
            return Ok(false);
        }
    }

    write_file_atomic(path, bytes)?;
    Ok(true)
}

fn strip_toml_comment(line: &str) -> &str {
    let mut in_single = false;
    let mut in_double = false;
    let mut escaped = false;

    for (idx, ch) in line.char_indices() {
        if in_double {
            if escaped {
                escaped = false;
                continue;
            }
            if ch == '\\' {
                escaped = true;
                continue;
            }
            if ch == '"' {
                in_double = false;
            }
            continue;
        }

        if in_single {
            if ch == '\'' {
                in_single = false;
            }
            continue;
        }

        match ch {
            '"' => in_double = true,
            '\'' => in_single = true,
            '#' => return &line[..idx],
            _ => {}
        }
    }

    line
}

fn parse_table_header(trimmed: &str) -> Option<String> {
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return None;
    }
    if trimmed.starts_with("[[") {
        return None;
    }

    let inner = trimmed.trim_start_matches('[').trim_end_matches(']').trim();

    if inner.is_empty() {
        return None;
    }

    Some(inner.to_string())
}

fn parse_assignment(trimmed: &str) -> Option<(String, String)> {
    let (k, v) = trimmed.split_once('=')?;
    let key = k.trim();
    if key.is_empty() {
        return None;
    }
    Some((key.to_string(), v.trim().to_string()))
}

fn toml_unquote_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() < 2 {
        return None;
    }
    if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        return Some(trimmed[1..trimmed.len() - 1].to_string());
    }
    None
}

fn parse_bool(value: &str) -> Option<bool> {
    match value.trim() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

fn parse_u64(value: &str) -> Option<u64> {
    let raw = value.trim();
    if raw.is_empty() {
        return None;
    }
    raw.parse::<u64>().ok()
}

fn parse_string(value: &str) -> Option<String> {
    toml_unquote_string(value).or_else(|| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_key(raw: &str) -> String {
    let trimmed = raw.trim();
    toml_unquote_string(trimmed).unwrap_or_else(|| trimmed.to_string())
}

fn key_table_and_name(current_table: Option<&str>, key: &str) -> (Option<String>, String) {
    if let Some((t, k)) = key.split_once('.') {
        let t = normalize_key(t);
        let k = normalize_key(k);
        if !t.is_empty() && !k.is_empty() && !k.contains('.') {
            return (Some(t), k);
        }
    }

    let k = normalize_key(key);
    let table = current_table.map(|t| t.to_string());
    (table, k)
}

fn is_allowed_value(value: &str, allowed: &[&str]) -> bool {
    allowed.iter().any(|v| v.eq_ignore_ascii_case(value))
}

fn validate_enum_or_empty(key: &str, value: &str, allowed: &[&str]) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    if is_allowed_value(trimmed, allowed) {
        return Ok(());
    }
    Err(format!(
        "SEC_INVALID_INPUT: invalid {key}={trimmed} (allowed: {})",
        allowed.join(", ")
    ))
}

fn toml_escape_basic_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c.is_control() => {
                let code = c as u32;
                out.push_str(&format!("\\u{:04X}", code));
            }
            c => out.push(c),
        }
    }
    out
}

fn toml_string_literal(value: &str) -> String {
    format!("\"{}\"", toml_escape_basic_string(value))
}

fn upsert_root_key(lines: &mut Vec<String>, key: &str, value: Option<String>) {
    let first_table = lines
        .iter()
        .position(|l| l.trim().starts_with('['))
        .unwrap_or(lines.len());

    let mut target_idx: Option<usize> = None;
    for (idx, line) in lines.iter().take(first_table).enumerate() {
        let cleaned = strip_toml_comment(line).trim();
        if cleaned.is_empty() || cleaned.starts_with('#') {
            continue;
        }
        let Some((k, _)) = parse_assignment(cleaned) else {
            continue;
        };
        if normalize_key(&k) == key {
            target_idx = Some(idx);
            break;
        }
    }

    match (target_idx, value) {
        (Some(idx), Some(v)) => {
            lines[idx] = format!("{key} = {v}");
        }
        (Some(idx), None) => {
            lines.remove(idx);
        }
        (None, Some(v)) => {
            let mut insert_at = 0;
            while insert_at < first_table {
                let trimmed = lines[insert_at].trim_start();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    insert_at += 1;
                    continue;
                }
                break;
            }
            lines.insert(insert_at, format!("{key} = {v}"));
            if insert_at + 1 < lines.len() && !lines[insert_at + 1].trim().is_empty() {
                lines.insert(insert_at + 1, String::new());
            }
        }
        (None, None) => {}
    }
}

fn find_table_block(lines: &[String], table_header: &str) -> Option<(usize, usize)> {
    let mut start: Option<usize> = None;
    for (idx, line) in lines.iter().enumerate() {
        if line.trim() == table_header {
            start = Some(idx);
            break;
        }
    }
    let start = start?;
    let end = lines[start.saturating_add(1)..]
        .iter()
        .position(|line| line.trim().starts_with('['))
        .map(|offset| start + 1 + offset)
        .unwrap_or(lines.len());
    Some((start, end))
}

fn upsert_table_keys(lines: &mut Vec<String>, table: &str, items: Vec<(&str, Option<String>)>) {
    let header = format!("[{table}]");
    let has_any_value = items.iter().any(|(_, v)| v.is_some());

    if find_table_block(lines, &header).is_none() {
        if !has_any_value {
            return;
        }
        if !lines.is_empty() && !lines.last().unwrap_or(&String::new()).trim().is_empty() {
            lines.push(String::new());
        }
        lines.push(header.clone());
        lines.push(String::new());
    }

    for (key, value) in items {
        let Some((start, end)) = find_table_block(lines, &header) else {
            return;
        };

        let mut found_idx: Option<usize> = None;
        for (idx, line) in lines
            .iter()
            .enumerate()
            .take(end.min(lines.len()))
            .skip(start + 1)
        {
            let cleaned = strip_toml_comment(line).trim();
            if cleaned.is_empty() || cleaned.starts_with('#') {
                continue;
            }
            let Some((k, _)) = parse_assignment(cleaned) else {
                continue;
            };
            if normalize_key(&k) == key {
                found_idx = Some(idx);
                break;
            }
        }

        match (found_idx, value) {
            (Some(idx), Some(v)) => lines[idx] = format!("{key} = {v}"),
            (Some(idx), None) => {
                lines.remove(idx);
            }
            (None, Some(v)) => {
                let insert_at = end.min(lines.len());
                lines.insert(insert_at, format!("{key} = {v}"));
            }
            (None, None) => {}
        }
    }

    // Keep a blank line after the table if it's not the last block.
    if let Some((_, end2)) = find_table_block(lines, &header) {
        if end2 < lines.len() && !lines[end2 - 1].trim().is_empty() {
            lines.insert(end2, String::new());
        }
    }
}

fn upsert_dotted_keys(lines: &mut Vec<String>, table: &str, items: Vec<(&str, Option<String>)>) {
    let first_table = lines
        .iter()
        .position(|l| l.trim().starts_with('['))
        .unwrap_or(lines.len());

    for (key, value) in items {
        let full_key = format!("{table}.{key}");
        let mut found_idx: Option<usize> = None;
        for (idx, line) in lines.iter().enumerate() {
            let cleaned = strip_toml_comment(line).trim();
            if cleaned.is_empty() || cleaned.starts_with('#') {
                continue;
            }
            let Some((k, _)) = parse_assignment(cleaned) else {
                continue;
            };
            if normalize_key(&k) == full_key {
                found_idx = Some(idx);
                break;
            }
        }

        match (found_idx, value) {
            (Some(idx), Some(v)) => lines[idx] = format!("{full_key} = {v}"),
            (Some(idx), None) => {
                lines.remove(idx);
            }
            (None, Some(v)) => {
                let mut insert_at = 0;
                while insert_at < first_table {
                    let trimmed = lines[insert_at].trim_start();
                    if trimmed.is_empty() || trimmed.starts_with('#') {
                        insert_at += 1;
                        continue;
                    }
                    break;
                }
                lines.insert(insert_at, format!("{full_key} = {v}"));
                if insert_at + 1 < lines.len() && !lines[insert_at + 1].trim().is_empty() {
                    lines.insert(insert_at + 1, String::new());
                }
            }
            (None, None) => {}
        }
    }
}

fn remove_dotted_keys(lines: &mut Vec<String>, table: &str, keys: &[&str]) {
    let mut to_remove: Vec<usize> = Vec::new();
    let target_prefix = format!("{table}.");

    for (idx, line) in lines.iter().enumerate() {
        let cleaned = strip_toml_comment(line).trim();
        if cleaned.is_empty() || cleaned.starts_with('#') {
            continue;
        }
        let Some((k, _)) = parse_assignment(cleaned) else {
            continue;
        };
        let key = normalize_key(&k);
        if !key.starts_with(&target_prefix) {
            continue;
        }
        let Some((_t, suffix)) = key.split_once('.') else {
            continue;
        };
        if keys.iter().any(|wanted| wanted == &suffix) {
            to_remove.push(idx);
        }
    }

    to_remove.sort_unstable();
    to_remove.dedup();
    for idx in to_remove.into_iter().rev() {
        lines.remove(idx);
    }
}

enum TableStyle {
    Table,
    Dotted,
}

fn table_style(lines: &[String], table: &str) -> TableStyle {
    let header = format!("[{table}]");
    if lines.iter().any(|l| l.trim() == header) {
        return TableStyle::Table;
    }

    let prefix = format!("{table}.");
    if lines.iter().any(|l| {
        let cleaned = strip_toml_comment(l).trim();
        if cleaned.is_empty() || cleaned.starts_with('#') {
            return false;
        }
        let Some((k, _)) = parse_assignment(cleaned) else {
            return false;
        };
        normalize_key(&k).starts_with(&prefix)
    }) {
        return TableStyle::Dotted;
    }

    TableStyle::Table
}

/// Unified upsert that auto-detects and applies the appropriate table style.
fn upsert_keys_auto_style(
    lines: &mut Vec<String>,
    table: &str,
    dotted_keys: &[&str],
    items: Vec<(&str, Option<String>)>,
) {
    match table_style(lines, table) {
        TableStyle::Table => {
            remove_dotted_keys(lines, table, dotted_keys);
            upsert_table_keys(lines, table, items);
        }
        TableStyle::Dotted => {
            upsert_dotted_keys(lines, table, items);
        }
    }
}

/// Helper to convert bool to TOML string literal.
fn bool_to_toml_str(value: bool) -> String {
    if value { "true" } else { "false" }.to_string()
}

/// Helper to build optional string value from Option<String>, trimming and filtering empty.
fn opt_string_value(raw: Option<&String>) -> Option<String> {
    raw.as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(toml_string_literal)
}

/// Helper to build optional u64 value, treating 0 as None (remove from config).
fn opt_u64_value(value: Option<u64>) -> Option<String> {
    value
        .and_then(|n| if n == 0 { None } else { Some(n) })
        .map(|n| n.to_string())
}

fn make_state_from_bytes(
    config_dir: String,
    config_path: String,
    can_open_config_dir: bool,
    bytes: Option<Vec<u8>>,
) -> Result<CodexConfigState, String> {
    let exists = bytes.is_some();
    let mut state = CodexConfigState {
        config_dir,
        config_path,
        can_open_config_dir,
        exists,

        model: None,
        approval_policy: None,
        sandbox_mode: None,
        model_reasoning_effort: None,
        file_opener: None,
        hide_agent_reasoning: None,
        show_raw_agent_reasoning: None,

        history_persistence: None,
        history_max_bytes: None,

        sandbox_workspace_write_network_access: None,

        tui_animations: None,
        tui_alternate_screen: None,
        tui_show_tooltips: None,
        tui_scroll_invert: None,

        features_unified_exec: None,
        features_shell_snapshot: None,
        features_apply_patch_freeform: None,
        features_web_search_request: None,
        features_shell_tool: None,
        features_exec_policy: None,
        features_experimental_windows_sandbox: None,
        features_elevated_windows_sandbox: None,
        features_remote_compaction: None,
        features_remote_models: None,
        features_powershell_utf8: None,
        features_child_agents_md: None,
    };

    let Some(bytes) = bytes else {
        return Ok(state);
    };

    let s = String::from_utf8(bytes)
        .map_err(|_| "SEC_INVALID_INPUT: codex config.toml must be valid UTF-8".to_string())?;

    let mut current_table: Option<String> = None;
    for raw_line in s.lines() {
        let line = strip_toml_comment(raw_line);
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        if let Some(table) = parse_table_header(trimmed) {
            current_table = Some(table);
            continue;
        }

        let Some((raw_key, raw_value)) = parse_assignment(trimmed) else {
            continue;
        };

        let (table, key) = key_table_and_name(current_table.as_deref(), &raw_key);
        let table = table.as_deref().unwrap_or("");

        match (table, key.as_str()) {
            ("", "model") => state.model = parse_string(&raw_value),
            ("", "approval_policy") => state.approval_policy = parse_string(&raw_value),
            ("", "sandbox_mode") => state.sandbox_mode = parse_string(&raw_value),
            ("", "model_reasoning_effort") => {
                state.model_reasoning_effort = parse_string(&raw_value)
            }
            ("", "file_opener") => state.file_opener = parse_string(&raw_value),
            ("", "hide_agent_reasoning") => state.hide_agent_reasoning = parse_bool(&raw_value),
            ("", "show_raw_agent_reasoning") => {
                state.show_raw_agent_reasoning = parse_bool(&raw_value)
            }

            ("history", "persistence") => state.history_persistence = parse_string(&raw_value),
            ("history", "max_bytes") => state.history_max_bytes = parse_u64(&raw_value),

            ("sandbox_workspace_write", "network_access") => {
                state.sandbox_workspace_write_network_access = parse_bool(&raw_value)
            }

            ("tui", "animations") => state.tui_animations = parse_bool(&raw_value),
            ("tui", "alternate_screen") => state.tui_alternate_screen = parse_string(&raw_value),
            ("tui", "show_tooltips") => state.tui_show_tooltips = parse_bool(&raw_value),
            ("tui", "scroll_invert") => state.tui_scroll_invert = parse_bool(&raw_value),

            ("features", "unified_exec") => state.features_unified_exec = parse_bool(&raw_value),
            ("features", "shell_snapshot") => {
                state.features_shell_snapshot = parse_bool(&raw_value)
            }
            ("features", "apply_patch_freeform") => {
                state.features_apply_patch_freeform = parse_bool(&raw_value)
            }
            ("features", "web_search_request") => {
                state.features_web_search_request = parse_bool(&raw_value)
            }
            ("features", "shell_tool") => state.features_shell_tool = parse_bool(&raw_value),
            ("features", "exec_policy") => state.features_exec_policy = parse_bool(&raw_value),
            ("features", "experimental_windows_sandbox") => {
                state.features_experimental_windows_sandbox = parse_bool(&raw_value)
            }
            ("features", "elevated_windows_sandbox") => {
                state.features_elevated_windows_sandbox = parse_bool(&raw_value)
            }
            ("features", "remote_compaction") => {
                state.features_remote_compaction = parse_bool(&raw_value)
            }
            ("features", "remote_models") => state.features_remote_models = parse_bool(&raw_value),
            ("features", "powershell_utf8") => {
                state.features_powershell_utf8 = parse_bool(&raw_value)
            }
            ("features", "child_agents_md") => {
                state.features_child_agents_md = parse_bool(&raw_value)
            }

            _ => {}
        }
    }

    Ok(state)
}

pub fn codex_config_get(app: &tauri::AppHandle) -> Result<CodexConfigState, String> {
    let path = codex_paths::codex_config_toml_path(app)?;
    let dir = path.parent().unwrap_or(Path::new("")).to_path_buf();
    let bytes = read_optional_file(&path)?;

    let can_open_config_dir = app
        .path()
        .home_dir()
        .ok()
        .map(|home| {
            let allowed_root = home.join(".codex");
            path_is_under_allowed_root(&dir, &allowed_root)
        })
        .unwrap_or(false);

    make_state_from_bytes(
        dir.to_string_lossy().to_string(),
        path.to_string_lossy().to_string(),
        can_open_config_dir,
        bytes,
    )
}

#[cfg(windows)]
fn normalize_path_for_prefix_match(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

#[cfg(windows)]
fn path_is_under_allowed_root(dir: &Path, allowed_root: &Path) -> bool {
    let dir_s = normalize_path_for_prefix_match(dir);
    let root_s = normalize_path_for_prefix_match(allowed_root);
    dir_s == root_s || dir_s.starts_with(&(root_s + "/"))
}

#[cfg(not(windows))]
fn path_is_under_allowed_root(dir: &Path, allowed_root: &Path) -> bool {
    dir.starts_with(allowed_root)
}

fn patch_config_toml(current: Option<Vec<u8>>, patch: CodexConfigPatch) -> Result<Vec<u8>, String> {
    validate_enum_or_empty(
        "approval_policy",
        patch.approval_policy.as_deref().unwrap_or(""),
        &["untrusted", "on-failure", "on-request", "never"],
    )?;
    validate_enum_or_empty(
        "sandbox_mode",
        patch.sandbox_mode.as_deref().unwrap_or(""),
        &["read-only", "workspace-write", "danger-full-access"],
    )?;
    validate_enum_or_empty(
        "model_reasoning_effort",
        patch.model_reasoning_effort.as_deref().unwrap_or(""),
        &["minimal", "low", "medium", "high", "xhigh"],
    )?;
    validate_enum_or_empty(
        "file_opener",
        patch.file_opener.as_deref().unwrap_or(""),
        &["vscode", "vscode-insiders", "windsurf", "cursor", "none"],
    )?;
    validate_enum_or_empty(
        "history.persistence",
        patch.history_persistence.as_deref().unwrap_or(""),
        &["save-all", "none"],
    )?;
    validate_enum_or_empty(
        "tui.alternate_screen",
        patch.tui_alternate_screen.as_deref().unwrap_or(""),
        &["auto", "always", "never"],
    )?;

    let input = match current {
        Some(bytes) => String::from_utf8(bytes)
            .map_err(|_| "SEC_INVALID_INPUT: codex config.toml must be valid UTF-8".to_string())?,
        None => String::new(),
    };

    let mut lines: Vec<String> = if input.is_empty() {
        Vec::new()
    } else {
        input.lines().map(|l| l.to_string()).collect()
    };

    if let Some(raw) = patch.model.as_deref() {
        let trimmed = raw.trim();
        upsert_root_key(
            &mut lines,
            "model",
            (!trimmed.is_empty()).then(|| toml_string_literal(trimmed)),
        );
    }
    if let Some(raw) = patch.approval_policy.as_deref() {
        let trimmed = raw.trim();
        upsert_root_key(
            &mut lines,
            "approval_policy",
            (!trimmed.is_empty()).then(|| toml_string_literal(trimmed)),
        );
    }
    if let Some(raw) = patch.sandbox_mode.as_deref() {
        let trimmed = raw.trim();
        upsert_root_key(
            &mut lines,
            "sandbox_mode",
            (!trimmed.is_empty()).then(|| toml_string_literal(trimmed)),
        );
    }
    if let Some(raw) = patch.model_reasoning_effort.as_deref() {
        let trimmed = raw.trim();
        upsert_root_key(
            &mut lines,
            "model_reasoning_effort",
            (!trimmed.is_empty()).then(|| toml_string_literal(trimmed)),
        );
    }
    if let Some(raw) = patch.file_opener.as_deref() {
        let trimmed = raw.trim();
        upsert_root_key(
            &mut lines,
            "file_opener",
            (!trimmed.is_empty()).then(|| toml_string_literal(trimmed)),
        );
    }
    if let Some(v) = patch.hide_agent_reasoning {
        upsert_root_key(
            &mut lines,
            "hide_agent_reasoning",
            Some(if v { "true" } else { "false" }.to_string()),
        );
    }
    if let Some(v) = patch.show_raw_agent_reasoning {
        upsert_root_key(
            &mut lines,
            "show_raw_agent_reasoning",
            Some(if v { "true" } else { "false" }.to_string()),
        );
    }

    // history.*
    if patch.history_persistence.is_some() || patch.history_max_bytes.is_some() {
        upsert_keys_auto_style(
            &mut lines,
            "history",
            &["persistence", "max_bytes"],
            vec![
                (
                    "persistence",
                    opt_string_value(patch.history_persistence.as_ref()),
                ),
                ("max_bytes", opt_u64_value(patch.history_max_bytes)),
            ],
        );
    }

    // sandbox_workspace_write.*
    if let Some(v) = patch.sandbox_workspace_write_network_access {
        upsert_keys_auto_style(
            &mut lines,
            "sandbox_workspace_write",
            &["network_access"],
            vec![("network_access", Some(bool_to_toml_str(v)))],
        );
    }

    // tui.*
    let has_any_tui_patch = patch.tui_animations.is_some()
        || patch.tui_alternate_screen.is_some()
        || patch.tui_show_tooltips.is_some()
        || patch.tui_scroll_invert.is_some();
    if has_any_tui_patch {
        let tui_keys = [
            "animations",
            "alternate_screen",
            "show_tooltips",
            "scroll_invert",
        ];
        upsert_keys_auto_style(
            &mut lines,
            "tui",
            &tui_keys,
            vec![
                ("animations", patch.tui_animations.map(bool_to_toml_str)),
                (
                    "alternate_screen",
                    opt_string_value(patch.tui_alternate_screen.as_ref()),
                ),
                (
                    "show_tooltips",
                    patch.tui_show_tooltips.map(bool_to_toml_str),
                ),
                (
                    "scroll_invert",
                    patch.tui_scroll_invert.map(bool_to_toml_str),
                ),
            ],
        );
    }

    // features.*
    let has_any_feature_patch = patch.features_unified_exec.is_some()
        || patch.features_shell_snapshot.is_some()
        || patch.features_apply_patch_freeform.is_some()
        || patch.features_web_search_request.is_some()
        || patch.features_shell_tool.is_some()
        || patch.features_exec_policy.is_some()
        || patch.features_experimental_windows_sandbox.is_some()
        || patch.features_elevated_windows_sandbox.is_some()
        || patch.features_remote_compaction.is_some()
        || patch.features_remote_models.is_some()
        || patch.features_powershell_utf8.is_some()
        || patch.features_child_agents_md.is_some();

    if has_any_feature_patch {
        let features_keys = [
            "unified_exec",
            "shell_snapshot",
            "apply_patch_freeform",
            "web_search_request",
            "shell_tool",
            "exec_policy",
            "experimental_windows_sandbox",
            "elevated_windows_sandbox",
            "remote_compaction",
            "remote_models",
            "powershell_utf8",
            "child_agents_md",
        ];
        upsert_keys_auto_style(
            &mut lines,
            "features",
            &features_keys,
            vec![
                (
                    "unified_exec",
                    patch.features_unified_exec.map(bool_to_toml_str),
                ),
                (
                    "shell_snapshot",
                    patch.features_shell_snapshot.map(bool_to_toml_str),
                ),
                (
                    "apply_patch_freeform",
                    patch.features_apply_patch_freeform.map(bool_to_toml_str),
                ),
                (
                    "web_search_request",
                    patch.features_web_search_request.map(bool_to_toml_str),
                ),
                (
                    "shell_tool",
                    patch.features_shell_tool.map(bool_to_toml_str),
                ),
                (
                    "exec_policy",
                    patch.features_exec_policy.map(bool_to_toml_str),
                ),
                (
                    "experimental_windows_sandbox",
                    patch
                        .features_experimental_windows_sandbox
                        .map(bool_to_toml_str),
                ),
                (
                    "elevated_windows_sandbox",
                    patch
                        .features_elevated_windows_sandbox
                        .map(bool_to_toml_str),
                ),
                (
                    "remote_compaction",
                    patch.features_remote_compaction.map(bool_to_toml_str),
                ),
                (
                    "remote_models",
                    patch.features_remote_models.map(bool_to_toml_str),
                ),
                (
                    "powershell_utf8",
                    patch.features_powershell_utf8.map(bool_to_toml_str),
                ),
                (
                    "child_agents_md",
                    patch.features_child_agents_md.map(bool_to_toml_str),
                ),
            ],
        );
    }

    if !lines.is_empty() && !lines.last().unwrap_or(&String::new()).trim().is_empty() {
        lines.push(String::new());
    }

    let mut out = lines.join("\n");
    out.push('\n');
    Ok(out.into_bytes())
}

pub fn codex_config_set(
    app: &tauri::AppHandle,
    patch: CodexConfigPatch,
) -> Result<CodexConfigState, String> {
    let path = codex_paths::codex_config_toml_path(app)?;
    if path.exists() && is_symlink(&path)? {
        return Err(format!(
            "SEC_INVALID_INPUT: refusing to modify symlink path={}",
            path.display()
        ));
    }

    let current = read_optional_file(&path)?;
    let next = patch_config_toml(current, patch)?;
    let _ = write_file_atomic_if_changed(&path, &next)?;
    codex_config_get(app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_creates_features_table_and_preserves_other_tables() {
        let input = r#"# header

[mcp_servers.exa]
type = "stdio"

"#;

        let out = patch_config_toml(
            Some(input.as_bytes().to_vec()),
            CodexConfigPatch {
                model: None,
                approval_policy: None,
                sandbox_mode: None,
                model_reasoning_effort: None,
                file_opener: None,
                hide_agent_reasoning: None,
                show_raw_agent_reasoning: None,
                history_persistence: None,
                history_max_bytes: None,
                sandbox_workspace_write_network_access: None,
                tui_animations: None,
                tui_alternate_screen: None,
                tui_show_tooltips: None,
                tui_scroll_invert: None,
                features_unified_exec: None,
                features_shell_snapshot: Some(true),
                features_apply_patch_freeform: None,
                features_web_search_request: Some(true),
                features_shell_tool: None,
                features_exec_policy: None,
                features_experimental_windows_sandbox: None,
                features_elevated_windows_sandbox: None,
                features_remote_compaction: None,
                features_remote_models: None,
                features_powershell_utf8: None,
                features_child_agents_md: None,
            },
        )
        .expect("patch_config_toml");

        let s = String::from_utf8(out).expect("utf8");
        assert!(s.contains("[mcp_servers.exa]"), "{s}");
        assert!(s.contains("[features]"), "{s}");
        assert!(s.contains("shell_snapshot = true"), "{s}");
        assert!(s.contains("web_search_request = true"), "{s}");
    }

    #[test]
    fn patch_updates_dotted_tui_keys_without_creating_table() {
        let input = r#"tui.animations = true
tui.show_tooltips = true

[other]
foo = "bar"
"#;

        let out = patch_config_toml(
            Some(input.as_bytes().to_vec()),
            CodexConfigPatch {
                model: None,
                approval_policy: None,
                sandbox_mode: None,
                model_reasoning_effort: None,
                file_opener: None,
                hide_agent_reasoning: None,
                show_raw_agent_reasoning: None,
                history_persistence: None,
                history_max_bytes: None,
                sandbox_workspace_write_network_access: None,
                tui_animations: Some(false),
                tui_alternate_screen: None,
                tui_show_tooltips: Some(false),
                tui_scroll_invert: None,
                features_unified_exec: None,
                features_shell_snapshot: None,
                features_apply_patch_freeform: None,
                features_web_search_request: None,
                features_shell_tool: None,
                features_exec_policy: None,
                features_experimental_windows_sandbox: None,
                features_elevated_windows_sandbox: None,
                features_remote_compaction: None,
                features_remote_models: None,
                features_powershell_utf8: None,
                features_child_agents_md: None,
            },
        )
        .expect("patch_config_toml");

        let s = String::from_utf8(out).expect("utf8");
        assert!(s.contains("tui.animations = false"), "{s}");
        assert!(s.contains("tui.show_tooltips = false"), "{s}");
        assert!(!s.contains("[tui]"), "{s}");
    }
}
