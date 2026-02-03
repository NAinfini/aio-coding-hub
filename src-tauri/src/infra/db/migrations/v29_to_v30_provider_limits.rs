//! Usage: StrictV29 patch - Ensure provider spend-limit columns exist (idempotent).

use rusqlite::{Connection, OptionalExtension};

pub(super) fn ensure_provider_limits(conn: &mut Connection) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to start sqlite transaction: {e}"))?;

    let has_providers_table: bool = tx
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'providers' LIMIT 1",
            [],
            |_| Ok(true),
        )
        .optional()
        .map_err(|e| format!("failed to query sqlite_master: {e}"))?
        .unwrap_or(false);

    if !has_providers_table {
        tx.commit()
            .map_err(|e| format!("failed to commit sqlite transaction: {e}"))?;
        return Ok(());
    }

    let mut existing: std::collections::HashSet<String> = std::collections::HashSet::new();
    {
        let mut stmt = tx
            .prepare("PRAGMA table_info(providers)")
            .map_err(|e| format!("failed to prepare providers table_info query: {e}"))?;
        let mut rows = stmt
            .query([])
            .map_err(|e| format!("failed to query providers table_info: {e}"))?;

        while let Some(row) = rows
            .next()
            .map_err(|e| format!("failed to read providers table_info row: {e}"))?
        {
            let name: String = row
                .get(1)
                .map_err(|e| format!("failed to read providers column name: {e}"))?;
            existing.insert(name);
        }
    }

    let mut ddl: Vec<&'static str> = Vec::new();

    if !existing.contains("limit_5h_usd") {
        ddl.push("ALTER TABLE providers ADD COLUMN limit_5h_usd REAL;");
    }
    if !existing.contains("limit_daily_usd") {
        ddl.push("ALTER TABLE providers ADD COLUMN limit_daily_usd REAL;");
    }
    if !existing.contains("daily_reset_mode") {
        ddl.push(
            "ALTER TABLE providers ADD COLUMN daily_reset_mode TEXT NOT NULL DEFAULT 'fixed';",
        );
    }
    if !existing.contains("daily_reset_time") {
        ddl.push(
            "ALTER TABLE providers ADD COLUMN daily_reset_time TEXT NOT NULL DEFAULT '00:00:00';",
        );
    }
    if !existing.contains("limit_weekly_usd") {
        ddl.push("ALTER TABLE providers ADD COLUMN limit_weekly_usd REAL;");
    }
    if !existing.contains("limit_monthly_usd") {
        ddl.push("ALTER TABLE providers ADD COLUMN limit_monthly_usd REAL;");
    }
    if !existing.contains("limit_total_usd") {
        ddl.push("ALTER TABLE providers ADD COLUMN limit_total_usd REAL;");
    }
    if !existing.contains("window_5h_start_ts") {
        ddl.push("ALTER TABLE providers ADD COLUMN window_5h_start_ts INTEGER;");
    }

    if !ddl.is_empty() {
        tx.execute_batch(ddl.join("\n").as_str())
            .map_err(|e| format!("failed to ensure providers spend limit columns: {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("failed to commit sqlite transaction: {e}"))?;
    Ok(())
}
