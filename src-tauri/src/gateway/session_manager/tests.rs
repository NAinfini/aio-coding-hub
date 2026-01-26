use super::*;

#[test]
fn clear_cli_bindings_removes_only_target_cli() {
    let manager = SessionManager::new();
    let now_unix = 100;

    manager.bind_sort_mode(
        "claude",
        "session_a",
        Some(1),
        Some(vec![101, 102]),
        now_unix,
    );
    manager.bind_sort_mode("claude", "session_b", None, None, now_unix);
    manager.bind_sort_mode("codex", "session_c", Some(2), Some(vec![201]), now_unix);

    assert_eq!(manager.clear_cli_bindings(""), 0);

    let removed = manager.clear_cli_bindings("claude");
    assert_eq!(removed, 2);

    assert_eq!(
        manager.get_bound_sort_mode_id("claude", "session_a", now_unix),
        None
    );
    assert_eq!(
        manager.get_bound_sort_mode_id("claude", "session_b", now_unix),
        None
    );
    assert_eq!(
        manager.get_bound_sort_mode_id("codex", "session_c", now_unix),
        Some(Some(2))
    );
}
