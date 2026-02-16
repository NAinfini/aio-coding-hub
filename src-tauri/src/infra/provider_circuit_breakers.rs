//! Usage: Persist provider circuit breaker state to sqlite (buffered writer + load helpers).

use crate::shared::error::db_err;
use crate::shared::time::now_unix_seconds;
use crate::{circuit_breaker, db};
use rusqlite::{params, params_from_iter, ErrorCode, TransactionBehavior};
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::mpsc;

const WRITE_BUFFER_CAPACITY: usize = 512;
const WRITE_BATCH_MAX: usize = 200;
const INSERT_RETRY_MAX_ATTEMPTS: u32 = 6;
const INSERT_RETRY_BASE_DELAY_MS: u64 = 20;
const INSERT_RETRY_MAX_DELAY_MS: u64 = 400;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DbWriteErrorKind {
    Busy,
    Other,
}

#[derive(Debug)]
struct DbWriteError {
    kind: DbWriteErrorKind,
    message: String,
}

impl DbWriteError {
    fn other(message: String) -> Self {
        Self {
            kind: DbWriteErrorKind::Other,
            message,
        }
    }

    fn from_rusqlite(context: &'static str, err: rusqlite::Error) -> Self {
        let kind = classify_rusqlite_error(&err);
        Self {
            kind,
            message: format!("DB_ERROR: {context}: {err}"),
        }
    }

    fn is_retryable(&self) -> bool {
        self.kind == DbWriteErrorKind::Busy
    }
}

fn classify_rusqlite_error(err: &rusqlite::Error) -> DbWriteErrorKind {
    match err {
        rusqlite::Error::SqliteFailure(e, _) => match e.code {
            ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked => DbWriteErrorKind::Busy,
            _ => DbWriteErrorKind::Other,
        },
        _ => DbWriteErrorKind::Other,
    }
}

fn retry_delay(attempt_index: u32) -> Duration {
    let exp = attempt_index.min(20);
    let raw = INSERT_RETRY_BASE_DELAY_MS.saturating_mul(1u64.checked_shl(exp).unwrap_or(u64::MAX));
    Duration::from_millis(raw.min(INSERT_RETRY_MAX_DELAY_MS))
}

fn u32_from_i64(value: i64) -> u32 {
    if value <= 0 {
        return 0;
    }
    if value > u32::MAX as i64 {
        return u32::MAX;
    }
    value as u32
}

pub fn start_buffered_writer(
    db: db::Db,
) -> (
    mpsc::Sender<circuit_breaker::CircuitPersistedState>,
    tauri::async_runtime::JoinHandle<()>,
) {
    let (tx, rx) = mpsc::channel::<circuit_breaker::CircuitPersistedState>(WRITE_BUFFER_CAPACITY);
    let task = tauri::async_runtime::spawn_blocking(move || {
        writer_loop(db, rx);
    });
    (tx, task)
}

fn writer_loop(db: db::Db, mut rx: mpsc::Receiver<circuit_breaker::CircuitPersistedState>) {
    let mut buffer: Vec<circuit_breaker::CircuitPersistedState> =
        Vec::with_capacity(WRITE_BATCH_MAX);

    while let Some(item) = rx.blocking_recv() {
        buffer.push(item);

        while buffer.len() < WRITE_BATCH_MAX {
            match rx.try_recv() {
                Ok(next) => buffer.push(next),
                Err(tokio::sync::mpsc::error::TryRecvError::Empty) => break,
                Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => break,
            }
        }

        if let Err(err) = insert_batch_with_retries(&db, &buffer) {
            tracing::error!(error = %err.message, "熔断器状态批量插入失败");
        }
        buffer.clear();
    }

    if !buffer.is_empty() {
        if let Err(err) = insert_batch_with_retries(&db, &buffer) {
            tracing::error!(error = %err.message, "熔断器状态最终批量插入失败");
        }
    }
}

fn insert_batch_with_retries(
    db: &db::Db,
    items: &[circuit_breaker::CircuitPersistedState],
) -> Result<(), DbWriteError> {
    if items.is_empty() {
        return Ok(());
    }

    let mut attempt: u32 = 0;
    loop {
        match insert_batch_once(db, items) {
            Ok(()) => return Ok(()),
            Err(err) => {
                attempt = attempt.saturating_add(1);
                if !err.is_retryable() || attempt >= INSERT_RETRY_MAX_ATTEMPTS {
                    return Err(err);
                }
                let delay = retry_delay(attempt.saturating_sub(1));
                tracing::debug!(
                    attempt = attempt,
                    delay_ms = delay.as_millis(),
                    error = %err.message,
                    "sqlite busy/locked; retrying provider_circuit_breakers insert"
                );
                std::thread::sleep(delay);
            }
        }
    }
}

