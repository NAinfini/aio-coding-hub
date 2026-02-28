use sha2::{Digest, Sha256};

pub(super) struct ClaudeMetadataUserIdInjectionSkip {
    pub(super) reason: &'static str,
    pub(super) error: Option<String>,
}

pub(super) enum ClaudeMetadataUserIdInjectionOutcome {
    Injected { body_bytes: Vec<u8> },
    Skipped(ClaudeMetadataUserIdInjectionSkip),
}

pub(super) fn inject_from_json_bytes(
    provider_id: i64,
    session_id: Option<&str>,
    body_bytes: &[u8],
) -> ClaudeMetadataUserIdInjectionOutcome {
    let Some(session_id) = session_id.map(str::trim).filter(|v| !v.is_empty()) else {
        return ClaudeMetadataUserIdInjectionOutcome::Skipped(ClaudeMetadataUserIdInjectionSkip {
            reason: "missing_session_id",
            error: None,
        });
    };

    let mut root = match serde_json::from_slice::<serde_json::Value>(body_bytes) {
        Ok(root) => root,
        Err(err) => {
            return ClaudeMetadataUserIdInjectionOutcome::Skipped(
                ClaudeMetadataUserIdInjectionSkip {
                    reason: "missing_body_json",
                    error: Some(err.to_string()),
                },
            );
        }
    };

    let Some(root_obj) = root.as_object_mut() else {
        return ClaudeMetadataUserIdInjectionOutcome::Skipped(ClaudeMetadataUserIdInjectionSkip {
            reason: "body_json_not_object",
            error: None,
        });
    };

    let user_id_exists = root_obj
        .get("metadata")
        .and_then(|v| v.as_object())
        .and_then(|v| v.get("user_id"))
        .is_some_and(|v| !v.is_null());
    if user_id_exists {
        return ClaudeMetadataUserIdInjectionOutcome::Skipped(ClaudeMetadataUserIdInjectionSkip {
            reason: "already_exists",
            error: None,
        });
    }

    let stable_hash = stable_hash_for_key(provider_id);
    let user_id = format!("user_{stable_hash}_account__session_{session_id}");

    let metadata = root_obj
        .entry("metadata")
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    if !metadata.is_object() {
        *metadata = serde_json::Value::Object(serde_json::Map::new());
    }
    let meta_obj = metadata
        .as_object_mut()
        .expect("metadata must be an object");
    meta_obj.insert(
        "user_id".to_string(),
        serde_json::Value::String(user_id.clone()),
    );

    match serde_json::to_vec(&root) {
        Ok(body_bytes) => ClaudeMetadataUserIdInjectionOutcome::Injected { body_bytes },
        Err(err) => {
            ClaudeMetadataUserIdInjectionOutcome::Skipped(ClaudeMetadataUserIdInjectionSkip {
                reason: "serialize_failed",
                error: Some(err.to_string()),
            })
        }
    }
}

fn stable_hash_for_key(provider_id: i64) -> String {
    let seed = format!("claude_user_{provider_id}");
    let digest = Sha256::digest(seed.as_bytes());
    format!("{digest:x}")
}

#[cfg(test)]
mod tests {
    use super::{inject_from_json_bytes, ClaudeMetadataUserIdInjectionOutcome};
    use sha2::{Digest, Sha256};

    fn expected_hash(provider_id: i64) -> String {
        let seed = format!("claude_user_{provider_id}");
        let digest = Sha256::digest(seed.as_bytes());
        format!("{digest:x}")
    }

    #[test]
    fn injects_user_id_when_missing() {
        let body = serde_json::json!({
            "model": "claude-3-5-sonnet",
            "messages": [],
        });
        let provider_id = 123;
        let session_id = "sess-1";
        let encoded = serde_json::to_vec(&body).expect("serialize");

        let outcome = inject_from_json_bytes(provider_id, Some(session_id), encoded.as_slice());

        let ClaudeMetadataUserIdInjectionOutcome::Injected { body_bytes } = outcome else {
            panic!("expected injected outcome");
        };

        let next: serde_json::Value =
            serde_json::from_slice(&body_bytes).expect("injected body should be json");
        let user_id = next
            .get("metadata")
            .and_then(|v| v.get("user_id"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let stable_hash = expected_hash(provider_id);
        assert_eq!(
            user_id,
            format!("user_{stable_hash}_account__session_{session_id}")
        );
    }

    #[test]
    fn skips_when_user_id_already_exists() {
        let body = serde_json::json!({
            "model": "claude-3-5-sonnet",
            "messages": [],
            "metadata": {
                "user_id": "existing"
            }
        });
        let encoded = serde_json::to_vec(&body).expect("serialize");

        let outcome = inject_from_json_bytes(1, Some("sess-1"), encoded.as_slice());

        let ClaudeMetadataUserIdInjectionOutcome::Skipped(skip) = outcome else {
            panic!("expected skipped outcome");
        };
        assert_eq!(skip.reason, "already_exists");
    }

    #[test]
    fn skips_when_session_id_missing() {
        let body = serde_json::json!({
            "messages": [],
        });
        let encoded = serde_json::to_vec(&body).expect("serialize");

        let outcome = inject_from_json_bytes(1, None, encoded.as_slice());
        let ClaudeMetadataUserIdInjectionOutcome::Skipped(skip) = outcome else {
            panic!("expected skipped outcome");
        };
        assert_eq!(skip.reason, "missing_session_id");
    }

    #[test]
    fn skips_when_body_is_not_json() {
        let outcome = inject_from_json_bytes(1, Some("sess-1"), b"not-json");
        let ClaudeMetadataUserIdInjectionOutcome::Skipped(skip) = outcome else {
            panic!("expected skipped outcome");
        };
        assert_eq!(skip.reason, "missing_body_json");
        assert!(skip.error.is_some());
    }
}
