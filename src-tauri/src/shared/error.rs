//! Usage: Unified application error model (maps internal failures to `CODE: message` strings).

use std::sync::Arc;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, thiserror::Error)]
#[error("{code}: {message}")]
pub struct AppError {
    code: String,
    message: String,
    #[source]
    source: Option<Arc<dyn std::error::Error + Send + Sync>>,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            source: None,
        }
    }
}

fn split_code_message(raw: &str) -> Option<(&str, &str)> {
    let msg = raw.trim();
    let msg = msg.strip_prefix("Error:").unwrap_or(msg).trim();
    if msg.is_empty() {
        return None;
    }

    let (maybe_code, rest) = msg.split_once(':')?;
    let code = maybe_code.trim();
    if code.is_empty() {
        return None;
    }
    let mut chars = code.chars();
    let first = chars.next()?;
    if !first.is_ascii_uppercase() {
        return None;
    }
    if !chars.all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_') {
        return None;
    }
    Some((code, rest.trim()))
}

impl From<String> for AppError {
    fn from(value: String) -> Self {
        if let Some((code, rest)) = split_code_message(&value) {
            let message = if rest.is_empty() { value.trim() } else { rest };
            return AppError::new(code.to_string(), message.to_string());
        }
        AppError::new("INTERNAL_ERROR", value)
    }
}

impl From<&'static str> for AppError {
    fn from(value: &'static str) -> Self {
        AppError::from(value.to_string())
    }
}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}
