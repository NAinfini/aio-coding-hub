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

pub(crate) fn parse_custom_listen_address(input: &str) -> Result<ParsedListenAddress, String> {
    let raw = input.trim();
    if raw.is_empty() {
        return Ok(ParsedListenAddress {
            host: "0.0.0.0".to_string(),
            port: None,
        });
    }
    if raw.contains("://") || raw.contains('/') {
        return Err("custom listen address must be host or host:port".to_string());
    }

    if let Some(rest) = raw.strip_prefix('[') {
        let idx = rest
            .find(']')
            .ok_or_else(|| "invalid IPv6 address: missing closing ']'".to_string())?;
        let host = rest[..idx].trim();
        if host.is_empty() {
            return Err("custom listen address missing host".to_string());
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
            .ok_or_else(|| "custom listen address must be [ipv6]:port".to_string())?
            .trim();
        let port: u16 = port_raw
            .parse()
            .map_err(|_| "invalid custom listen port".to_string())?;
        if port < 1024 {
            return Err("custom listen port must be >= 1024".to_string());
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
            return Err("custom listen address missing host".to_string());
        }
        let port_raw = parts[1].trim();
        let port: u16 = port_raw
            .parse()
            .map_err(|_| "invalid custom listen port".to_string())?;
        if port < 1024 {
            return Err("custom listen port must be >= 1024".to_string());
        }
        return Ok(ParsedListenAddress {
            host: host.to_string(),
            port: Some(port),
        });
    }

    Err("IPv6 must use [addr]:port".to_string())
}
