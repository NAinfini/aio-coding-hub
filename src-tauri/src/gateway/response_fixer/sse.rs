use axum::body::Bytes;

use super::encoding::FixBytesOutcome;

pub(super) struct SseFixer;

impl SseFixer {
    fn is_ascii_whitespace(byte: u8) -> bool {
        byte == b' ' || byte == b'\t' || byte == b'\n' || byte == b'\r'
    }

    fn to_lower_ascii(byte: u8) -> u8 {
        byte.to_ascii_lowercase()
    }

    fn starts_with_bytes(data: &[u8], prefix: &[u8]) -> bool {
        data.len() >= prefix.len() && data[..prefix.len()] == *prefix
    }

    fn includes_data_colon(data: &[u8]) -> bool {
        const DATA_COLON: &[u8] = b"data:";
        if data.len() < DATA_COLON.len() {
            return false;
        }
        data.windows(DATA_COLON.len()).any(|w| w == DATA_COLON)
    }

    fn looks_like_json_line(line: &[u8]) -> bool {
        let mut i = 0usize;
        while i < line.len() && Self::is_ascii_whitespace(line[i]) {
            i += 1;
        }
        if i >= line.len() {
            return false;
        }

        match line[i] {
            b'{' | b'[' => return true,
            _ => {}
        }

        // [DONE]
        const DONE: &[u8] = b"[DONE]";
        line[i..].starts_with(DONE)
    }

    fn can_fix(data: &[u8]) -> bool {
        if Self::starts_with_bytes(data, b"data:")
            || Self::starts_with_bytes(data, b"event:")
            || Self::starts_with_bytes(data, b"id:")
            || Self::starts_with_bytes(data, b"retry:")
            || Self::starts_with_bytes(data, b":")
        {
            return true;
        }

        // data: 字段常见畸形写法（Data:/DATA:/data : ...）
        if data.len() >= 4 {
            let lower = [
                Self::to_lower_ascii(data[0]),
                Self::to_lower_ascii(data[1]),
                Self::to_lower_ascii(data[2]),
                Self::to_lower_ascii(data[3]),
            ];
            if lower == *b"data" {
                return true;
            }
        }

        if Self::looks_like_json_line(data) {
            return true;
        }

        Self::includes_data_colon(data)
    }

    fn fix_field_space(prefix: &[u8], line: &[u8]) -> Option<Vec<u8>> {
        if !Self::starts_with_bytes(line, prefix) {
            return None;
        }
        let after = &line[prefix.len()..];
        if !after.is_empty() && after[0] == b' ' {
            return None;
        }
        let mut out = Vec::with_capacity(prefix.len() + 1 + after.len());
        out.extend_from_slice(prefix);
        out.push(b' ');
        out.extend_from_slice(after);
        Some(out)
    }

    fn try_fix_malformed(line: &[u8]) -> Option<Vec<u8>> {
        // 模式 1: "data :xxx"（data 与冒号之间只有空白）
        if Self::starts_with_bytes(line, b"data") {
            let rest = &line[4..];
            let colon_pos = rest.iter().position(|b| *b == b':');
            if let Some(colon_idx) = colon_pos {
                if rest[..colon_idx]
                    .iter()
                    .all(|b| Self::is_ascii_whitespace(*b))
                {
                    let after_colon = &rest[(colon_idx + 1)..];
                    let mut j = 0usize;
                    while j < after_colon.len() && after_colon[j] == b' ' {
                        j += 1;
                    }
                    let trimmed = &after_colon[j..];
                    let mut out = Vec::with_capacity(6 + trimmed.len());
                    out.extend_from_slice(b"data: ");
                    out.extend_from_slice(trimmed);
                    return Some(out);
                }
            }
        }

        // 模式 2: Data:/DATA: 等大小写错误
        if line.len() >= 5 {
            let lower = [
                Self::to_lower_ascii(line[0]),
                Self::to_lower_ascii(line[1]),
                Self::to_lower_ascii(line[2]),
                Self::to_lower_ascii(line[3]),
                Self::to_lower_ascii(line[4]),
            ];
            if lower == *b"data:" {
                let mut normalized = Vec::with_capacity(line.len());
                normalized.extend_from_slice(b"data:");
                normalized.extend_from_slice(&line[5..]);
                if let Some(fixed) = Self::fix_field_space(b"data:", &normalized) {
                    return Some(fixed);
                }
                return Some(normalized);
            }
        }

        None
    }

