use crate::db;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_PRIORITY: i64 = 100;
const MAX_MODEL_NAME_LEN: usize = 200;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderBaseUrlMode {
    Order,
    Ping,
}

impl ProviderBaseUrlMode {
    fn parse(input: &str) -> Option<Self> {
        match input.trim() {
            "order" => Some(Self::Order),
            "ping" => Some(Self::Ping),
            _ => None,
        }
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Order => "order",
            Self::Ping => "ping",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderSummary {
    pub id: i64,
    pub cli_key: String,
    pub name: String,
    pub base_urls: Vec<String>,
    pub base_url_mode: ProviderBaseUrlMode,
    pub supported_models: HashMap<String, bool>,
    pub model_mapping: HashMap<String, String>,
    pub enabled: bool,
    pub priority: i64,
    pub cost_multiplier: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub(crate) struct ProviderForGateway {
    pub id: i64,
    pub name: String,
    pub base_urls: Vec<String>,
    pub base_url_mode: ProviderBaseUrlMode,
    pub api_key_plaintext: String,
    pub supported_models: HashMap<String, bool>,
    pub model_mapping: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub(crate) struct GatewayProvidersSelection {
    pub sort_mode_id: Option<i64>,
    pub providers: Vec<ProviderForGateway>,
}

fn now_unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn validate_cli_key(cli_key: &str) -> Result<(), String> {
    match cli_key {
        "claude" | "codex" | "gemini" => Ok(()),
        _ => Err(format!("SEC_INVALID_INPUT: unknown cli_key={cli_key}")),
    }
}

fn enabled_to_int(enabled: bool) -> i64 {
    if enabled {
        1
    } else {
        0
    }
}

fn normalize_base_urls(base_urls: Vec<String>) -> Result<Vec<String>, String> {
    let mut out: Vec<String> = Vec::with_capacity(base_urls.len().max(1));
    let mut seen: HashSet<String> = HashSet::with_capacity(base_urls.len());

    for raw in base_urls {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }

        if !seen.insert(trimmed.to_string()) {
            continue;
        }

        // Validate URL early to avoid runtime proxy errors.
        reqwest::Url::parse(trimmed)
            .map_err(|e| format!("SEC_INVALID_INPUT: invalid base_url={trimmed}: {e}"))?;

        out.push(trimmed.to_string());
    }

    if out.is_empty() {
        return Err("SEC_INVALID_INPUT: base_urls is required".to_string());
    }

    Ok(out)
}

fn base_urls_from_row(base_url_fallback: &str, base_urls_json: &str) -> Vec<String> {
    let mut parsed: Vec<String> = serde_json::from_str::<Vec<String>>(base_urls_json)
        .ok()
        .unwrap_or_default()
        .into_iter()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .collect();

    // De-dup while preserving order.
    let mut seen: HashSet<String> = HashSet::with_capacity(parsed.len());
    parsed.retain(|v| seen.insert(v.clone()));

    if parsed.is_empty() {
        let fallback = base_url_fallback.trim();
        if fallback.is_empty() {
            return vec![String::new()];
        }
        return vec![fallback.to_string()];
    }

    parsed
}

fn supported_models_from_json(raw: &str) -> HashMap<String, bool> {
    let parsed = serde_json::from_str::<HashMap<String, bool>>(raw)
        .ok()
        .unwrap_or_default();

    let mut out: HashMap<String, bool> = HashMap::new();
    for (raw_key, enabled) in parsed {
        if !enabled {
            continue;
        }
        let key = raw_key.trim();
        if key.is_empty() || key.len() > MAX_MODEL_NAME_LEN {
            continue;
        }
        out.insert(key.to_string(), true);
    }

    out
}

fn model_mapping_from_json(raw: &str) -> HashMap<String, String> {
    let parsed = serde_json::from_str::<HashMap<String, String>>(raw)
        .ok()
        .unwrap_or_default();

    let mut out: HashMap<String, String> = HashMap::new();
    for (raw_key, raw_value) in parsed {
        let key = raw_key.trim();
        let value = raw_value.trim();
        if key.is_empty()
            || value.is_empty()
            || key.len() > MAX_MODEL_NAME_LEN
            || value.len() > MAX_MODEL_NAME_LEN
        {
            continue;
        }
        out.insert(key.to_string(), value.to_string());
    }

    out
}

fn row_to_summary(row: &rusqlite::Row<'_>) -> Result<ProviderSummary, rusqlite::Error> {
    let base_url_fallback: String = row.get("base_url")?;
    let base_urls_json: String = row.get("base_urls_json")?;
    let supported_models_json: String = row.get("supported_models_json")?;
    let model_mapping_json: String = row.get("model_mapping_json")?;
    let base_url_mode_raw: String = row.get("base_url_mode")?;
    let base_url_mode =
        ProviderBaseUrlMode::parse(&base_url_mode_raw).unwrap_or(ProviderBaseUrlMode::Order);

    Ok(ProviderSummary {
        id: row.get("id")?,
        cli_key: row.get("cli_key")?,
        name: row.get("name")?,
        base_urls: base_urls_from_row(&base_url_fallback, &base_urls_json),
        base_url_mode,
        supported_models: supported_models_from_json(&supported_models_json),
        model_mapping: model_mapping_from_json(&model_mapping_json),
        enabled: row.get::<_, i64>("enabled")? != 0,
        priority: row.get("priority")?,
        cost_multiplier: row.get("cost_multiplier")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

// matchWildcard: supports a single '*' wildcard, matching prefix and suffix.
// Multiple '*' wildcards are treated as unsupported and return false (alignment with code-switch-R).
fn match_wildcard(pattern: &str, text: &str) -> bool {
    if !pattern.contains('*') {
        return pattern == text;
    }

    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() != 2 {
        return false;
    }

    let prefix = parts[0];
    let suffix = parts[1];
    text.starts_with(prefix) && text.ends_with(suffix)
}

fn apply_wildcard_mapping(pattern: &str, replacement: &str, input: &str) -> String {
    if !pattern.contains('*') || !replacement.contains('*') {
        return replacement.to_string();
    }

    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() != 2 {
        return replacement.to_string();
    }

    let prefix = parts[0];
    let suffix = parts[1];

    if !input.starts_with(prefix) || !input.ends_with(suffix) {
        return replacement.to_string();
    }

    let start = prefix.len();
    let end = input.len().saturating_sub(suffix.len());
    let wildcard_part = if start <= end { &input[start..end] } else { "" };

    replacement.replacen('*', wildcard_part, 1)
}

fn is_model_supported(
    supported_models: &HashMap<String, bool>,
    model_mapping: &HashMap<String, String>,
    model_name: &str,
) -> bool {
    if supported_models.is_empty() && model_mapping.is_empty() {
        return true;
    }

    if supported_models.get(model_name).copied().unwrap_or(false) {
        return true;
    }

    for pattern in supported_models.keys() {
        if match_wildcard(pattern, model_name) {
            return true;
        }
    }

    if model_mapping.contains_key(model_name) {
        return true;
    }

    for pattern in model_mapping.keys() {
        if match_wildcard(pattern, model_name) {
            return true;
        }
    }

    false
}

fn get_effective_model(model_mapping: &HashMap<String, String>, requested_model: &str) -> String {
    if model_mapping.is_empty() {
        return requested_model.to_string();
    }

    if let Some(mapped) = model_mapping.get(requested_model) {
        return mapped.to_string();
    }

    let mut matches: Vec<(&str, &str)> = Vec::new();
    for (pattern, replacement) in model_mapping.iter() {
        if match_wildcard(pattern, requested_model) {
            matches.push((pattern.as_str(), replacement.as_str()));
        }
    }

    if matches.is_empty() {
        return requested_model.to_string();
    }

    // Deterministic selection: longest pattern first, then lexicographic.
    matches.sort_by(|(pa, _), (pb, _)| pb.len().cmp(&pa.len()).then_with(|| pa.cmp(pb)));
    let (pattern, replacement) = matches[0];
    apply_wildcard_mapping(pattern, replacement, requested_model)
}

fn validate_model_config(
    supported_models: &HashMap<String, bool>,
    model_mapping: &HashMap<String, String>,
) -> Result<(), String> {
    if supported_models.is_empty() || model_mapping.is_empty() {
        return Ok(());
    }

    for (external_model, internal_model) in model_mapping {
        if internal_model.contains('*') {
            continue;
        }

        if supported_models
            .get(internal_model)
            .copied()
            .unwrap_or(false)
        {
            continue;
        }

        let mut supported = false;
        for supported_pattern in supported_models.keys() {
            if match_wildcard(supported_pattern, internal_model) {
                supported = true;
                break;
            }
        }

        if !supported {
            return Err(format!(
                "SEC_INVALID_INPUT: 模型映射无效：'{external_model}' -> '{internal_model}'，目标模型 '{internal_model}' 不在 supportedModels 中"
            ));
        }
    }

    Ok(())
}

impl ProviderForGateway {
    pub(crate) fn is_model_supported(&self, model_name: &str) -> bool {
        is_model_supported(&self.supported_models, &self.model_mapping, model_name)
    }

    pub(crate) fn get_effective_model(&self, requested_model: &str) -> String {
        get_effective_model(&self.model_mapping, requested_model)
    }
}

fn get_by_id(conn: &Connection, provider_id: i64) -> Result<ProviderSummary, String> {
    conn.query_row(
        r#"
SELECT
  id,
  cli_key,
  name,
  base_url,
  base_urls_json,
  base_url_mode,
  supported_models_json,
  model_mapping_json,
  enabled,
  priority,
  cost_multiplier,
  created_at,
  updated_at
FROM providers
WHERE id = ?1
"#,
        params![provider_id],
        row_to_summary,
    )
    .optional()
    .map_err(|e| format!("DB_ERROR: failed to query provider: {e}"))?
    .ok_or_else(|| "DB_NOT_FOUND: provider not found".to_string())
}

pub fn names_by_id(
    app: &tauri::AppHandle,
    provider_ids: &[i64],
) -> Result<HashMap<i64, String>, String> {
    let ids: Vec<i64> = provider_ids
        .iter()
        .copied()
        .filter(|id| *id > 0)
        .collect::<HashSet<i64>>()
        .into_iter()
        .collect();

    if ids.is_empty() {
        return Ok(HashMap::new());
    }

    let conn = db::open_connection(app)?;

    let placeholders = db::sql_placeholders(ids.len());
    let sql = format!("SELECT id, name FROM providers WHERE id IN ({placeholders})");

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("DB_ERROR: failed to prepare query: {e}"))?;

    let mut rows = stmt
        .query(params_from_iter(ids.iter()))
        .map_err(|e| format!("DB_ERROR: failed to query provider names: {e}"))?;

    let mut out: HashMap<i64, String> = HashMap::new();
    while let Some(row) = rows
        .next()
        .map_err(|e| format!("DB_ERROR: failed to read provider row: {e}"))?
    {
        let id: i64 = row
            .get(0)
            .map_err(|e| format!("DB_ERROR: invalid provider id: {e}"))?;
        let name: String = row
            .get(1)
            .map_err(|e| format!("DB_ERROR: invalid provider name: {e}"))?;
        out.insert(id, name);
    }

    Ok(out)
}

pub fn list_by_cli(app: &tauri::AppHandle, cli_key: &str) -> Result<Vec<ProviderSummary>, String> {
    validate_cli_key(cli_key)?;
    let conn = db::open_connection(app)?;

    let mut stmt = conn
        .prepare(
            r#"
SELECT
  id,
  cli_key,
  name,
  base_url,
  base_urls_json,
  base_url_mode,
  supported_models_json,
  model_mapping_json,
  enabled,
  priority,
  cost_multiplier,
  created_at,
  updated_at
FROM providers
WHERE cli_key = ?1
ORDER BY sort_order ASC, id DESC
"#,
        )
        .map_err(|e| format!("DB_ERROR: failed to prepare query: {e}"))?;

    let rows = stmt
        .query_map(params![cli_key], row_to_summary)
        .map_err(|e| format!("DB_ERROR: failed to list providers: {e}"))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("DB_ERROR: failed to read provider row: {e}"))?);
    }

    Ok(items)
}

fn list_enabled_for_gateway_in_sort_mode(
    conn: &Connection,
    cli_key: &str,
    mode_id: i64,
) -> Result<Vec<ProviderForGateway>, String> {
    let mut stmt = conn
        .prepare(
            r#"
SELECT
  p.id,
  p.name,
  p.base_url,
  p.base_urls_json,
  p.base_url_mode,
  p.api_key_plaintext,
  p.supported_models_json,
  p.model_mapping_json
FROM sort_mode_providers mp
JOIN providers p ON p.id = mp.provider_id
WHERE mp.mode_id = ?1
  AND mp.cli_key = ?2
  AND p.cli_key = ?2
  AND p.enabled = 1
ORDER BY mp.sort_order ASC
"#,
        )
        .map_err(|e| format!("DB_ERROR: failed to prepare gateway sort_mode query: {e}"))?;

    let rows = stmt
        .query_map(params![mode_id, cli_key], |row| {
            let base_url_fallback: String = row.get("base_url")?;
            let base_urls_json: String = row.get("base_urls_json")?;
            let base_url_mode_raw: String = row.get("base_url_mode")?;
            let supported_models_json: String = row.get("supported_models_json")?;
            let model_mapping_json: String = row.get("model_mapping_json")?;
            let base_url_mode = ProviderBaseUrlMode::parse(&base_url_mode_raw)
                .unwrap_or(ProviderBaseUrlMode::Order);
            Ok(ProviderForGateway {
                id: row.get("id")?,
                name: row.get("name")?,
                base_urls: base_urls_from_row(&base_url_fallback, &base_urls_json),
                base_url_mode,
                api_key_plaintext: row.get("api_key_plaintext")?,
                supported_models: supported_models_from_json(&supported_models_json),
                model_mapping: model_mapping_from_json(&model_mapping_json),
            })
        })
        .map_err(|e| format!("DB_ERROR: failed to list gateway sort_mode providers: {e}"))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("DB_ERROR: failed to read gateway provider row: {e}"))?);
    }
    Ok(items)
}

