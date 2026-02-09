//! Usage: Shared command-layer input normalization helpers.

pub(crate) fn normalize_limit(
    limit: Option<u32>,
    default_value: u32,
    min_value: u32,
    max_value: u32,
) -> usize {
    limit.unwrap_or(default_value).clamp(min_value, max_value) as usize
}

#[cfg(test)]
mod tests {
    use super::normalize_limit;

    #[test]
    fn normalize_limit_uses_default_when_none() {
        assert_eq!(normalize_limit(None, 50, 1, 500), 50);
    }

    #[test]
    fn normalize_limit_clamps_to_min() {
        assert_eq!(normalize_limit(Some(0), 50, 1, 500), 1);
    }

    #[test]
    fn normalize_limit_clamps_to_max() {
        assert_eq!(normalize_limit(Some(999), 50, 1, 500), 500);
    }

    #[test]
    fn normalize_limit_keeps_in_range_value() {
        assert_eq!(normalize_limit(Some(123), 50, 1, 500), 123);
    }
}
