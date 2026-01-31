//! Usage: MCP server import/export parsing and DB import.

use crate::db;
use crate::shared::time::now_unix_seconds;
use crate::workspaces;
use rusqlite::params;
use std::collections::{BTreeMap, HashMap, HashSet};

use super::backups::CliBackupSnapshots;
use super::db::upsert_by_name;
use super::sync::sync_all_cli;
use super::types::{McpImportReport, McpImportServer, McpParseResult};
use super::validate::suggest_key;
use crate::shared::text::normalize_name;

fn is_code_switch_r_shape(root: &serde_json::Value) -> bool {
    root.get("claude").is_some() || root.get("codex").is_some() || root.get("gemini").is_some()
}

fn ensure_unique_key(base: &str, used: &mut HashSet<String>) -> String {
    if !used.contains(base) {
        used.insert(base.to_string());
        return base.to_string();
    }

    for idx in 2..1000 {
        let suffix = format!("-{idx}");
        let mut candidate = base.to_string();
        if candidate.len() + suffix.len() > 64 {
            candidate.truncate(64 - suffix.len());
        }
        candidate.push_str(&suffix);
        if !used.contains(&candidate) {
            used.insert(candidate.clone());
            return candidate;
        }
    }

    let fallback = format!("mcp-{}", now_unix_seconds());
    used.insert(fallback.clone());
    fallback
}

fn extract_string_array(value: Option<&serde_json::Value>) -> Vec<String> {
    let Some(arr) = value.and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect()
}

fn extract_string_map(value: Option<&serde_json::Value>) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let Some(obj) = value.and_then(|v| v.as_object()) else {
        return out;
    };
    for (k, v) in obj {
        if let Some(s) = v.as_str() {
            out.insert(k.to_string(), s.to_string());
        }
    }
    out
}

fn normalize_transport_from_json(spec: &serde_json::Value) -> Option<String> {
    let raw = spec
        .get("type")
        .and_then(|v| v.as_str())
        .or_else(|| spec.get("transport").and_then(|v| v.as_str()))
        .or_else(|| spec.get("transport_type").and_then(|v| v.as_str()));
    let raw = raw?;
    let lower = raw.trim().to_lowercase();
    match lower.as_str() {
        "stdio" => Some("stdio".to_string()),
        "http" => Some("http".to_string()),
        "sse" => Some("http".to_string()),
        _ => None,
    }
}

