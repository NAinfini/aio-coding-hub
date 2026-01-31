//! Usage: Run blocking work on Tauri async runtime with a stable label.

pub async fn run<T>(
    label: &'static str,
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String>
where
    T: Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(f).await {
        Ok(result) => result,
        Err(err) => {
            // Avoid forwarding JoinError display text to UI, because panic payloads may contain
            // user content (e.g., slicing errors include a snippet of the offending string).
            if let tauri::Error::JoinError(join_err) = err {
                if join_err.is_panic() {
                    tracing::error!(label, "blocking task panicked");
                    return Err(format!("TASK_JOIN: {label}: task panicked"));
                }

                tracing::warn!(label, "blocking task cancelled");
                return Err(format!("TASK_JOIN: {label}: task cancelled"));
            }

            tracing::error!(label, "blocking task failed");
            Err(format!("TASK_JOIN: {label}: task failed"))
        }
    }
}
