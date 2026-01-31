//! Usage: StrictV29 patch - Ensure workspace cluster tables exist (idempotent).
//!
//! Background: dev builds introduced v30..v33 migrations (workspace cluster), but we now treat
//! `user_version=29` as the latest published schema. This patch backports the workspace cluster
//! schema into v29 without bumping `user_version`, and is safe to run repeatedly.

use crate::shared::text::normalize_name;
use crate::shared::time::now_unix_seconds;
// cSpell:ignore rusqlite
use rusqlite::{params, Connection, OptionalExtension};

pub(super) fn ensure_workspace_cluster(conn: &mut Connection) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to start sqlite transaction: {e}"))?;

    ensure_workspaces_and_active(&tx)?;
    ensure_prompts_scoped_by_workspace(&tx)?;
    ensure_mcp_scoped_by_workspace(&tx)?;
    ensure_skills_scoped_by_workspace(&tx)?;

    tx.commit()
        .map_err(|e| format!("failed to commit sqlite transaction: {e}"))?;

    Ok(())
}

fn ensure_workspaces_and_active(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cli_key TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(cli_key, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_cli_key_updated_at ON workspaces(cli_key, updated_at);

CREATE TABLE IF NOT EXISTS workspace_active (
  cli_key TEXT PRIMARY KEY,
  workspace_id INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_active_workspace_id ON workspace_active(workspace_id);
"#,
    )
    .map_err(|e| format!("failed to ensure workspaces tables: {e}"))?;

    let now = now_unix_seconds();
    let default_name = "默认";
    let default_normalized = normalize_name(default_name);

    for cli_key in crate::shared::cli_key::SUPPORTED_CLI_KEYS {
        conn.execute(
            r#"
INSERT OR IGNORE INTO workspaces(
  cli_key,
  name,
  normalized_name,
  created_at,
  updated_at
) VALUES (?1, ?2, ?3, ?4, ?5)
"#,
            params![cli_key, default_name, default_normalized, now, now],
        )
        .map_err(|e| format!("failed to seed default workspace for cli_key={cli_key}: {e}"))?;

        let workspace_id: i64 = conn
            .query_row(
                r#"
SELECT id
FROM workspaces
WHERE cli_key = ?1 AND normalized_name = ?2
ORDER BY id DESC
LIMIT 1
"#,
                params![cli_key, default_normalized],
                |row| row.get(0),
            )
            .map_err(|e| format!("failed to query default workspace for cli_key={cli_key}: {e}"))?;

        conn.execute(
            r#"
INSERT OR IGNORE INTO workspace_active(
  cli_key,
  workspace_id,
  updated_at
) VALUES (?1, ?2, ?3)
"#,
            params![cli_key, workspace_id, now],
        )
        .map_err(|e| format!("failed to seed workspace_active for cli_key={cli_key}: {e}"))?;

        // If workspace_active exists but workspace_id is NULL, backfill it.
        let existing: Option<Option<i64>> = conn
            .query_row(
                "SELECT workspace_id FROM workspace_active WHERE cli_key = ?1",
                params![cli_key],
                |row| row.get::<_, Option<i64>>(0),
            )
            .optional()
            .map_err(|e| format!("failed to query workspace_active for cli_key={cli_key}: {e}"))?;
        if existing.flatten().is_none() {
            conn.execute(
                "UPDATE workspace_active SET workspace_id = ?1, updated_at = ?2 WHERE cli_key = ?3",
                params![workspace_id, now, cli_key],
            )
            .map_err(|e| {
                format!("failed to backfill workspace_active for cli_key={cli_key}: {e}")
            })?;
        }
    }

    Ok(())
}

fn ensure_prompts_scoped_by_workspace(conn: &Connection) -> Result<(), String> {
    if !column_exists(conn, "prompts", "workspace_id")? {
        conn.execute_batch(
            r#"
DROP TABLE IF EXISTS prompts_next;

CREATE TABLE IF NOT EXISTS prompts_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, name)
);

INSERT INTO prompts_next(
  id,
  workspace_id,
  name,
  content,
  enabled,
  created_at,
  updated_at
)
SELECT
  p.id,
  COALESCE(
    (SELECT workspace_id FROM workspace_active WHERE cli_key = p.cli_key),
    (SELECT id FROM workspaces WHERE cli_key = p.cli_key ORDER BY id DESC LIMIT 1)
  ) AS workspace_id,
  p.name,
  p.content,
  p.enabled,
  p.created_at,
  p.updated_at
FROM prompts p;

DROP TABLE prompts;
ALTER TABLE prompts_next RENAME TO prompts;
"#,
        )
        .map_err(|e| format!("failed to scope prompts by workspace_id: {e}"))?;
    }

    conn.execute_batch(
        r#"
CREATE INDEX IF NOT EXISTS idx_prompts_workspace_id ON prompts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_prompts_workspace_id_updated_at ON prompts(workspace_id, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_workspace_single_enabled
  ON prompts(workspace_id)
  WHERE enabled = 1;
"#,
    )
    .map_err(|e| format!("failed to ensure prompts indexes: {e}"))?;

    Ok(())
}

