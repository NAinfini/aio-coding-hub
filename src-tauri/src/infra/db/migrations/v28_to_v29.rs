//! Usage: SQLite migration v28->v29 - Fix empty provider names.

use crate::shared::time::now_unix_seconds;
// cSpell:ignore rusqlite
use rusqlite::Connection;

pub(super) fn migrate_v28_to_v29(conn: &mut Connection) -> Result<(), String> {
    const VERSION: i64 = 29;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to start sqlite transaction: {e}"))?;

    // Fix providers with empty names by setting fallback name
    // Use a unique suffix to avoid potential conflicts with existing "Provider #N" names
    tx.execute(
        r#"
UPDATE providers
SET name = 'Provider #' || id || ' (auto-fixed)'
WHERE name IS NULL OR trim(name) = ''
"#,
        [],
    )
    .map_err(|e| format!("failed to fix empty provider names: {e}"))?;

    // Record migration
    let now = now_unix_seconds();
    tx.execute(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        [VERSION, now],
    )
    .map_err(|e| format!("failed to insert schema_migrations row for v{VERSION}: {e}"))?;

    // Update user_version
    super::set_user_version(&tx, VERSION)?;

    tx.commit()
        .map_err(|e| format!("failed to commit sqlite transaction: {e}"))?;

    Ok(())
}