    fn fix_line(line: &[u8]) -> Option<Vec<u8>> {
        // 先匹配“合法字段行”，避免把正常的 data/event/id/retry 行误判为 malformed。
        if Self::starts_with_bytes(line, b"data:") {
            return Self::fix_field_space(b"data:", line);
        }
        if Self::starts_with_bytes(line, b"event:") {
            return Self::fix_field_space(b"event:", line);
        }
        if Self::starts_with_bytes(line, b"id:") {
            return Self::fix_field_space(b"id:", line);
        }
        if Self::starts_with_bytes(line, b"retry:") {
            return Self::fix_field_space(b"retry:", line);
        }
        if Self::starts_with_bytes(line, b":") {
            return None;
        }

        if let Some(fixed) = Self::try_fix_malformed(line) {
            return Some(fixed);
        }

        if Self::looks_like_json_line(line) {
            let trimmed = line
                .iter()
                .skip_while(|b| Self::is_ascii_whitespace(**b))
                .copied()
                .collect::<Vec<u8>>();
            let mut out = Vec::with_capacity(6 + trimmed.len());
            out.extend_from_slice(b"data: ");
            out.extend_from_slice(&trimmed);
            return Some(out);
        }

        // 兜底：如果包含 data:，尝试修复 data: 后的空格问题
        if let Some(pos) = line.windows(5).position(|w| w == b"data:") {
            let prefix = &line[..(pos + 5)];
            let after = &line[(pos + 5)..];
            if after.first() == Some(&b' ') {
                return None;
            }
            let mut out = Vec::with_capacity(prefix.len() + 1 + after.len());
            out.extend_from_slice(prefix);
            out.push(b' ');
            out.extend_from_slice(after);
            return Some(out);
        }

        None
    }

    fn scan_line(bytes: &[u8], start: usize) -> (usize, usize, bool) {
        let mut scan = start;
        let mut line_end = bytes.len();
        let mut next_pos = bytes.len();
        let mut newline_normalized = false;

        while scan < bytes.len() {
            match bytes[scan] {
                b'\n' => {
                    line_end = scan;
                    next_pos = scan + 1;
                    break;
                }
                b'\r' => {
                    line_end = scan;
                    next_pos = scan + 1;
                    if next_pos < bytes.len() && bytes[next_pos] == b'\n' {
                        next_pos += 1;
                    }
                    newline_normalized = true;
                    break;
                }
                _ => scan += 1,
            }
        }

        // 末尾无换行：补一个 LF
        if next_pos == bytes.len() && line_end == bytes.len() {
            newline_normalized = true;
        }

        (line_end, next_pos, newline_normalized)
    }

    fn start_output<'a>(
        out: &'a mut Option<Vec<u8>>,
        bytes: &[u8],
        cursor: &mut usize,
        start: usize,
    ) -> &'a mut Vec<u8> {
        if out.is_none() {
            let mut v = Vec::new();
            if start > 0 {
                v.extend_from_slice(&bytes[..start]);
            }
            *cursor = start;
            *out = Some(v);
        } else if *cursor < start {
            if let Some(out_vec) = out.as_mut() {
                out_vec.extend_from_slice(&bytes[*cursor..start]);
            }
            *cursor = start;
        }

        out.as_mut().expect("out initialized")
    }

    fn copy_through(out: &mut Option<Vec<u8>>, bytes: &[u8], cursor: &mut usize, end: usize) {
        if let Some(out_vec) = out.as_mut() {
            if *cursor < end {
                out_vec.extend_from_slice(&bytes[*cursor..end]);
            }
        }
        *cursor = end;
    }

    fn handle_empty_line(
        out: &mut Option<Vec<u8>>,
        bytes: &[u8],
        cursor: &mut usize,
        start: usize,
        end: usize,
        newline_normalized: bool,
        last_was_empty: &mut bool,
    ) -> bool {
        if *last_was_empty {
            Self::start_output(out, bytes, cursor, start);
            *cursor = end;
            return true;
        }

        *last_was_empty = true;

        if newline_normalized {
            let out_vec = Self::start_output(out, bytes, cursor, start);
            out_vec.push(b'\n');
            *cursor = end;
            return true;
        }

        Self::copy_through(out, bytes, cursor, end);
        false
    }

    pub(super) fn fix_bytes(input: Bytes) -> FixBytesOutcome {
        if !Self::can_fix(input.as_ref()) {
            return FixBytesOutcome {
                data: input,
                applied: false,
                details: None,
            };
        }

        let bytes = input.as_ref();
        let mut out: Option<Vec<u8>> = None;
        let mut cursor = 0usize;
        let mut changed = false;
        let mut last_was_empty = false;

        let mut pos = 0usize;
        while pos < bytes.len() {
            let start = pos;
            let (line_end, next_pos, newline_normalized) = Self::scan_line(bytes, start);
            pos = next_pos;
            let line = &bytes[start..line_end];

            if line.is_empty() {
                if Self::handle_empty_line(
                    &mut out,
                    bytes,
                    &mut cursor,
                    start,
                    pos,
                    newline_normalized,
                    &mut last_was_empty,
                ) {
                    changed = true;
                }
                continue;
            }
            last_was_empty = false;

            let fixed = Self::fix_line(line);
            let segment_changed = fixed.is_some() || newline_normalized;
            if segment_changed {
                changed = true;
                let out_vec = Self::start_output(&mut out, bytes, &mut cursor, start);
                if let Some(fixed_line) = fixed {
                    out_vec.extend_from_slice(&fixed_line);
                } else {
                    out_vec.extend_from_slice(line);
                }
                out_vec.push(b'\n');
                cursor = pos;
                continue;
            }

            Self::copy_through(&mut out, bytes, &mut cursor, pos);
        }

        let Some(mut out_vec) = out else {
            return FixBytesOutcome {
                data: input,
                applied: false,
                details: None,
            };
        };

        if cursor < bytes.len() {
            out_vec.extend_from_slice(&bytes[cursor..]);
        }

        FixBytesOutcome {
            data: Bytes::from(out_vec),
            applied: changed,
            details: None,
        }
    }
}
