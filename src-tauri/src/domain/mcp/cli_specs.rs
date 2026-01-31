//! Usage: Supported CLI keys for MCP sync flows.

pub(super) const MCP_CLI_KEYS: [&str; 3] = crate::shared::cli_key::SUPPORTED_CLI_KEYS;

pub(super) fn validate_cli_key(cli_key: &str) -> Result<(), String> {
    crate::shared::cli_key::validate_cli_key(cli_key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn mcp_cli_keys_cover_all_supported_cli_keys() {
        let spec_keys: HashSet<&'static str> = MCP_CLI_KEYS.into_iter().collect();
        for cli_key in crate::shared::cli_key::SUPPORTED_CLI_KEYS {
            assert!(spec_keys.contains(cli_key));
        }
    }

    #[test]
    fn mcp_cli_keys_are_unique() {
        let mut keys = HashSet::new();
        for key in MCP_CLI_KEYS {
            assert!(keys.insert(key));
        }
    }
}
