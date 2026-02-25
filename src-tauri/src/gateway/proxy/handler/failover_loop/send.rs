//! Usage: Upstream request sending helpers (first-byte timeout aware).

use super::context::CommonCtx;
use axum::body::Bytes;
use axum::http::{HeaderMap, Method};
use std::time::Duration;

pub(super) enum SendResult {
    Ok(reqwest::Response),
    Err(reqwest::Error),
    Timeout,
}

const BOOTSTRAP_RETRY_DELAY_MS: u64 = 500;

fn should_retry_bootstrap_error(err: &reqwest::Error) -> bool {
    err.is_connect() || err.is_timeout()
}

async fn send_once(
    ctx: CommonCtx<'_>,
    method: Method,
    url: reqwest::Url,
    headers: HeaderMap,
    body: Bytes,
) -> SendResult {
    let send = ctx
        .state
        .client
        .request(method, url)
        .headers(headers)
        .body(body)
        .send();

    if let Some(timeout) = ctx.upstream_first_byte_timeout {
        match tokio::time::timeout(timeout, send).await {
            Ok(Ok(resp)) => SendResult::Ok(resp),
            Ok(Err(err)) => SendResult::Err(err),
            Err(_) => SendResult::Timeout,
        }
    } else {
        match send.await {
            Ok(resp) => SendResult::Ok(resp),
            Err(err) => SendResult::Err(err),
        }
    }
}

pub(super) async fn send_upstream(
    ctx: CommonCtx<'_>,
    method: Method,
    url: reqwest::Url,
    headers: HeaderMap,
    body: Bytes,
) -> SendResult {
    let total_attempts = ctx.upstream_bootstrap_retries.saturating_add(1).max(1);
    for attempt in 1..=total_attempts {
        let result = send_once(
            ctx,
            method.clone(),
            url.clone(),
            headers.clone(),
            body.clone(),
        )
        .await;

        match result {
            SendResult::Ok(resp) => return SendResult::Ok(resp),
            SendResult::Err(err) => {
                if attempt < total_attempts && should_retry_bootstrap_error(&err) {
                    tracing::warn!(
                        trace_id = %ctx.trace_id,
                        cli_key = %ctx.cli_key,
                        attempt = attempt,
                        total_attempts = total_attempts,
                        "bootstrap upstream send failed before first byte; retrying: {}",
                        err
                    );
                    tokio::time::sleep(Duration::from_millis(BOOTSTRAP_RETRY_DELAY_MS)).await;
                    continue;
                }
                return SendResult::Err(err);
            }
            SendResult::Timeout => {
                if attempt < total_attempts {
                    tracing::warn!(
                        trace_id = %ctx.trace_id,
                        cli_key = %ctx.cli_key,
                        attempt = attempt,
                        total_attempts = total_attempts,
                        "bootstrap upstream first-byte timeout; retrying"
                    );
                    tokio::time::sleep(Duration::from_millis(BOOTSTRAP_RETRY_DELAY_MS)).await;
                    continue;
                }
                return SendResult::Timeout;
            }
        }
    }

    SendResult::Timeout
}
