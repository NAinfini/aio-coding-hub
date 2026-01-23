use crate::{
    circuit_breaker, provider_circuit_breakers, providers, request_attempt_logs, request_logs,
    session_manager, settings, wsl,
};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tokio::sync::oneshot;

use super::codex_session_id::CodexSessionIdCache;
use super::events::GatewayLogEvent;
use super::listen;
use super::proxy::{ProviderBaseUrlPingCache, RecentErrorCache};
use super::routes::build_router;
use super::util::now_unix_seconds;
use super::{GatewayProviderCircuitStatus, GatewayStatus};

struct RunningGateway {
    port: u16,
    base_url: String,
    listen_addr: String,
    circuit: Arc<circuit_breaker::CircuitBreaker>,
    session: Arc<session_manager::SessionManager>,
    shutdown: oneshot::Sender<()>,
    task: tauri::async_runtime::JoinHandle<()>,
    log_task: tauri::async_runtime::JoinHandle<()>,
    attempt_log_task: tauri::async_runtime::JoinHandle<()>,
    circuit_task: tauri::async_runtime::JoinHandle<()>,
}

type RunningGatewayHandles = (
    oneshot::Sender<()>,
    tauri::async_runtime::JoinHandle<()>,
    tauri::async_runtime::JoinHandle<()>,
    tauri::async_runtime::JoinHandle<()>,
    tauri::async_runtime::JoinHandle<()>,
);

#[derive(Default)]
pub struct GatewayManager {
    running: Option<RunningGateway>,
}

#[derive(Clone)]
pub(super) struct GatewayAppState {
    pub(super) app: tauri::AppHandle,
    pub(super) client: reqwest::Client,
    pub(super) log_tx: tokio::sync::mpsc::Sender<request_logs::RequestLogInsert>,
    pub(super) attempt_log_tx:
        tokio::sync::mpsc::Sender<request_attempt_logs::RequestAttemptLogInsert>,
    pub(super) circuit: Arc<circuit_breaker::CircuitBreaker>,
    pub(super) session: Arc<session_manager::SessionManager>,
    pub(super) codex_session_cache: Arc<Mutex<CodexSessionIdCache>>,
    pub(super) recent_errors: Arc<Mutex<RecentErrorCache>>,
    pub(super) latency_cache: Arc<Mutex<ProviderBaseUrlPingCache>>,
}
fn port_candidates(preferred: Option<u16>) -> impl Iterator<Item = u16> {
    let mut candidates = Vec::with_capacity(
        (settings::MAX_GATEWAY_PORT - settings::DEFAULT_GATEWAY_PORT + 2) as usize,
    );

    if let Some(p) = preferred {
        if p > 0 {
            candidates.push(p);
        }
    }

    for port in settings::DEFAULT_GATEWAY_PORT..=settings::MAX_GATEWAY_PORT {
        if candidates.first().copied() == Some(port) {
            continue;
        }
        candidates.push(port);
    }

    candidates.into_iter()
}

fn bind_host_port(bind_host: &str, port: u16) -> Option<std::net::TcpListener> {
    let std_listener = std::net::TcpListener::bind((bind_host, port)).ok()?;
    std_listener.set_nonblocking(true).ok()?;
    Some(std_listener)
}

fn bind_first_available(
    bind_host: &str,
    preferred: Option<u16>,
) -> Result<(u16, std::net::TcpListener), String> {
    for port in port_candidates(preferred) {
        if let Some(std_listener) = bind_host_port(bind_host, port) {
            return Ok((port, std_listener));
        }
    }

    Err(format!(
        "no available port in range {}..{} for host {bind_host}",
        settings::DEFAULT_GATEWAY_PORT,
        settings::MAX_GATEWAY_PORT
    ))
}

impl GatewayManager {
    pub fn status(&self) -> GatewayStatus {
        match &self.running {
            Some(r) => GatewayStatus {
                running: true,
                port: Some(r.port),
                base_url: Some(r.base_url.clone()),
                listen_addr: Some(r.listen_addr.clone()),
            },
            None => GatewayStatus {
                running: false,
                port: None,
                base_url: None,
                listen_addr: None,
            },
        }
    }

    pub fn active_sessions(
        &self,
        now_unix: i64,
        limit: usize,
    ) -> Vec<session_manager::ActiveSessionSnapshot> {
        match &self.running {
            Some(r) => r.session.list_active(now_unix, limit),
            None => Vec::new(),
        }
    }

