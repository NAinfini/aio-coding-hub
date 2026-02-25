//! Usage: Detect frontend/WebView hangs (white screen) with a heartbeat + pong watchdog and
//! attempt best-effort self-healing via reload.
//!
//! Contract:
//! - Backend emits `app:heartbeat` every 15s.
//! - Frontend listens to `app:heartbeat` and invokes `app_heartbeat_pong` (fire-and-forget).
//! - If backend sees no pong for 30s and the main window is visible (and not minimized),
//!   it triggers recovery with exponential backoff + circuit breaker.

use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

const MAIN_WINDOW_LABEL: &str = "main";

const HEARTBEAT_EVENT: &str = "app:heartbeat";
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);
const PONG_TIMEOUT: Duration = Duration::from_secs(30);

const RECOVERY_BACKOFF_BASE: Duration = Duration::from_secs(30);
const RECOVERY_BACKOFF_MAX: Duration = Duration::from_secs(5 * 60);

const RECOVERY_CIRCUIT_THRESHOLD: u32 = 5;
const RECOVERY_CIRCUIT_DURATION: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, Copy, Serialize)]
struct HeartbeatPayload {
    ts_unix_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RecoveryGate {
    Allowed,
    CircuitOpen { open_until_unix_ms: u64 },
    Backoff { next_allowed_unix_ms: u64 },
}

#[derive(Debug, Clone, Copy)]
struct WatchdogSnapshot {
    last_pong_unix_ms: u64,
    next_recovery_allowed_unix_ms: u64,
    circuit_open_until_unix_ms: u64,
    last_timeout_logged_unix_ms: u64,
}

#[derive(Debug)]
struct WatchdogInner {
    last_pong_unix_ms: u64,
    recovery_streak: u32,
    next_recovery_allowed_unix_ms: u64,
    circuit_open_until_unix_ms: u64,
    last_timeout_logged_unix_ms: u64,
}

impl Default for WatchdogInner {
    fn default() -> Self {
        let now = now_unix_millis();
        Self {
            last_pong_unix_ms: now,
            recovery_streak: 0,
            next_recovery_allowed_unix_ms: 0,
            circuit_open_until_unix_ms: 0,
            last_timeout_logged_unix_ms: 0,
        }
    }
}

#[derive(Default)]
pub(crate) struct HeartbeatWatchdogState {
    inner: Mutex<WatchdogInner>,
}

impl HeartbeatWatchdogState {
    pub(crate) fn record_pong(&self) {
        let now = now_unix_millis();
        let mut inner = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        inner.last_pong_unix_ms = now;
        inner.recovery_streak = 0;
        inner.next_recovery_allowed_unix_ms = 0;
        inner.circuit_open_until_unix_ms = 0;
    }

    fn snapshot(&self) -> WatchdogSnapshot {
        let inner = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        WatchdogSnapshot {
            last_pong_unix_ms: inner.last_pong_unix_ms,
            next_recovery_allowed_unix_ms: inner.next_recovery_allowed_unix_ms,
            circuit_open_until_unix_ms: inner.circuit_open_until_unix_ms,
            last_timeout_logged_unix_ms: inner.last_timeout_logged_unix_ms,
        }
    }

    fn set_last_timeout_logged_unix_ms(&self, ts_unix_ms: u64) {
        let mut inner = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        inner.last_timeout_logged_unix_ms = ts_unix_ms;
    }

    fn schedule_next_recovery(&self, streak: u32, now_unix_ms: u64) -> Duration {
        let delay = recovery_backoff_delay(streak);
        let mut inner = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        inner.next_recovery_allowed_unix_ms = now_unix_ms.saturating_add(delay.as_millis() as u64);
        delay
    }

    fn trip_circuit(&self, now_unix_ms: u64) {
        let until = now_unix_ms.saturating_add(RECOVERY_CIRCUIT_DURATION.as_millis() as u64);
        let mut inner = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        inner.circuit_open_until_unix_ms = until;
        inner.recovery_streak = 0;
        inner.next_recovery_allowed_unix_ms = until;
    }

    fn bump_recovery_streak(&self) -> u32 {
        let mut inner = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        inner.recovery_streak = inner.recovery_streak.saturating_add(1);
        inner.recovery_streak
    }
}

pub(crate) fn install(app: &tauri::AppHandle) {
    tracing::info!(
        interval_s = HEARTBEAT_INTERVAL.as_secs(),
        timeout_s = PONG_TIMEOUT.as_secs(),
        "WebView 心跳监控已启动"
    );

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(HEARTBEAT_INTERVAL);
        // First tick is immediate; skip it to avoid double fire at startup.
        interval.tick().await;
        loop {
            interval.tick().await;

            let now = now_unix_millis();
            let payload = HeartbeatPayload { ts_unix_ms: now };

            if let Err(err) = app.emit(HEARTBEAT_EVENT, payload) {
                tracing::debug!("emit heartbeat failed: {}", err);
            }

            check_and_recover_if_needed(&app).await;
        }
    });
}

