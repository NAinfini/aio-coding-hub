//! Usage: Short-lived in-memory cache for OAuth quota cooldown account ids.

use crate::shared::error::AppResult;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

const QUOTA_CACHE_TTL_SECS: i64 = 5;

#[derive(Debug, Clone)]
struct QuotaCacheEntry {
    account_ids: HashSet<i64>,
    expires_at_unix: i64,
}

#[derive(Debug, Default)]
pub(crate) struct QuotaCache {
    inner: Mutex<HashMap<String, QuotaCacheEntry>>,
}

impl QuotaCache {
    pub(crate) fn load_quota_exceeded_account_ids_for_cli(
        &self,
        db: &crate::db::Db,
        cli_key: &str,
        now_unix: i64,
    ) -> AppResult<HashSet<i64>> {
        if let Some(cached) = self.get_if_fresh(cli_key, now_unix) {
            return Ok(cached);
        }

        let conn = db.open_connection()?;
        let account_ids = crate::oauth_accounts::list_quota_exceeded_account_ids_for_cli(
            &conn, cli_key, now_unix,
        )?;
        self.store(cli_key, account_ids.clone(), now_unix);
        Ok(account_ids)
    }

    pub(crate) fn invalidate_cli(&self, cli_key: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.remove(cli_key);
        }
    }

    pub(crate) fn invalidate_all(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.clear();
        }
    }

    fn get_if_fresh(&self, cli_key: &str, now_unix: i64) -> Option<HashSet<i64>> {
        let mut inner = self.inner.lock().ok()?;
        if let Some(entry) = inner.get(cli_key) {
            if entry.expires_at_unix > now_unix {
                return Some(entry.account_ids.clone());
            }
        }
        inner.remove(cli_key);
        None
    }

    fn store(&self, cli_key: &str, account_ids: HashSet<i64>, now_unix: i64) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.insert(
                cli_key.to_string(),
                QuotaCacheEntry {
                    account_ids,
                    expires_at_unix: now_unix.saturating_add(QUOTA_CACHE_TTL_SECS.max(1)),
                },
            );
        }
    }
}

fn global_quota_cache() -> &'static QuotaCache {
    static QUOTA_CACHE: OnceLock<QuotaCache> = OnceLock::new();
    QUOTA_CACHE.get_or_init(QuotaCache::default)
}

pub(crate) fn load_quota_exceeded_account_ids_for_cli(
    db: &crate::db::Db,
    cli_key: &str,
    now_unix: i64,
) -> AppResult<HashSet<i64>> {
    global_quota_cache().load_quota_exceeded_account_ids_for_cli(db, cli_key, now_unix)
}

pub(crate) fn invalidate_cli(cli_key: &str) {
    global_quota_cache().invalidate_cli(cli_key);
}

pub(crate) fn invalidate_all() {
    global_quota_cache().invalidate_all();
}

#[cfg(test)]
mod tests {
    use super::QuotaCache;
    use crate::{db, oauth_accounts, shared::time::now_unix_seconds};

    fn seed_account(db: &db::Db, cli_key: &str, label: &str) -> i64 {
        let conn = db.open_connection().expect("open db");
        oauth_accounts::upsert(
            &conn,
            None,
            cli_key,
            label,
            None,
            "oauth_test",
            Some("access-token"),
            Some("refresh-token"),
            None,
            Some("https://token.example.com"),
            Some("client-id"),
            None,
            Some(1_900_000_000),
            Some(300),
            None,
            Some("active"),
        )
        .expect("create oauth account")
        .id
    }

    #[test]
    fn cache_returns_stale_until_expiry_or_invalidate() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("quota-cache.db");
        let db = db::init_for_tests(&db_path).expect("init db");
        let cache = QuotaCache::default();

        let account_id = seed_account(&db, "claude", "Work");
        let now = now_unix_seconds() as i64;

        {
            let conn = db.open_connection().expect("open conn");
            oauth_accounts::mark_quota_exceeded(&conn, account_id, now + 120)
                .expect("mark quota exceeded");
        }

        let first = cache
            .load_quota_exceeded_account_ids_for_cli(&db, "claude", now)
            .expect("first load");
        assert!(first.contains(&account_id));

        {
            let conn = db.open_connection().expect("open conn");
            oauth_accounts::clear_quota(&conn, account_id).expect("clear quota");
        }

        let cached = cache
            .load_quota_exceeded_account_ids_for_cli(&db, "claude", now)
            .expect("cached load");
        assert!(cached.contains(&account_id));

        cache.invalidate_cli("claude");
        let refreshed = cache
            .load_quota_exceeded_account_ids_for_cli(&db, "claude", now)
            .expect("refreshed load");
        assert!(!refreshed.contains(&account_id));
    }
}