fn list_enabled_for_gateway_default(
    conn: &Connection,
    cli_key: &str,
) -> Result<Vec<ProviderForGateway>, String> {
    let mut stmt = conn
        .prepare(
            r#"
SELECT
  id,
  name,
  base_url,
  base_urls_json,
  base_url_mode,
  api_key_plaintext,
  supported_models_json,
  model_mapping_json
FROM providers
WHERE cli_key = ?1
  AND enabled = 1
ORDER BY sort_order ASC, id DESC
"#,
        )
        .map_err(|e| format!("DB_ERROR: failed to prepare gateway provider query: {e}"))?;

    let rows = stmt
        .query_map(params![cli_key], |row| {
            let base_url_fallback: String = row.get("base_url")?;
            let base_urls_json: String = row.get("base_urls_json")?;
            let base_url_mode_raw: String = row.get("base_url_mode")?;
            let supported_models_json: String = row.get("supported_models_json")?;
            let model_mapping_json: String = row.get("model_mapping_json")?;
            let base_url_mode = ProviderBaseUrlMode::parse(&base_url_mode_raw)
                .unwrap_or(ProviderBaseUrlMode::Order);
            Ok(ProviderForGateway {
                id: row.get("id")?,
                name: row.get("name")?,
                base_urls: base_urls_from_row(&base_url_fallback, &base_urls_json),
                base_url_mode,
                api_key_plaintext: row.get("api_key_plaintext")?,
                supported_models: supported_models_from_json(&supported_models_json),
                model_mapping: model_mapping_from_json(&model_mapping_json),
            })
        })
        .map_err(|e| format!("DB_ERROR: failed to list gateway providers: {e}"))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| format!("DB_ERROR: failed to read gateway provider row: {e}"))?);
    }
    Ok(items)
}