async fn check_and_recover_if_needed(app: &tauri::AppHandle) {
    let now = now_unix_millis();
    let state = app.state::<HeartbeatWatchdogState>();
    let snapshot = state.snapshot();

    let since_last_pong_ms = now.saturating_sub(snapshot.last_pong_unix_ms);
    if since_last_pong_ms <= PONG_TIMEOUT.as_millis() as u64 {
        return;
    }

    if now.saturating_sub(snapshot.last_timeout_logged_unix_ms) > 60_000 {
        state.set_last_timeout_logged_unix_ms(now);
        tracing::warn!(
            since_last_pong_ms,
            "frontend heartbeat timeout detected (possible blank screen / freeze)"
        );
    }

    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        tracing::debug!("heartbeat watchdog: main window not found");
        return;
    };

    let is_visible = window.is_visible().unwrap_or(false);
    let is_minimized = window.is_minimized().unwrap_or(true);
    if !is_visible || is_minimized {
        return;
    }

    match recovery_gate(now, snapshot) {
        RecoveryGate::Allowed => {}
        RecoveryGate::CircuitOpen { open_until_unix_ms } => {
            tracing::info!(
                open_until_unix_ms,
                "blank screen recovery circuit open, skipping recovery attempt"
            );
            return;
        }
        RecoveryGate::Backoff {
            next_allowed_unix_ms,
        } => {
            tracing::info!(
                next_allowed_unix_ms,
                "blank screen recovery in backoff period, skipping recovery attempt"
            );
            return;
        }
    }

    let streak = state.bump_recovery_streak();

    if should_trip_circuit(streak) {
        state.trip_circuit(now);
        tracing::warn!(
            streak,
            open_for_s = RECOVERY_CIRCUIT_DURATION.as_secs(),
            "blank screen recovery circuit tripped, pausing auto-recovery"
        );
        return;
    }

    tracing::warn!(streak, since_last_pong_ms, "attempting page reload");

    let attempt = attempt_reload(&window).await;
    match attempt {
        Ok(()) => {
            let delay = state.schedule_next_recovery(streak, now);
            tracing::info!(
                streak,
                next_delay_s = delay.as_secs(),
                "已发起恢复指令，等待 pong；若仍无响应将按退避再次尝试"
            );
        }
        Err(err) => {
            let delay = state.schedule_next_recovery(streak, now);
            tracing::warn!(
                streak,
                next_delay_s = delay.as_secs(),
                "恢复指令下发失败（可能 WebView 已崩溃）：{}",
                err
            );
        }
    }
}

async fn attempt_reload(
    window: &tauri::WebviewWindow,
) -> Result<(), crate::shared::error::AppError> {
    if window.eval("window.location.reload()").is_ok() {
        return Ok(());
    }

    let url = window.url().map(|u| u.to_string()).unwrap_or_default();
    let url_literal = serde_json::to_string(&url).unwrap_or_else(|_| "\"\"".to_string());
    let js = format!("window.location.href = {url_literal};");
    window
        .eval(js)
        .map_err(|e| crate::shared::error::AppError::from(e.to_string()))?;
    Ok(())
}

fn recovery_gate(now_unix_ms: u64, snapshot: WatchdogSnapshot) -> RecoveryGate {
    if snapshot.circuit_open_until_unix_ms > now_unix_ms {
        return RecoveryGate::CircuitOpen {
            open_until_unix_ms: snapshot.circuit_open_until_unix_ms,
        };
    }
    if snapshot.next_recovery_allowed_unix_ms > now_unix_ms {
        return RecoveryGate::Backoff {
            next_allowed_unix_ms: snapshot.next_recovery_allowed_unix_ms,
        };
    }
    RecoveryGate::Allowed
}

fn should_trip_circuit(streak: u32) -> bool {
    streak >= RECOVERY_CIRCUIT_THRESHOLD
}

fn recovery_backoff_delay(streak: u32) -> Duration {
    let streak = streak.max(1);
    let max_exponent = 20u32;
    let exponent = (streak - 1).min(max_exponent);
    let base_ms = RECOVERY_BACKOFF_BASE.as_millis() as u64;
    let factor = 1u64.checked_shl(exponent).unwrap_or(u64::MAX);
    let ms = base_ms.saturating_mul(factor);
    let capped_ms = (RECOVERY_BACKOFF_MAX.as_millis() as u64).min(ms);
    Duration::from_millis(capped_ms)
}

fn now_unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_backoff_delay_matches_spec_and_caps() {
        assert_eq!(recovery_backoff_delay(1), Duration::from_secs(30));
        assert_eq!(recovery_backoff_delay(2), Duration::from_secs(60));
        assert_eq!(recovery_backoff_delay(3), Duration::from_secs(120));
        assert_eq!(recovery_backoff_delay(4), Duration::from_secs(240));
        // 30 * 2^(5-1) = 480s, but capped at 300s.
        assert_eq!(recovery_backoff_delay(5), Duration::from_secs(300));
        assert_eq!(recovery_backoff_delay(100), Duration::from_secs(300));
    }

    #[test]
    fn should_trip_circuit_triggers_at_threshold() {
        assert!(!should_trip_circuit(RECOVERY_CIRCUIT_THRESHOLD - 1));
        assert!(should_trip_circuit(RECOVERY_CIRCUIT_THRESHOLD));
        assert!(should_trip_circuit(RECOVERY_CIRCUIT_THRESHOLD + 1));
    }

    #[test]
    fn recovery_gate_blocks_when_circuit_open_or_backoff() {
        let now = 1_000u64;
        let base = WatchdogSnapshot {
            last_pong_unix_ms: 0,
            next_recovery_allowed_unix_ms: 0,
            circuit_open_until_unix_ms: 0,
            last_timeout_logged_unix_ms: 0,
        };

        assert_eq!(recovery_gate(now, base), RecoveryGate::Allowed);

        let backoff = WatchdogSnapshot {
            next_recovery_allowed_unix_ms: now + 1,
            ..base
        };
        assert_eq!(
            recovery_gate(now, backoff),
            RecoveryGate::Backoff {
                next_allowed_unix_ms: now + 1
            }
        );

        let circuit = WatchdogSnapshot {
            circuit_open_until_unix_ms: now + 2,
            ..base
        };
        assert_eq!(
            recovery_gate(now, circuit),
            RecoveryGate::CircuitOpen {
                open_until_unix_ms: now + 2
            }
        );
    }
}
