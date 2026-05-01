//! Usage: Read / write the `hooks` section of Claude Code's `settings.json`.

use crate::shared::fs::{read_optional_file, write_file_atomic_if_changed};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ClaudeHookEntry {
    pub hook_type: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ClaudeHookGroup {
    pub event: String,
    pub matcher: String,
    pub hooks: Vec<ClaudeHookEntry>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct ClaudeHooksState {
    pub settings_path: String,
    pub groups: Vec<ClaudeHookGroup>,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct ClaudeHooksSetInput {
    pub groups: Vec<ClaudeHookGroup>,
}

fn claude_settings_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<PathBuf> {
    Ok(crate::app_paths::home_dir(app)?
        .join(".claude")
        .join("settings.json"))
}

fn json_root_from_bytes(
    bytes: Option<Vec<u8>>,
    action: &str,
) -> crate::shared::error::AppResult<serde_json::Value> {
    match bytes {
        Some(b) => serde_json::from_slice::<serde_json::Value>(&b)
            .map_err(|e| format!("settings.json 解析失败，拒绝{action}以保护现有配置: {e}").into()),
        None => Ok(serde_json::json!({})),
    }
}

fn parse_hooks_from_root(root: &serde_json::Value) -> Vec<ClaudeHookGroup> {
    let Some(hooks_obj) = root.get("hooks").and_then(|v| v.as_object()) else {
        return Vec::new();
    };

    let mut groups = Vec::new();
    for (event, matcher_groups) in hooks_obj {
        let Some(matcher_arr) = matcher_groups.as_array() else {
            continue;
        };
        for matcher_group in matcher_arr {
            let Some(mg) = matcher_group.as_object() else {
                continue;
            };
            let matcher = mg
                .get("matcher")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let entries = mg
                .get("hooks")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|h| {
                            let obj = h.as_object()?;
                            let hook_type = obj
                                .get("type")
                                .and_then(|v| v.as_str())
                                .unwrap_or("command")
                                .to_string();
                            let command = obj.get("command").and_then(|v| v.as_str())?.to_string();
                            let timeout = obj.get("timeout").and_then(|v| v.as_u64());
                            Some(ClaudeHookEntry {
                                hook_type,
                                command,
                                timeout,
                            })
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            groups.push(ClaudeHookGroup {
                event: event.clone(),
                matcher,
                hooks: entries,
            });
        }
    }
    groups
}

fn groups_to_json(groups: &[ClaudeHookGroup]) -> serde_json::Value {
    let mut hooks_map = serde_json::Map::new();
    for group in groups {
        let entry = hooks_map
            .entry(group.event.clone())
            .or_insert_with(|| serde_json::Value::Array(Vec::new()));
        let arr = entry.as_array_mut().expect("hooks event must be array");

        let hook_entries: Vec<serde_json::Value> = group
            .hooks
            .iter()
            .map(|h| {
                let mut obj = serde_json::Map::new();
                obj.insert(
                    "type".to_string(),
                    serde_json::Value::String(h.hook_type.clone()),
                );
                obj.insert(
                    "command".to_string(),
                    serde_json::Value::String(h.command.clone()),
                );
                if let Some(t) = h.timeout {
                    obj.insert("timeout".to_string(), serde_json::Value::Number(t.into()));
                }
                serde_json::Value::Object(obj)
            })
            .collect();

        let mut mg = serde_json::Map::new();
        mg.insert(
            "matcher".to_string(),
            serde_json::Value::String(group.matcher.clone()),
        );
        mg.insert("hooks".to_string(), serde_json::Value::Array(hook_entries));
        arr.push(serde_json::Value::Object(mg));
    }
    serde_json::Value::Object(hooks_map)
}

pub fn claude_hooks_get<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> crate::shared::error::AppResult<ClaudeHooksState> {
    let path = claude_settings_path(app)?;
    let root = json_root_from_bytes(read_optional_file(&path)?, "读取 Hooks 空配置")?;
    if !root.is_object() {
        return Err(
            "settings.json 根节点不是 JSON 对象，拒绝读取 Hooks 空配置以保护现有配置"
                .to_string()
                .into(),
        );
    }
    let groups = parse_hooks_from_root(&root);
    Ok(ClaudeHooksState {
        settings_path: path.to_string_lossy().to_string(),
        groups,
    })
}

pub fn claude_hooks_set<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    input: ClaudeHooksSetInput,
) -> crate::shared::error::AppResult<ClaudeHooksState> {
    let path = claude_settings_path(app)?;
    if path.exists() && crate::shared::fs::is_symlink(&path)? {
        return Err(format!(
            "SEC_INVALID_INPUT: refusing to modify symlink path={}",
            path.display()
        )
        .into());
    }

    let current = read_optional_file(&path)?;
    let mut root = json_root_from_bytes(current, "覆写")?;
    if !root.is_object() {
        return Err("settings.json 根节点不是 JSON 对象，拒绝覆写以保护现有配置"
            .to_string()
            .into());
    }
    let obj = root.as_object_mut().expect("root must be object");

    if input.groups.is_empty() {
        obj.remove("hooks");
    } else {
        obj.insert("hooks".to_string(), groups_to_json(&input.groups));
    }

    let mut out = serde_json::to_vec_pretty(&root)
        .map_err(|e| format!("failed to serialize settings.json: {e}"))?;
    out.push(b'\n');
    let _ = write_file_atomic_if_changed(&path, &out)?;
    claude_hooks_get(app)
}

#[cfg(test)]
mod tests;
