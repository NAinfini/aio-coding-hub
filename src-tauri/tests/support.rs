use std::ffi::OsString;
use std::sync::{Mutex, MutexGuard, OnceLock};

use tempfile::TempDir;

static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn env_lock() -> MutexGuard<'static, ()> {
    ENV_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .expect("lock test env")
}

#[derive(Default)]
struct EnvRestore {
    saved: Vec<(&'static str, Option<OsString>)>,
}

impl EnvRestore {
    fn save_once(&mut self, key: &'static str) {
        if self.saved.iter().any(|(k, _)| *k == key) {
            return;
        }
        self.saved.push((key, std::env::var_os(key)));
    }

    fn set_var(&mut self, key: &'static str, value: impl Into<OsString>) {
        self.save_once(key);
        std::env::set_var(key, value.into());
    }

    fn remove_var(&mut self, key: &'static str) {
        self.save_once(key);
        std::env::remove_var(key);
    }
}

impl Drop for EnvRestore {
    fn drop(&mut self) {
        for (key, value) in self.saved.drain(..).rev() {
            match value {
                Some(v) => std::env::set_var(key, v),
                None => std::env::remove_var(key),
            }
        }
    }
}

pub struct TestApp {
    _lock: MutexGuard<'static, ()>,
    _env: EnvRestore,
    #[allow(dead_code)]
    home: TempDir,
    app: tauri::App<tauri::test::MockRuntime>,
}

impl TestApp {
    pub fn new() -> Self {
        let lock = env_lock();
        let home = tempfile::tempdir().expect("tempdir");

        let mut env = EnvRestore::default();
        let home_os = home.path().as_os_str().to_os_string();

        env.set_var("HOME", home_os.clone());
        // Windows fallback env for `dirs`/tauri path resolution.
        env.set_var("USERPROFILE", home_os);

        // Ensure app data stays within the isolated HOME.
        env.set_var("AIO_CODING_HUB_DOTDIR_NAME", ".aio-coding-hub-test");

        // Default to ~/.codex for deterministic codex_paths behavior.
        env.remove_var("CODEX_HOME");

        let app = tauri::test::mock_app();

        Self {
            _lock: lock,
            _env: env,
            home,
            app,
        }
    }

    pub fn handle(&self) -> tauri::AppHandle<tauri::test::MockRuntime> {
        self.app.handle().clone()
    }

    #[allow(dead_code)]
    pub fn home_dir(&self) -> &std::path::Path {
        self.home.path()
    }
}

impl Default for TestApp {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Shared JSON assertion helpers (previously duplicated across test files)
// ---------------------------------------------------------------------------

#[allow(dead_code)]
pub fn json_str(value: &serde_json::Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

#[allow(dead_code)]
pub fn json_i64(value: &serde_json::Value, key: &str) -> i64 {
    value.get(key).and_then(|v| v.as_i64()).unwrap_or_default()
}

#[allow(dead_code)]
pub fn json_bool(value: &serde_json::Value, key: &str) -> bool {
    value.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

#[allow(dead_code)]
pub fn json_f64(value: &serde_json::Value, key: &str) -> Option<f64> {
    value.get(key).and_then(|v| v.as_f64())
}

#[allow(dead_code)]
pub fn json_u64(value: &serde_json::Value, key: &str) -> u64 {
    value.get(key).and_then(|v| v.as_u64()).unwrap_or_default()
}

#[allow(dead_code)]
pub fn json_array(value: serde_json::Value) -> Vec<serde_json::Value> {
    value.as_array().cloned().unwrap_or_default()
}