fn parse_code_switch_r(root: &serde_json::Value) -> Result<Vec<McpImportServer>, String> {
    let mut by_name: HashMap<String, McpImportServer> = HashMap::new();

    for cli_key in ["claude", "codex", "gemini"] {
        let Some(section) = root.get(cli_key) else {
            continue;
        };
        let Some(servers) = section.get("servers").and_then(|v| v.as_object()) else {
            continue;
        };

        for (name, entry) in servers {
            let enabled = entry
                .get("enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let spec = entry
                .get("server")
                .or_else(|| entry.get("spec"))
                .unwrap_or(entry);

            let transport =
                normalize_transport_from_json(spec).unwrap_or_else(|| "stdio".to_string());

            let command = spec
                .get("command")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let url = spec
                .get("url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let cwd = spec
                .get("cwd")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let args = extract_string_array(spec.get("args"));
            let env = extract_string_map(spec.get("env"));
            let headers =
                extract_string_map(spec.get("headers").or_else(|| spec.get("http_headers")));

            if transport == "stdio" && command.as_deref().unwrap_or("").trim().is_empty() {
                return Err(format!(
                    "SEC_INVALID_INPUT: import {cli_key} server '{name}' missing command"
                ));
            }
            if transport == "http" && url.as_deref().unwrap_or("").trim().is_empty() {
                return Err(format!(
                    "SEC_INVALID_INPUT: import {cli_key} server '{name}' missing url"
                ));
            }

            let item = by_name
                .entry(name.to_string())
                .or_insert_with(|| McpImportServer {
                    server_key: String::new(),
                    name: name.to_string(),
                    transport: transport.clone(),
                    command: command.clone(),
                    args: args.clone(),
                    env: env.clone(),
                    cwd: cwd.clone(),
                    url: url.clone(),
                    headers: headers.clone(),
                    enabled: false,
                });

            // If the same server name appears in multiple platform sections, require compatible specs.
            if item.transport != transport
                || item.command != command
                || item.url != url
                || item.args != args
            {
                return Err(format!(
                    "SEC_INVALID_INPUT: import conflict for server '{name}' across platforms"
                ));
            }

            item.enabled = item.enabled || enabled;
        }
    }

    let mut used_keys = HashSet::new();
    let mut out: Vec<McpImportServer> = by_name
        .into_values()
        .map(|mut item| {
            let base = suggest_key(&item.name);
            let key = ensure_unique_key(&base, &mut used_keys);
            item.server_key = key;
            item
        })
        .collect();

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn parse_json(json_text: &str) -> Result<McpParseResult, String> {
    let json_text = json_text.trim();
    if json_text.is_empty() {
        return Err("SEC_INVALID_INPUT: JSON is required".to_string());
    }

    let root: serde_json::Value = serde_json::from_str(json_text)
        .map_err(|e| format!("SEC_INVALID_INPUT: invalid JSON: {e}"))?;

    let servers = if is_code_switch_r_shape(&root) {
        parse_code_switch_r(&root)?
    } else if let Some(arr) = root.as_array() {
        // Optional: support simplified array format used by this project.
        let mut out = Vec::new();
        for item in arr {
            let Some(obj) = item.as_object() else {
                continue;
            };
            let name = obj
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if name.trim().is_empty() {
                continue;
            }
            let base = suggest_key(&name);
            let transport = obj
                .get("transport")
                .and_then(|v| v.as_str())
                .unwrap_or("stdio")
                .trim()
                .to_lowercase();
            let command = obj
                .get("command")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let url = obj
                .get("url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let enabled = obj
                .get("enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or_else(|| {
                    let legacy_present = obj.contains_key("enabled_claude")
                        || obj.contains_key("enabled_codex")
                        || obj.contains_key("enabled_gemini");
                    let legacy_any = obj
                        .get("enabled_claude")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                        || obj
                            .get("enabled_codex")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false)
                        || obj
                            .get("enabled_gemini")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                    if legacy_present {
                        legacy_any
                    } else {
                        true
                    }
                });

            out.push(McpImportServer {
                server_key: base,
                name,
                transport,
                command,
                args: extract_string_array(obj.get("args")),
                env: extract_string_map(obj.get("env")),
                cwd: obj
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                url,
                headers: extract_string_map(obj.get("headers")),
                enabled,
            });
        }
        out
    } else {
        return Err("SEC_INVALID_INPUT: unsupported JSON shape".to_string());
    };

    Ok(McpParseResult { servers })
}

pub fn import_servers(
    app: &tauri::AppHandle,
    db: &db::Db,
    workspace_id: i64,
    servers: Vec<McpImportServer>,
) -> Result<McpImportReport, String> {
    if servers.is_empty() {
        return Err("SEC_INVALID_INPUT: servers is required".to_string());
    }

    let mut conn = db.open_connection()?;
    let now = now_unix_seconds();

    let tx = conn
        .transaction()
        .map_err(|e| format!("DB_ERROR: failed to start transaction: {e}"))?;

    let _cli_key = workspaces::get_cli_key_by_id(&tx, workspace_id)?;
    let snapshots = CliBackupSnapshots::capture_all(app)?;

    let mut inserted = 0u32;
    let mut updated = 0u32;

    let mut deduped: Vec<McpImportServer> = Vec::new();
    let mut index_by_name: HashMap<String, usize> = HashMap::new();
    for server in servers {
        let norm = normalize_name(&server.name);
        if norm.is_empty() {
            return Err("SEC_INVALID_INPUT: name is required".to_string());
        }
        if let Some(idx) = index_by_name.get(&norm).copied() {
            deduped[idx] = server;
            continue;
        }
        index_by_name.insert(norm, deduped.len());
        deduped.push(server);
    }

    for server in &deduped {
        let (is_insert, id) = upsert_by_name(&tx, server, now)?;
        if is_insert {
            inserted += 1;
        } else {
            updated += 1;
        }

        if server.enabled {
            tx.execute(
                r#"
INSERT INTO workspace_mcp_enabled(workspace_id, server_id, created_at, updated_at)
VALUES (?1, ?2, ?3, ?3)
ON CONFLICT(workspace_id, server_id) DO UPDATE SET
  updated_at = excluded.updated_at
"#,
                params![workspace_id, id, now],
            )
            .map_err(|e| format!("DB_ERROR: failed to enable imported mcp server: {e}"))?;
        } else {
            tx.execute(
                "DELETE FROM workspace_mcp_enabled WHERE workspace_id = ?1 AND server_id = ?2",
                params![workspace_id, id],
            )
            .map_err(|e| format!("DB_ERROR: failed to disable imported mcp server: {e}"))?;
        }
    }

    if let Err(err) = sync_all_cli(app, &tx) {
        snapshots.restore_all(app);
        return Err(err);
    }

    if let Err(err) = tx.commit() {
        snapshots.restore_all(app);
        return Err(format!("DB_ERROR: failed to commit: {err}"));
    }

    Ok(McpImportReport { inserted, updated })
}
