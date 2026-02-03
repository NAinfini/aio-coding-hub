#[derive(Debug, Clone)]
pub(crate) struct ParsedListenAddress {
    pub(crate) host: String,
    pub(crate) port: Option<u16>,
}

pub(crate) fn is_wildcard_host(host: &str) -> bool {
    matches!(host.trim(), "0.0.0.0" | "::")
}

pub(crate) fn format_host_port(host: &str, port: u16) -> String {
    if host.contains(':') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

pub(crate) fn parse_custom_listen_address(
    input: &str,
) -> crate::shared::error::AppResult<ParsedListenAddress> {
    let raw = input.trim();
    if raw.is_empty() {
        return Ok(ParsedListenAddress {
            host: "0.0.0.0".to_string(),
            port: None,
        });
    }
    if raw.contains("://") || raw.contains('/') {
        return Err(
            "SEC_INVALID_INPUT: custom listen address must be host or host:port"
                .to_string()
                .into(),
        );
    }

    if let Some(rest) = raw.strip_prefix('[') {
        let idx = rest.find(']').ok_or_else(|| {
            "SEC_INVALID_INPUT: invalid IPv6 address: missing closing ']'".to_string()
        })?;
        let host = rest[..idx].trim();
        if host.is_empty() {
            return Err("SEC_INVALID_INPUT: custom listen address missing host"
                .to_string()
                .into());
        }
        let tail = rest[idx + 1..].trim();
        if tail.is_empty() {
            return Ok(ParsedListenAddress {
                host: host.to_string(),
                port: None,
            });
        }
        let port_raw = tail
            .strip_prefix(':')
            .ok_or_else(|| {
                "SEC_INVALID_INPUT: custom listen address must be [ipv6]:port".to_string()
            })?
            .trim();
        let port: u16 = port_raw
            .parse()
            .map_err(|_| "SEC_INVALID_INPUT: invalid custom listen port".to_string())?;
        if port < 1024 {
            return Err("SEC_INVALID_INPUT: custom listen port must be >= 1024"
                .to_string()
                .into());
        }
        return Ok(ParsedListenAddress {
            host: host.to_string(),
            port: Some(port),
        });
    }

    let parts: Vec<&str> = raw.split(':').collect();
    if parts.len() == 1 {
        return Ok(ParsedListenAddress {
            host: raw.to_string(),
            port: None,
        });
    }
    if parts.len() == 2 {
        let host = parts[0].trim();
        if host.is_empty() {
            return Err("SEC_INVALID_INPUT: custom listen address missing host"
                .to_string()
                .into());
        }
        let port_raw = parts[1].trim();
        let port: u16 = port_raw
            .parse()
            .map_err(|_| "SEC_INVALID_INPUT: invalid custom listen port".to_string())?;
        if port < 1024 {
            return Err("SEC_INVALID_INPUT: custom listen port must be >= 1024"
                .to_string()
                .into());
        }
        return Ok(ParsedListenAddress {
            host: host.to_string(),
            port: Some(port),
        });
    }

    Err("SEC_INVALID_INPUT: IPv6 must use [addr]:port"
        .to_string()
        .into())
}