pub(crate) fn list_enabled_for_gateway_using_active_mode(
    app: &tauri::AppHandle,
    cli_key: &str,
) -> Result<GatewayProvidersSelection, String> {
    validate_cli_key(cli_key)?;
    let conn = db::open_connection(app)?;

    let active_mode_id: Option<i64> = conn
        .query_row(
            "SELECT mode_id FROM sort_mode_active WHERE cli_key = ?1",
            params![cli_key],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|e| format!("DB_ERROR: failed to query sort_mode_active: {e}"))?
        .flatten();

    if let Some(mode_id) = active_mode_id {
        let providers = list_enabled_for_gateway_in_sort_mode(&conn, cli_key, mode_id)?;
        return Ok(GatewayProvidersSelection {
            sort_mode_id: Some(mode_id),
            providers,
        });
    }

    let providers = list_enabled_for_gateway_default(&conn, cli_key)?;
    Ok(GatewayProvidersSelection {
        sort_mode_id: None,
        providers,
    })
}

pub(crate) fn list_enabled_for_gateway_in_mode(
    app: &tauri::AppHandle,
    cli_key: &str,
    sort_mode_id: Option<i64>,
) -> Result<Vec<ProviderForGateway>, String> {
    validate_cli_key(cli_key)?;
    let conn = db::open_connection(app)?;

    match sort_mode_id {
        Some(mode_id) => list_enabled_for_gateway_in_sort_mode(&conn, cli_key, mode_id),
        None => list_enabled_for_gateway_default(&conn, cli_key),
    }
}

