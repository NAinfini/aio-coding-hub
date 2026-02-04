//! Usage: StrictV29 patch - Ensure sort_mode_providers.enabled column exists (idempotent).

use rusqlite::{Connection, OptionalExtension};

pub(super) fn ensure_sort_mode_providers_enabled(conn: &mut Connection) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to start sqlite transaction: {e}"))?;

    let has_table: bool = tx
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sort_mode_providers' LIMIT 1",
            [],
            |_| Ok(true),
        )
        .optional()
        .map_err(|e| format!("failed to query sqlite_master: {e}"))?
        .unwrap_or(false);

    if !has_table {
        tx.commit()
            .map_err(|e| format!("failed to commit sqlite transaction: {e}"))?;
        return Ok(());
    }

    let mut existing: std::collections::HashSet<String> = std::collections::HashSet::new();
    {
        let mut stmt = tx
            .prepare("PRAGMA table_info(sort_mode_providers)")
            .map_err(|e| format!("failed to prepare sort_mode_providers table_info query: {e}"))?;
        let mut rows = stmt
            .query([])
            .map_err(|e| format!("failed to query sort_mode_providers table_info: {e}"))?;
        while let Some(row) = rows
            .next()
            .map_err(|e| format!("failed to read sort_mode_providers table_info row: {e}"))?
        {
            let name: String = row
                .get(1)
                .map_err(|e| format!("failed to read sort_mode_providers column name: {e}"))?;
            existing.insert(name);
        }
    }

    if !existing.contains("enabled") {
        tx.execute_batch(
            "ALTER TABLE sort_mode_providers ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;",
        )
        .map_err(|e| format!("failed to ensure sort_mode_providers.enabled column: {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("failed to commit sqlite transaction: {e}"))?;
    Ok(())
}