fn insert_batch_once(
    db: &db::Db,
    items: &[circuit_breaker::CircuitPersistedState],
) -> Result<(), DbWriteError> {
    let mut latest_by_provider: HashMap<i64, circuit_breaker::CircuitPersistedState> =
        HashMap::with_capacity(items.len().min(WRITE_BATCH_MAX));
    for item in items {
        latest_by_provider.insert(item.provider_id, item.clone());
    }

    let mut conn = db
        .open_connection()
        .map_err(|e| DbWriteError::other(e.to_string()))?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| DbWriteError::from_rusqlite("failed to start transaction", e))?;

    {
        let mut stmt = tx
            .prepare_cached(
                r#"
INSERT INTO provider_circuit_breakers (
  provider_id,
  state,
  failure_count,
  open_until,
  updated_at
) VALUES (?1, ?2, ?3, ?4, ?5)
ON CONFLICT(provider_id) DO UPDATE SET
  state = excluded.state,
  failure_count = excluded.failure_count,
  open_until = excluded.open_until,
  updated_at = excluded.updated_at
"#,
            )
            .map_err(|e| {
                DbWriteError::from_rusqlite("failed to prepare circuit breaker upsert", e)
            })?;

        for item in latest_by_provider.values() {
            let updated_at = if item.updated_at > 0 {
                item.updated_at
            } else {
                now_unix_seconds()
            };

            stmt.execute(params![
                item.provider_id,
                item.state.as_str(),
                item.failure_count as i64,
                item.open_until,
                updated_at
            ])
            .map_err(|e| {
                DbWriteError::from_rusqlite("failed to upsert provider_circuit_breaker", e)
            })?;
        }
    }

    tx.commit()
        .map_err(|e| DbWriteError::from_rusqlite("failed to commit transaction", e))?;

    Ok(())
}

pub fn load_all(
    db: &db::Db,
) -> crate::shared::error::AppResult<HashMap<i64, circuit_breaker::CircuitPersistedState>> {
    let conn = db.open_connection()?;
    let mut stmt = conn
        .prepare(
            r#"
SELECT
  provider_id,
  state,
  failure_count,
  open_until,
  updated_at
FROM provider_circuit_breakers
"#,
        )
        .map_err(|e| db_err!("failed to prepare circuit breaker load query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let raw_state: String = row.get("state")?;
            let open_until: Option<i64> = row.get("open_until")?;
            Ok(circuit_breaker::CircuitPersistedState {
                provider_id: row.get("provider_id")?,
                state: circuit_breaker::CircuitState::from_str(&raw_state),
                failure_count: u32_from_i64(row.get::<_, i64>("failure_count")?),
                open_until,
                updated_at: row.get("updated_at")?,
            })
        })
        .map_err(|e| db_err!("failed to query circuit breaker states: {e}"))?;

    let mut items = HashMap::new();
    for row in rows {
        let item = row.map_err(|e| db_err!("failed to read circuit breaker state: {e}"))?;
        items.insert(item.provider_id, item);
    }

    Ok(items)
}

pub fn delete_by_provider_id(
    db: &db::Db,
    provider_id: i64,
) -> crate::shared::error::AppResult<usize> {
    if provider_id <= 0 {
        return Ok(0);
    }
    let conn = db.open_connection()?;
    conn.execute(
        "DELETE FROM provider_circuit_breakers WHERE provider_id = ?1",
        params![provider_id],
    )
    .map_err(|e| db_err!("failed to delete circuit breaker state: {e}"))
}

pub fn delete_by_provider_ids(
    db: &db::Db,
    provider_ids: &[i64],
) -> crate::shared::error::AppResult<usize> {
    let ids: Vec<i64> = provider_ids.iter().copied().filter(|id| *id > 0).collect();

    if ids.is_empty() {
        return Ok(0);
    }

    let placeholders = crate::db::sql_placeholders(ids.len());
    let sql =
        format!("DELETE FROM provider_circuit_breakers WHERE provider_id IN ({placeholders})");

    let conn = db.open_connection()?;
    conn.execute(&sql, params_from_iter(ids.iter()))
        .map_err(|e| db_err!("failed to delete circuit breaker states: {e}"))
}