fn ensure_mcp_scoped_by_workspace(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS workspace_mcp_enabled (
  workspace_id INTEGER NOT NULL,
  server_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id, server_id),
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY(server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspace_mcp_enabled_workspace_id
  ON workspace_mcp_enabled(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_mcp_enabled_server_id
  ON workspace_mcp_enabled(server_id);
"#,
    )
    .map_err(|e| format!("failed to ensure workspace_mcp_enabled: {e}"))?;

    // Backfill legacy enabled flags only once by clearing them after migration.
    let now = now_unix_seconds();
    for (cli_key, flag_col) in [
        ("claude", "enabled_claude"),
        ("codex", "enabled_codex"),
        ("gemini", "enabled_gemini"),
    ] {
        if !column_exists(conn, "mcp_servers", flag_col)? {
            continue;
        }

        let sql = format!(
            r#"
INSERT OR IGNORE INTO workspace_mcp_enabled(workspace_id, server_id, created_at, updated_at)
SELECT
  COALESCE(
    (SELECT workspace_id FROM workspace_active WHERE cli_key = '{cli_key}'),
    (SELECT id FROM workspaces WHERE cli_key = '{cli_key}' ORDER BY id DESC LIMIT 1)
  ),
  id,
  ?1,
  ?1
FROM mcp_servers
WHERE {flag_col} = 1
"#
        );

        conn.execute(&sql, params![now]).map_err(|e| {
            format!("failed to migrate mcp enabled flags for cli_key={cli_key}: {e}")
        })?;

        let clear_sql = format!("UPDATE mcp_servers SET {flag_col} = 0 WHERE {flag_col} != 0");
        conn.execute(&clear_sql, [])
            .map_err(|e| format!("failed to clear legacy mcp enabled flag {flag_col}: {e}"))?;
    }

    Ok(())
}

fn ensure_skills_scoped_by_workspace(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS workspace_skill_enabled (
  workspace_id INTEGER NOT NULL,
  skill_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id, skill_id),
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspace_skill_enabled_workspace_id
  ON workspace_skill_enabled(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_skill_enabled_skill_id
  ON workspace_skill_enabled(skill_id);
"#,
    )
    .map_err(|e| format!("failed to ensure workspace_skill_enabled: {e}"))?;

    // Backfill legacy enabled flags only once by clearing them after migration.
    let now = now_unix_seconds();
    for (cli_key, flag_col) in [
        ("claude", "enabled_claude"),
        ("codex", "enabled_codex"),
        ("gemini", "enabled_gemini"),
    ] {
        if !column_exists(conn, "skills", flag_col)? {
            continue;
        }

        let sql = format!(
            r#"
INSERT OR IGNORE INTO workspace_skill_enabled(workspace_id, skill_id, created_at, updated_at)
SELECT
  COALESCE(
    (SELECT workspace_id FROM workspace_active WHERE cli_key = '{cli_key}'),
    (SELECT id FROM workspaces WHERE cli_key = '{cli_key}' ORDER BY id DESC LIMIT 1)
  ),
  id,
  ?1,
  ?1
FROM skills
WHERE {flag_col} = 1
"#
        );

        conn.execute(&sql, params![now]).map_err(|e| {
            format!("failed to migrate skill enabled flags for cli_key={cli_key}: {e}")
        })?;

        let clear_sql = format!("UPDATE skills SET {flag_col} = 0 WHERE {flag_col} != 0");
        conn.execute(&clear_sql, [])
            .map_err(|e| format!("failed to clear legacy skill enabled flag {flag_col}: {e}"))?;
    }

    Ok(())
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("failed to prepare {sql}: {e}"))?;
    let mut rows = stmt
        .query([])
        .map_err(|e| format!("failed to query {sql}: {e}"))?;
    while let Some(row) = rows
        .next()
        .map_err(|e| format!("failed to read table_info row: {e}"))?
    {
        let name: String = row
            .get(1)
            .map_err(|e| format!("failed to read column name from table_info: {e}"))?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}