    pub fn start(
        &mut self,
        app: &tauri::AppHandle,
        preferred_port: Option<u16>,
    ) -> Result<GatewayStatus, String> {
        if self.running.is_some() {
            return Ok(self.status());
        }

        let requested_port = preferred_port
            .filter(|p| *p > 0)
            .unwrap_or(settings::DEFAULT_GATEWAY_PORT);

        let cfg = settings::read(app).unwrap_or_default();
        let (bind_host, fixed_port) = match cfg.gateway_listen_mode {
            settings::GatewayListenMode::Localhost => ("127.0.0.1".to_string(), None),
            settings::GatewayListenMode::Lan => ("0.0.0.0".to_string(), None),
            settings::GatewayListenMode::WslAuto => (
                wsl::host_ipv4_best_effort().unwrap_or_else(|| "127.0.0.1".to_string()),
                None,
            ),
            settings::GatewayListenMode::Custom => {
                let parsed =
                    listen::parse_custom_listen_address(&cfg.gateway_custom_listen_address)?;
                (parsed.host, parsed.port)
            }
        };

        let (port, std_listener) = if let Some(port) = fixed_port {
            let listener = bind_host_port(&bind_host, port)
                .ok_or_else(|| format!("failed to bind {bind_host}:{port}"))?;
            (port, listener)
        } else {
            bind_first_available(&bind_host, preferred_port)?
        };

        let listen_addr = listen::format_host_port(&bind_host, port);
        let base_host = match cfg.gateway_listen_mode {
            settings::GatewayListenMode::Lan => "127.0.0.1".to_string(),
            settings::GatewayListenMode::Custom if listen::is_wildcard_host(&bind_host) => {
                "127.0.0.1".to_string()
            }
            _ => bind_host.clone(),
        };
        let base_url = format!("http://{}", listen::format_host_port(&base_host, port));
        let bind_addr = std_listener
            .local_addr()
            .unwrap_or_else(|_| SocketAddr::from(([127, 0, 0, 1], port)));

        if fixed_port.is_none() && port != requested_port {
            if let Ok(mut current) = settings::read(app) {
                if current.preferred_port != port {
                    current.preferred_port = port;
                    let _ = settings::write(app, &current);
                }
            }

            let payload = GatewayLogEvent {
                level: "warn",
                error_code: "GW_PORT_IN_USE",
                message: format!("端口 {requested_port} 被占用，已自动切换到 {port}"),
                requested_port,
                bound_port: port,
                base_url: base_url.clone(),
            };
            let _ = app.emit("gateway:log", payload);
        }

        let client = reqwest::Client::builder()
            .user_agent(format!(
                "aio-coding-hub-gateway/{}",
                env!("CARGO_PKG_VERSION")
            ))
            .build()
            .map_err(|e| format!("GW_HTTP_CLIENT_INIT: {e}"))?;

        let (log_tx, log_task) = request_logs::start_buffered_writer(app.clone());
        let (attempt_log_tx, attempt_log_task) =
            request_attempt_logs::start_buffered_writer(app.clone());
        let (circuit_tx, circuit_task) =
            provider_circuit_breakers::start_buffered_writer(app.clone());

        let retention_days = settings::log_retention_days_fail_open(app);
        let app_for_cleanup = app.clone();
        std::mem::drop(tauri::async_runtime::spawn_blocking(move || {
            if let Err(err) = request_logs::cleanup_expired(&app_for_cleanup, retention_days) {
                tracing::warn!("请求日志启动清理失败: {}", err);
            }
            if let Err(err) =
                request_attempt_logs::cleanup_expired(&app_for_cleanup, retention_days)
            {
                tracing::warn!("尝试日志启动清理失败: {}", err);
            }
        }));

        let circuit_initial = match provider_circuit_breakers::load_all(app) {
            Ok(v) => v,
            Err(err) => {
                tracing::warn!("熔断器状态加载失败，使用默认值: {}", err);
                Default::default()
            }
        };

        let circuit_config = match settings::read(app) {
            Ok(cfg) => circuit_breaker::CircuitBreakerConfig {
                failure_threshold: cfg.circuit_breaker_failure_threshold.max(1),
                open_duration_secs: (cfg.circuit_breaker_open_duration_minutes as i64)
                    .saturating_mul(60),
            },
            Err(_) => circuit_breaker::CircuitBreakerConfig::default(),
        };
        let circuit = Arc::new(circuit_breaker::CircuitBreaker::new(
            circuit_config,
            circuit_initial,
            Some(circuit_tx),
        ));
        let circuit_for_manager = circuit.clone();
        let session = Arc::new(session_manager::SessionManager::new());
        let codex_session_cache = Arc::new(Mutex::new(CodexSessionIdCache::default()));
        let recent_errors = Arc::new(Mutex::new(RecentErrorCache::default()));
        let latency_cache = Arc::new(Mutex::new(ProviderBaseUrlPingCache::default()));

        let state = GatewayAppState {
            app: app.clone(),
            client,
            log_tx,
            attempt_log_tx,
            circuit,
            session: session.clone(),
            codex_session_cache,
            recent_errors,
            latency_cache,
        };

        let app = build_router(state);
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        let task = tauri::async_runtime::spawn(async move {
            let listener = match tokio::net::TcpListener::from_std(std_listener) {
                Ok(l) => l,
                Err(err) => {
                    tracing::error!(bind_addr = %bind_addr, "网关监听器初始化失败: {}", err);
                    return;
                }
            };

            let serve = axum::serve(listener, app).with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            });

            if let Err(err) = serve.await {
                tracing::error!(bind_addr = %bind_addr, "网关服务器运行错误: {}", err);
            }
        });

        self.running = Some(RunningGateway {
            port,
            base_url,
            listen_addr,
            circuit: circuit_for_manager,
            session,
            shutdown: shutdown_tx,
            task,
            log_task,
            attempt_log_task,
            circuit_task,
        });

        Ok(self.status())
    }

    pub fn circuit_status(
        &self,
        app: &tauri::AppHandle,
        cli_key: &str,
    ) -> Result<Vec<GatewayProviderCircuitStatus>, String> {
        let provider_ids: Vec<i64> = providers::list_by_cli(app, cli_key)?
            .into_iter()
            .map(|p| p.id)
            .collect();

        if provider_ids.is_empty() {
            return Ok(Vec::new());
        }

        let now_unix = now_unix_seconds() as i64;

        if let Some(r) = &self.running {
            return Ok(provider_ids
                .into_iter()
                .map(|provider_id| {
                    let check = r.circuit.should_allow(provider_id, now_unix);
                    let snap = check.after;
                    GatewayProviderCircuitStatus {
                        provider_id,
                        state: snap.state.as_str().to_string(),
                        failure_count: snap.failure_count,
                        failure_threshold: snap.failure_threshold,
                        open_until: snap.open_until,
                        cooldown_until: snap.cooldown_until,
                    }
                })
                .collect());
        }

        let persisted = provider_circuit_breakers::load_all(app).unwrap_or_default();
        let cfg = settings::read(app).unwrap_or_default();
        let failure_threshold = cfg.circuit_breaker_failure_threshold.max(1);

        Ok(provider_ids
            .into_iter()
            .map(|provider_id| {
                if let Some(item) = persisted.get(&provider_id) {
                    let expired = item.state == circuit_breaker::CircuitState::Open
                        && item.open_until.map(|t| now_unix >= t).unwrap_or(true);
                    if expired {
                        return GatewayProviderCircuitStatus {
                            provider_id,
                            state: circuit_breaker::CircuitState::Closed.as_str().to_string(),
                            failure_count: 0,
                            failure_threshold,
                            open_until: None,
                            cooldown_until: None,
                        };
                    }
                    GatewayProviderCircuitStatus {
                        provider_id,
                        state: item.state.as_str().to_string(),
                        failure_count: item.failure_count,
                        failure_threshold,
                        open_until: item.open_until,
                        cooldown_until: None,
                    }
                } else {
                    GatewayProviderCircuitStatus {
                        provider_id,
                        state: circuit_breaker::CircuitState::Closed.as_str().to_string(),
                        failure_count: 0,
                        failure_threshold,
                        open_until: None,
                        cooldown_until: None,
                    }
                }
            })
            .collect())
    }

    pub fn circuit_reset_provider(
        &self,
        app: &tauri::AppHandle,
        provider_id: i64,
    ) -> Result<(), String> {
        if provider_id <= 0 {
            return Err("SEC_INVALID_INPUT: provider_id must be > 0".to_string());
        }

        if let Some(r) = &self.running {
            let now_unix = now_unix_seconds() as i64;
            r.circuit.reset(provider_id, now_unix);
        }

        let _ = provider_circuit_breakers::delete_by_provider_id(app, provider_id)?;
        Ok(())
    }

    pub fn circuit_reset_cli(
        &self,
        app: &tauri::AppHandle,
        cli_key: &str,
    ) -> Result<usize, String> {
        let provider_ids: Vec<i64> = providers::list_by_cli(app, cli_key)?
            .into_iter()
            .map(|p| p.id)
            .collect();

        if provider_ids.is_empty() {
            return Ok(0);
        }

        if let Some(r) = &self.running {
            let now_unix = now_unix_seconds() as i64;
            for provider_id in &provider_ids {
                r.circuit.reset(*provider_id, now_unix);
            }
        }

        let _ = provider_circuit_breakers::delete_by_provider_ids(app, &provider_ids)?;
        Ok(provider_ids.len())
    }

    pub fn take_running(&mut self) -> Option<RunningGatewayHandles> {
        self.running.take().map(|r| {
            (
                r.shutdown,
                r.task,
                r.log_task,
                r.attempt_log_task,
                r.circuit_task,
            )
        })
    }
}
