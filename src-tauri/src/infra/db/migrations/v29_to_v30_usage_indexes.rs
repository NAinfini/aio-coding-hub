//! Usage: StrictV29 patch - Ensure usage query indexes exist (idempotent).

use rusqlite::{Connection, OptionalExtension};

pub(super) fn ensure_usage_indexes(conn: &mut Connection) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to start sqlite transaction: {e}"))?;

    let has_request_logs: bool = tx
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'request_logs' LIMIT 1",
            [],
            |_| Ok(true),
        )
        .optional()
        .map_err(|e| format!("failed to query sqlite_master: {e}"))?
        .unwrap_or(false);

    if !has_request_logs {
        tx.commit()
            .map_err(|e| format!("failed to commit sqlite transaction: {e}"))?;
        return Ok(());
    }

    // Index 1: Composite index for usage stats summary queries (usage_stats/summary.rs:44-113)
    // Optimizes WHERE cli_key = ? AND created_at >= ? AND created_at < ? AND excluded_from_stats = 0
    tx.execute_batch(
        r#"
CREATE INDEX IF NOT EXISTS idx_request_logs_cli_created_at_excluded
  ON request_logs(cli_key, created_at, excluded_from_stats);
"#,
    )
    .map_err(|e| format!("failed to create idx_request_logs_cli_created_at_excluded: {e}"))?;

    // Index 2: Partial index for provider cost queries (provider_limits.rs)
    // Optimizes queries on successful requests with valid cost data
    tx.execute_batch(
        r#"
CREATE INDEX IF NOT EXISTS idx_request_logs_provider_success_cost
  ON request_logs(final_provider_id, created_at)
  WHERE status >= 200 AND status < 300
    AND error_code IS NULL
    AND cost_usd_femto IS NOT NULL
    AND excluded_from_stats = 0;
"#,
    )
    .map_err(|e| format!("failed to create idx_request_logs_provider_success_cost: {e}"))?;

    tx.commit()
        .map_err(|e| format!("failed to commit sqlite transaction: {e}"))?;
    Ok(())
}
