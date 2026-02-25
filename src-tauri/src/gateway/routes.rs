use axum::{
    extract::{Path, Request, State},
    http::{HeaderValue, StatusCode},
    response::IntoResponse,
    response::Response,
    routing::{any, get},
    Json, Router,
};
use serde::Serialize;

use super::manager::GatewayAppState;
use super::proxy::{proxy_impl, GatewayErrorCode};
use super::util::now_unix_seconds;

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
    app: &'static str,
    version: &'static str,
    ts: u64,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        app: "aio-coding-hub",
        version: env!("CARGO_PKG_VERSION"),
        ts: now_unix_seconds(),
    })
}

async fn root() -> &'static str {
    "AIO Coding Hub is running"
}

#[derive(Debug, Serialize)]
struct PathErrorResponse {
    error_code: &'static str,
    message: String,
}

fn invalid_forwarded_path_response(message: String) -> Response {
    let mut resp = (
        StatusCode::BAD_REQUEST,
        Json(PathErrorResponse {
            error_code: GatewayErrorCode::InvalidForwardedPath.as_str(),
            message,
        }),
    )
        .into_response();
    if let Ok(v) = HeaderValue::from_str(GatewayErrorCode::InvalidForwardedPath.as_str()) {
        resp.headers_mut().insert("x-aio-error-code", v);
    }
    resp
}

fn sanitize_forwarded_path(path: &str, prefix: Option<&str>) -> Result<String, String> {
    if path.contains('\0') {
        return Err("SEC_INVALID_INPUT: forwarded path contains null byte".to_string());
    }

    let mut segments: Vec<&str> = Vec::new();
    for segment in path.split('/') {
        if segment.is_empty() {
            continue;
        }
        if segment == ".." {
            return Err(
                "SEC_INVALID_INPUT: forwarded path contains path traversal segment '..'"
                    .to_string(),
            );
        }
        if segment.contains('\0') {
            return Err("SEC_INVALID_INPUT: forwarded path contains null byte".to_string());
        }
        segments.push(segment);
    }

    let mut merged: Vec<&str> = Vec::new();
    if let Some(prefix) = prefix {
        for segment in prefix.split('/').filter(|segment| !segment.is_empty()) {
            if segment == ".." {
                return Err(
                    "SEC_INVALID_INPUT: forwarded path prefix contains path traversal segment '..'"
                        .to_string(),
                );
            }
            if segment.contains('\0') {
                return Err(
                    "SEC_INVALID_INPUT: forwarded path prefix contains null byte".to_string(),
                );
            }
            merged.push(segment);
        }
    }
    merged.extend(segments);

    if merged.is_empty() {
        return Ok("/".to_string());
    }

    Ok(format!("/{}", merged.join("/")))
}

async fn proxy_cli_any(
    State(state): State<GatewayAppState>,
    Path((cli_key, path)): Path<(String, String)>,
    req: Request,
) -> Response {
    let forwarded_path = match sanitize_forwarded_path(path.as_str(), None) {
        Ok(path) => path,
        Err(err) => return invalid_forwarded_path_response(err),
    };
    proxy_impl(state, cli_key, forwarded_path, req).await
}

async fn proxy_cli_with_provider_any(
    State(state): State<GatewayAppState>,
    Path((cli_key, provider_id, path)): Path<(String, i64, String)>,
    mut req: Request,
) -> Response {
    if let Ok(value) = axum::http::HeaderValue::from_str(&provider_id.to_string()) {
        req.headers_mut().insert("x-aio-provider-id", value);
    }

    let forwarded_path = match sanitize_forwarded_path(path.as_str(), None) {
        Ok(path) => path,
        Err(err) => return invalid_forwarded_path_response(err),
    };

    proxy_impl(state, cli_key, forwarded_path, req).await
}

async fn proxy_openai_v1_any(
    State(state): State<GatewayAppState>,
    Path(path): Path<String>,
    req: Request,
) -> Response {
    let forwarded_path = match sanitize_forwarded_path(path.as_str(), Some("v1")) {
        Ok(path) => path,
        Err(err) => return invalid_forwarded_path_response(err),
    };
    proxy_impl(state, "codex".to_string(), forwarded_path, req).await
}

async fn proxy_openai_v1_root(State(state): State<GatewayAppState>, req: Request) -> Response {
    proxy_impl(state, "codex".to_string(), "/v1".to_string(), req).await
}

pub(super) fn build_router(state: GatewayAppState) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route(
            "/:cli_key/_aio/provider/:provider_id/*path",
            any(proxy_cli_with_provider_any),
        )
        .route("/v1", any(proxy_openai_v1_root))
        .route("/v1/*path", any(proxy_openai_v1_any))
        .route("/:cli_key/*path", any(proxy_cli_any))
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::sanitize_forwarded_path;

    #[test]
    fn sanitize_forwarded_path_normalizes_double_slashes() {
        let sanitized = sanitize_forwarded_path("v1//chat//completions", None).expect("sanitized");
        assert_eq!(sanitized, "/v1/chat/completions");
    }

    #[test]
    fn sanitize_forwarded_path_rejects_path_traversal_segment() {
        let err = sanitize_forwarded_path("../admin", None).expect_err("should fail");
        assert!(err.contains("path traversal"));
    }

    #[test]
    fn sanitize_forwarded_path_prefixes_v1_path() {
        let sanitized = sanitize_forwarded_path("responses", Some("v1")).expect("sanitized");
        assert_eq!(sanitized, "/v1/responses");
    }

    #[test]
    fn sanitize_forwarded_path_rejects_traversal_in_prefix() {
        let err = sanitize_forwarded_path("chat", Some("../admin")).expect_err("should fail");
        assert!(err.contains("prefix"));
        assert!(err.contains("path traversal"));
    }

    #[test]
    fn sanitize_forwarded_path_rejects_null_byte_in_prefix() {
        let err = sanitize_forwarded_path("chat", Some("v1\0")).expect_err("should fail");
        assert!(err.contains("prefix"));
        assert!(err.contains("null byte"));
    }
}
