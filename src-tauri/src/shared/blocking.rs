//! Usage: Run blocking work on Tauri async runtime with a stable label.

use crate::shared::error::{AppError, AppResult};

pub async fn run<T, E>(
    label: &'static str,
    f: impl FnOnce() -> Result<T, E> + Send + 'static,
) -> AppResult<T>
where
    T: Send + 'static,
    E: Into<AppError> + Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(f).await {
        Ok(result) => result.map_err(Into::into),
        Err(err) => {
            // Avoid forwarding JoinError display text to UI, because panic payloads may contain
            // user content (e.g., slicing errors include a snippet of the offending string).
            if let tauri::Error::JoinError(join_err) = err {
                if join_err.is_panic() {
                    tracing::error!(label, "blocking task panicked");
                    return Err(AppError::new(
                        "TASK_JOIN",
                        format!("{label}: task panicked"),
                    ));
                }

                tracing::warn!(label, "blocking task cancelled");
                return Err(AppError::new(
                    "TASK_JOIN",
                    format!("{label}: task cancelled"),
                ));
            }

            tracing::error!(label, "blocking task failed");
            Err(AppError::new("TASK_JOIN", format!("{label}: task failed")))
        }
    }
}
