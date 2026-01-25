mod audit;
mod encoding;
mod json;
mod sse;
mod stream;

use axum::body::Bytes;
use futures_core::Stream;
use serde_json::Value;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};

pub(super) const DEFAULT_MAX_JSON_DEPTH: usize = 200;
pub(super) const DEFAULT_MAX_FIX_SIZE: usize = 1024 * 1024;

#[derive(Debug, Clone, Copy)]
pub(super) struct ResponseFixerConfig {
    pub(super) fix_encoding: bool,
    pub(super) fix_sse_format: bool,
    pub(super) fix_truncated_json: bool,
    pub(super) max_json_depth: usize,
    pub(super) max_fix_size: usize,
}

#[derive(Debug)]
pub(super) struct NonStreamFixOutcome {
    pub(super) body: Bytes,
    pub(super) header_value: &'static str,
    pub(super) special_setting: Option<Value>,
}

pub(super) fn special_settings_json(shared: &Arc<Mutex<Vec<Value>>>) -> Option<String> {
    let guard = shared.lock().ok()?;
    if guard.is_empty() {
        return None;
    }
    Some(serde_json::to_string(&*guard).unwrap_or_else(|_| "[]".to_string()))
}

pub(super) fn process_non_stream(body: Bytes, config: ResponseFixerConfig) -> NonStreamFixOutcome {
    audit::process_non_stream(body, config)
}

pub(super) struct ResponseFixerStream<S>(stream::ResponseFixerStreamInner<S>)
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Unpin;

impl<S> ResponseFixerStream<S>
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Unpin,
{
    pub(super) fn new(
        upstream: S,
        config: ResponseFixerConfig,
        special_settings: Arc<Mutex<Vec<Value>>>,
    ) -> Self {
        Self(stream::ResponseFixerStreamInner::new(
            upstream,
            config,
            special_settings,
        ))
    }
}

impl<S> Stream for ResponseFixerStream<S>
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Unpin,
{
    type Item = Result<Bytes, reqwest::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.as_mut().get_mut();
        Pin::new(&mut this.0).poll_next(cx)
    }
}

#[cfg(test)]
mod tests;
