//! Usage: SQLite connection setup, schema migrations, and common DB helpers.

mod migrations;

use crate::app_paths;
use crate::shared::error::AppResult;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::env;
use std::path::PathBuf;
use std::time::Duration;

const DB_FILE_NAME: &str = "aio-coding-hub.db";
const BUSY_TIMEOUT: Duration = Duration::from_millis(2000);
const POOL_MAX_SIZE: u32 = 8;
const POOL_MIN_IDLE: u32 = 1;
const POOL_CONNECTION_TIMEOUT: Duration = Duration::from_secs(5);
const PRAGMA_SYNCHRONOUS_DEFAULT: &str = "NORMAL";

#[derive(Clone)]
pub(crate) struct Db {
    pool: Pool<SqliteConnectionManager>,
}

impl Db {
    pub(crate) fn open_connection(
        &self,
    ) -> AppResult<r2d2::PooledConnection<SqliteConnectionManager>> {
        self.pool
            .get()
            .map_err(|e| format!("DB_ERROR: failed to get connection from pool: {e}"))
            .map_err(Into::into)
    }
}

pub(crate) fn sql_placeholders(count: usize) -> String {
    if count == 0 {
        return String::new();
    }

    let mut out = String::with_capacity(count.saturating_mul(2).saturating_sub(1));
    for idx in 0..count {
        if idx > 0 {
            out.push(',');
        }
        out.push('?');
    }
    out
}

pub fn db_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> AppResult<PathBuf> {
    Ok(app_paths::app_data_dir(app)?.join(DB_FILE_NAME))
}

pub fn init<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> AppResult<Db> {
    let path = db_path(app)?;
    let path_hint = path.to_string_lossy();

    let manager = SqliteConnectionManager::file(&path).with_init(|conn| {
        conn.busy_timeout(BUSY_TIMEOUT)?;
        configure_connection(conn)
    });

    let pool = Pool::builder()
        .max_size(POOL_MAX_SIZE)
        .min_idle(Some(POOL_MIN_IDLE))
        .connection_timeout(POOL_CONNECTION_TIMEOUT)
        .build(manager)
        .map_err(|e| format!("DB_ERROR: failed to create db pool: {e}"))?;
    let mut conn = pool
        .get()
        .map_err(|e| format!("DB_ERROR: failed to get startup connection: {e}"))?;

    migrations::apply_migrations(&mut conn)
        .map_err(|e| format!("sqlite migration failed at {path_hint}: {e}"))?;

    Ok(Db { pool })
}

fn configure_connection(conn: &Connection) -> rusqlite::Result<()> {
    let synchronous = env::var("AIO_DB_PRAGMA_SYNCHRONOUS")
        .ok()
        .and_then(|raw| {
            let normalized = raw.trim().to_ascii_uppercase();
            match normalized.as_str() {
                "OFF" | "NORMAL" | "FULL" | "EXTRA" => Some(normalized),
                _ => None,
            }
        })
        .unwrap_or_else(|| PRAGMA_SYNCHRONOUS_DEFAULT.to_string());

    conn.execute_batch(&format!(
        r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = {synchronous};
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456;
"#,
    ))?;

    Ok(())
}