fn next_sort_order(conn: &Connection, cli_key: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM providers WHERE cli_key = ?1",
        params![cli_key],
        |row| row.get::<_, i64>(0),
    )
    .map_err(|e| format!("DB_ERROR: failed to query next sort_order: {e}"))
}

#[allow(clippy::too_many_arguments)]
pub fn upsert(
    app: &tauri::AppHandle,
    provider_id: Option<i64>,
    cli_key: &str,
    name: &str,
    base_urls: Vec<String>,
    base_url_mode: &str,
    api_key: Option<&str>,
    enabled: bool,
    cost_multiplier: f64,
    priority: Option<i64>,
    supported_models: Option<HashMap<String, bool>>,
    model_mapping: Option<HashMap<String, String>>,
) -> Result<ProviderSummary, String> {
    let cli_key = cli_key.trim();
    validate_cli_key(cli_key)?;

    let name = name.trim();
    if name.is_empty() {
        return Err("SEC_INVALID_INPUT: provider name is required".to_string());
    }

    let base_urls = normalize_base_urls(base_urls)?;
    let base_url_primary = base_urls.first().cloned().unwrap_or_default();

    let base_url_mode = ProviderBaseUrlMode::parse(base_url_mode)
        .ok_or_else(|| "SEC_INVALID_INPUT: base_url_mode must be 'order' or 'ping'".to_string())?;
    let base_urls_json =
        serde_json::to_string(&base_urls).map_err(|e| format!("SYSTEM_ERROR: {e}"))?;

    let api_key = api_key.map(str::trim).filter(|v| !v.is_empty());

    if !cost_multiplier.is_finite() || cost_multiplier <= 0.0 || cost_multiplier > 1000.0 {
        return Err("SEC_INVALID_INPUT: cost_multiplier must be within (0, 1000]".to_string());
    }

    if let Some(priority) = priority {
        if !(0..=1000).contains(&priority) {
            return Err("SEC_INVALID_INPUT: priority must be within [0, 1000]".to_string());
        }
    }

    let normalize_supported_models =
        |input: HashMap<String, bool>| -> Result<HashMap<String, bool>, String> {
            let mut out: HashMap<String, bool> = HashMap::new();
            for (raw_key, enabled) in input {
                if !enabled {
                    continue;
                }
                let key = raw_key.trim();
                if key.is_empty() {
                    continue;
                }
                if key.len() > MAX_MODEL_NAME_LEN {
                    return Err(format!(
                    "SEC_INVALID_INPUT: supportedModels entry is too long (max={MAX_MODEL_NAME_LEN}): {key}"
                ));
                }
                out.insert(key.to_string(), true);
            }
            Ok(out)
        };

    let normalize_model_mapping =
        |input: HashMap<String, String>| -> Result<HashMap<String, String>, String> {
            let mut out: HashMap<String, String> = HashMap::new();
            for (raw_key, raw_value) in input {
                let key = raw_key.trim();
                let value = raw_value.trim();
                if key.is_empty() || value.is_empty() {
                    continue;
                }
                if key.len() > MAX_MODEL_NAME_LEN {
                    return Err(format!(
                        "SEC_INVALID_INPUT: modelMapping key is too long (max={MAX_MODEL_NAME_LEN}): {key}"
                    ));
                }
                if value.len() > MAX_MODEL_NAME_LEN {
                    return Err(format!(
                        "SEC_INVALID_INPUT: modelMapping value is too long (max={MAX_MODEL_NAME_LEN}): {value}"
                    ));
                }
                out.insert(key.to_string(), value.to_string());
            }
            Ok(out)
        };

    let mut conn = db::open_connection(app)?;
    let now = now_unix_seconds();

    match provider_id {
        None => {
            let priority = priority.unwrap_or(DEFAULT_PRIORITY);
            let api_key =
                api_key.ok_or_else(|| "SEC_INVALID_INPUT: api_key is required".to_string())?;
            let sort_order = next_sort_order(&conn, cli_key)?;

            let supported_models =
                normalize_supported_models(supported_models.unwrap_or_default())?;
            let model_mapping = normalize_model_mapping(model_mapping.unwrap_or_default())?;
            validate_model_config(&supported_models, &model_mapping)?;
            let supported_models_json = serde_json::to_string(&supported_models)
                .map_err(|e| format!("SYSTEM_ERROR: {e}"))?;
            let model_mapping_json =
                serde_json::to_string(&model_mapping).map_err(|e| format!("SYSTEM_ERROR: {e}"))?;

            conn.execute(
                r#"
INSERT INTO providers(
  cli_key,
  name,
  base_url,
  base_urls_json,
  base_url_mode,
  supported_models_json,
  model_mapping_json,
  api_key_plaintext,
  sort_order,
  enabled,
  priority,
  cost_multiplier,
  created_at,
  updated_at
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
"#,
                params![
                    cli_key,
                    name,
                    base_url_primary,
                    base_urls_json,
                    base_url_mode.as_str(),
                    supported_models_json,
                    model_mapping_json,
                    api_key,
                    sort_order,
                    enabled_to_int(enabled),
                    priority,
                    cost_multiplier,
                    now,
                    now
                ],
            )
            .map_err(|e| match e {
                rusqlite::Error::SqliteFailure(err, _)
                    if err.code == rusqlite::ErrorCode::ConstraintViolation =>
                {
                    format!(
                        "DB_CONSTRAINT: provider already exists for cli_key={cli_key}, name={name}"
                    )
                }
                other => format!("DB_ERROR: failed to insert provider: {other}"),
            })?;

            let id = conn.last_insert_rowid();
            get_by_id(&conn, id)
        }
        Some(id) => {
            let tx = conn
                .transaction()
                .map_err(|e| format!("DB_ERROR: failed to start transaction: {e}"))?;

            let existing: Option<(String, String, i64, String, String)> = tx
                .query_row(
                    "SELECT cli_key, api_key_plaintext, priority, supported_models_json, model_mapping_json FROM providers WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
                )
                .optional()
                .map_err(|e| format!("DB_ERROR: failed to query provider: {e}"))?;

            let Some((
                existing_cli_key,
                existing_api_key,
                existing_priority,
                existing_supported_models_json,
                existing_model_mapping_json,
            )) = existing
            else {
                return Err("DB_NOT_FOUND: provider not found".to_string());
            };

            if existing_cli_key != cli_key {
                return Err("SEC_INVALID_INPUT: cli_key mismatch".to_string());
            }

            let next_api_key = api_key.unwrap_or(existing_api_key.as_str());
            let next_priority = priority.unwrap_or(existing_priority);

            let existing_supported_models =
                supported_models_from_json(&existing_supported_models_json);
            let existing_model_mapping = model_mapping_from_json(&existing_model_mapping_json);

            let next_supported_models = match supported_models {
                Some(v) => Some(normalize_supported_models(v)?),
                None => None,
            };
            let next_model_mapping = match model_mapping {
                Some(v) => Some(normalize_model_mapping(v)?),
                None => None,
            };

            let final_supported_models = next_supported_models
                .as_ref()
                .unwrap_or(&existing_supported_models);
            let final_model_mapping = next_model_mapping
                .as_ref()
                .unwrap_or(&existing_model_mapping);
            validate_model_config(final_supported_models, final_model_mapping)?;

            let next_supported_models_json = match next_supported_models.as_ref() {
                Some(v) => serde_json::to_string(v).map_err(|e| format!("SYSTEM_ERROR: {e}"))?,
                None => existing_supported_models_json,
            };
            let next_model_mapping_json = match next_model_mapping.as_ref() {
                Some(v) => serde_json::to_string(v).map_err(|e| format!("SYSTEM_ERROR: {e}"))?,
                None => existing_model_mapping_json,
            };

            tx.execute(
                r#"
UPDATE providers
SET
  name = ?1,
  base_url = ?2,
  base_urls_json = ?3,
  base_url_mode = ?4,
  supported_models_json = ?5,
  model_mapping_json = ?6,
  api_key_plaintext = ?7,
  enabled = ?8,
  cost_multiplier = ?9,
  priority = ?10,
  updated_at = ?11
WHERE id = ?12
"#,
                params![
                    name,
                    base_url_primary,
                    base_urls_json,
                    base_url_mode.as_str(),
                    next_supported_models_json,
                    next_model_mapping_json,
                    next_api_key,
                    enabled_to_int(enabled),
                    cost_multiplier,
                    next_priority,
                    now,
                    id
                ],
            )
            .map_err(|e| match e {
                rusqlite::Error::SqliteFailure(err, _) if err.code == rusqlite::ErrorCode::ConstraintViolation => {
                    format!("DB_CONSTRAINT: provider name already exists for cli_key={cli_key}, name={name}")
                }
                other => format!("DB_ERROR: failed to update provider: {other}"),
            })?;

            tx.commit()
                .map_err(|e| format!("DB_ERROR: failed to commit: {e}"))?;

            get_by_id(&conn, id)
        }
    }
}

pub fn set_enabled(
    app: &tauri::AppHandle,
    provider_id: i64,
    enabled: bool,
) -> Result<ProviderSummary, String> {
    let conn = db::open_connection(app)?;
    let now = now_unix_seconds();
    let changed = conn
        .execute(
            "UPDATE providers SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
            params![enabled_to_int(enabled), now, provider_id],
        )
        .map_err(|e| format!("DB_ERROR: failed to update provider: {e}"))?;

    if changed == 0 {
        return Err("DB_NOT_FOUND: provider not found".to_string());
    }

    get_by_id(&conn, provider_id)
}

pub fn delete(app: &tauri::AppHandle, provider_id: i64) -> Result<(), String> {
    let conn = db::open_connection(app)?;
    let changed = conn
        .execute("DELETE FROM providers WHERE id = ?1", params![provider_id])
        .map_err(|e| format!("DB_ERROR: failed to delete provider: {e}"))?;

    if changed == 0 {
        return Err("DB_NOT_FOUND: provider not found".to_string());
    }

    Ok(())
}

pub fn reorder(
    app: &tauri::AppHandle,
    cli_key: &str,
    ordered_provider_ids: Vec<i64>,
) -> Result<Vec<ProviderSummary>, String> {
    validate_cli_key(cli_key)?;

    let mut seen = HashSet::new();
    for id in &ordered_provider_ids {
        if !seen.insert(*id) {
            return Err(format!("SEC_INVALID_INPUT: duplicate provider_id={id}"));
        }
    }

    let mut conn = db::open_connection(app)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("DB_ERROR: failed to start transaction: {e}"))?;

    let mut existing_ids = Vec::new();
    {
        let mut stmt = tx
            .prepare("SELECT id FROM providers WHERE cli_key = ?1 ORDER BY sort_order ASC, id DESC")
            .map_err(|e| format!("DB_ERROR: failed to prepare existing id list: {e}"))?;
        let rows = stmt
            .query_map(params![cli_key], |row| row.get::<_, i64>(0))
            .map_err(|e| format!("DB_ERROR: failed to query existing id list: {e}"))?;
        for row in rows {
            existing_ids
                .push(row.map_err(|e| format!("DB_ERROR: failed to read existing id: {e}"))?);
        }
    }

    let existing_set: HashSet<i64> = existing_ids.iter().copied().collect();
    for id in &ordered_provider_ids {
        if !existing_set.contains(id) {
            return Err(format!(
                "SEC_INVALID_INPUT: provider_id does not belong to cli_key={cli_key}: {id}"
            ));
        }
    }

    let mut final_ids = Vec::with_capacity(existing_ids.len());
    final_ids.extend(ordered_provider_ids);
    for id in existing_ids {
        if !seen.contains(&id) {
            final_ids.push(id);
        }
    }

    let now = now_unix_seconds();
    for (idx, id) in final_ids.iter().enumerate() {
        let sort_order = idx as i64;
        tx.execute(
            "UPDATE providers SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![sort_order, now, id],
        )
        .map_err(|e| format!("DB_ERROR: failed to update sort_order for provider {id}: {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("DB_ERROR: failed to commit transaction: {e}"))?;

    list_by_cli(app, cli_key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn match_wildcard_exact_match() {
        assert!(match_wildcard("claude-sonnet-4", "claude-sonnet-4"));
        assert!(!match_wildcard("claude-sonnet-4", "claude-opus-4"));
    }

    #[test]
    fn match_wildcard_single_star() {
        assert!(match_wildcard("claude-*", "claude-sonnet-4"));
        assert!(match_wildcard("*-4", "claude-sonnet-4"));
        assert!(!match_wildcard("claude-*sonnet-*", "claude-sonnet-4")); // multiple '*': unsupported
    }

    #[test]
    fn apply_wildcard_mapping_basic() {
        let out = apply_wildcard_mapping("claude-*", "anthropic/claude-*", "claude-sonnet-4");
        assert_eq!(out, "anthropic/claude-sonnet-4");
    }

    #[test]
    fn apply_wildcard_mapping_no_star_in_replacement() {
        let out = apply_wildcard_mapping("claude-*", "anthropic/claude", "claude-sonnet-4");
        assert_eq!(out, "anthropic/claude");
    }

    #[test]
    fn is_model_supported_empty_config_supports_all() {
        assert!(is_model_supported(
            &HashMap::new(),
            &HashMap::new(),
            "anything"
        ));
    }

    #[test]
    fn is_model_supported_supported_models_exact_and_wildcard() {
        let mut supported = HashMap::new();
        supported.insert("claude-sonnet-4".to_string(), true);
        supported.insert("claude-*".to_string(), true);

        assert!(is_model_supported(
            &supported,
            &HashMap::new(),
            "claude-sonnet-4"
        ));
        assert!(is_model_supported(
            &supported,
            &HashMap::new(),
            "claude-opus-4"
        ));
        assert!(!is_model_supported(&supported, &HashMap::new(), "gpt-4"));
    }

    #[test]
    fn is_model_supported_model_mapping_exact_and_wildcard_keys() {
        let mut mapping = HashMap::new();
        mapping.insert(
            "claude-sonnet-4".to_string(),
            "anthropic/claude-sonnet-4".to_string(),
        );
        mapping.insert("claude-*".to_string(), "anthropic/claude-*".to_string());

        assert!(is_model_supported(
            &HashMap::new(),
            &mapping,
            "claude-sonnet-4"
        ));
        assert!(is_model_supported(
            &HashMap::new(),
            &mapping,
            "claude-opus-4"
        ));
        assert!(!is_model_supported(&HashMap::new(), &mapping, "gpt-4"));
    }

    #[test]
    fn get_effective_model_exact_beats_wildcard() {
        let mut mapping = HashMap::new();
        mapping.insert("claude-*".to_string(), "anthropic/claude-*".to_string());
        mapping.insert(
            "claude-sonnet-4".to_string(),
            "anthropic/claude-sonnet-4@exact".to_string(),
        );

        assert_eq!(
            get_effective_model(&mapping, "claude-sonnet-4"),
            "anthropic/claude-sonnet-4@exact"
        );
    }

    #[test]
    fn get_effective_model_wildcard_longest_match_wins() {
        let mut mapping = HashMap::new();
        mapping.insert("claude-*".to_string(), "A-*".to_string());
        mapping.insert("claude-sonnet-*".to_string(), "B-*".to_string());

        assert_eq!(get_effective_model(&mapping, "claude-sonnet-4"), "B-4");
    }

    #[test]
    fn get_effective_model_wildcard_tie_break_is_lexicographic() {
        let mut mapping = HashMap::new();
        mapping.insert("*b".to_string(), "X*".to_string());
        mapping.insert("a*".to_string(), "Y*".to_string());

        // both patterns match "ab"; lengths equal; "*b" sorts before "a*"
        assert_eq!(get_effective_model(&mapping, "ab"), "Xa");
    }

    #[test]
    fn validate_model_config_allows_mapping_only() {
        let mut mapping = HashMap::new();
        mapping.insert(
            "claude-sonnet-4".to_string(),
            "anthropic/claude-sonnet-4".to_string(),
        );
        assert!(validate_model_config(&HashMap::new(), &mapping).is_ok());
    }

    #[test]
    fn validate_model_config_rejects_unknown_target_when_supported_models_present() {
        let mut supported = HashMap::new();
        supported.insert("anthropic/claude-sonnet-4".to_string(), true);

        let mut mapping = HashMap::new();
        mapping.insert(
            "claude-sonnet-4".to_string(),
            "anthropic/claude-opus-4".to_string(),
        );

        assert!(validate_model_config(&supported, &mapping).is_err());
    }

    #[test]
    fn validate_model_config_allows_wildcard_target_without_supported_models_coverage() {
        let mut supported = HashMap::new();
        supported.insert("anthropic/claude-*".to_string(), true);

        let mut mapping = HashMap::new();
        mapping.insert("claude-*".to_string(), "anthropic/claude-*".to_string());

        assert!(validate_model_config(&supported, &mapping).is_ok());
    }
}
