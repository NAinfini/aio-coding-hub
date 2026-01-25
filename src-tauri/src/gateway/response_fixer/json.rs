use axum::body::Bytes;

use super::encoding::FixBytesOutcome;

pub(super) struct JsonFixer {
    max_depth: usize,
    max_size: usize,
}

impl JsonFixer {
    pub(super) fn new(max_depth: usize, max_size: usize) -> Self {
        Self {
            max_depth,
            max_size,
        }
    }

    fn is_whitespace(byte: u8) -> bool {
        byte == b' ' || byte == b'\t' || byte == b'\n' || byte == b'\r'
    }

    fn looks_like_json(data: &[u8]) -> bool {
        for b in data {
            if Self::is_whitespace(*b) {
                continue;
            }
            return *b == b'{' || *b == b'[';
        }
        false
    }

    fn remove_trailing_comma(out: &mut Vec<u8>) {
        let mut idx = out.len();
        while idx > 0 && Self::is_whitespace(out[idx - 1]) {
            idx -= 1;
        }
        if idx > 0 && out[idx - 1] == b',' {
            out.truncate(idx - 1);
        }
    }

    fn needs_null_value(out: &[u8], stack: &[u8]) -> bool {
        if stack.last().copied() != Some(b'}') {
            return false;
        }
        let mut idx = out.len();
        while idx > 0 && Self::is_whitespace(out[idx - 1]) {
            idx -= 1;
        }
        idx > 0 && out[idx - 1] == b':'
    }

    fn can_fix(&self, data: &[u8]) -> bool {
        Self::looks_like_json(data)
    }

    pub(super) fn fix_bytes(&self, input: Bytes) -> FixBytesOutcome {
        match self.fix_slice(input.as_ref()) {
            FixSliceOutcome::Unchanged => FixBytesOutcome {
                data: input,
                applied: false,
                details: None,
            },
            FixSliceOutcome::Applied(bytes) => FixBytesOutcome {
                data: Bytes::from(bytes),
                applied: true,
                details: None,
            },
            FixSliceOutcome::Skipped(details) => FixBytesOutcome {
                data: input,
                applied: false,
                details: Some(details),
            },
        }
    }

    fn repair(&self, data: &[u8]) -> Option<Vec<u8>> {
        let mut out: Vec<u8> = Vec::with_capacity(data.len().saturating_add(8));
        let mut stack: Vec<u8> = Vec::new();

        let mut in_string = false;
        let mut escape_next = false;
        let mut depth = 0usize;

        for &byte in data {
            if escape_next {
                escape_next = false;
                out.push(byte);
                continue;
            }

            if in_string && byte == b'\\' {
                escape_next = true;
                out.push(byte);
                continue;
            }

            if byte == b'"' {
                in_string = !in_string;
                out.push(byte);
                continue;
            }

            if !in_string {
                match byte {
                    b'{' => {
                        depth += 1;
                        if depth > self.max_depth {
                            return None;
                        }
                        stack.push(b'}');
                        out.push(byte);
                        continue;
                    }
                    b'[' => {
                        depth += 1;
                        if depth > self.max_depth {
                            return None;
                        }
                        stack.push(b']');
                        out.push(byte);
                        continue;
                    }
                    b'}' | b']' => {
                        Self::remove_trailing_comma(&mut out);
                        if stack.last().copied() == Some(byte) {
                            stack.pop();
                            depth = depth.saturating_sub(1);
                            out.push(byte);
                        }
                        continue;
                    }
                    _ => {}
                }
            }

            out.push(byte);
        }

        // 末尾不完整的转义序列：去掉最后一个反斜杠
        if escape_next {
            out.pop();
        }

        // 闭合未关闭的字符串
        if in_string {
            out.push(b'"');
        }

        Self::remove_trailing_comma(&mut out);

        // 对象末尾冒号无值：补 null
        if Self::needs_null_value(&out, &stack) {
            out.extend_from_slice(b"null");
        }

        while let Some(close) = stack.pop() {
            Self::remove_trailing_comma(&mut out);
            out.push(close);
        }

        Some(out)
    }
}

enum FixSliceOutcome {
    Unchanged,
    Applied(Vec<u8>),
    Skipped(&'static str),
}

impl JsonFixer {
    fn fix_slice(&self, input: &[u8]) -> FixSliceOutcome {
        if input.len() > self.max_size {
            return FixSliceOutcome::Skipped("exceeded_max_size");
        }

        if !self.can_fix(input) {
            return FixSliceOutcome::Unchanged;
        }

        if serde_json::from_slice::<serde_json::Value>(input).is_ok() {
            return FixSliceOutcome::Unchanged;
        }

        let repaired = match self.repair(input) {
            Some(v) => v,
            None => return FixSliceOutcome::Skipped("repair_failed"),
        };

        if serde_json::from_slice::<serde_json::Value>(&repaired).is_ok() {
            return FixSliceOutcome::Applied(repaired);
        }

        FixSliceOutcome::Skipped("validate_repaired_failed")
    }
}

pub(super) fn fix_sse_json_lines(input: Bytes, json_fixer: &JsonFixer) -> FixBytesOutcome {
    const LF: u8 = b'\n';

    let bytes = input.as_ref();
    let mut out: Vec<u8> = Vec::new();
    let mut changed = false;

    let mut cursor = 0usize;
    let mut line_start = 0usize;

    for (i, b) in bytes.iter().enumerate() {
        if *b != LF {
            continue;
        }
        let line = &bytes[line_start..i];
        if let Some(fixed_line) = fix_maybe_data_json_line(line, json_fixer) {
            changed = true;
            if cursor < line_start {
                out.extend_from_slice(&bytes[cursor..line_start]);
            }
            out.extend_from_slice(&fixed_line);
            out.push(LF);
            cursor = i + 1;
        } else if changed {
            out.extend_from_slice(&bytes[cursor..(i + 1)]);
            cursor = i + 1;
        }
        line_start = i + 1;
    }

    if line_start < bytes.len() {
        let line = &bytes[line_start..];
        if let Some(fixed_line) = fix_maybe_data_json_line(line, json_fixer) {
            changed = true;
            if cursor < line_start {
                out.extend_from_slice(&bytes[cursor..line_start]);
            }
            out.extend_from_slice(&fixed_line);
        } else if changed {
            out.extend_from_slice(&bytes[cursor..]);
        }
    } else if changed && cursor < bytes.len() {
        out.extend_from_slice(&bytes[cursor..]);
    }

    if !changed {
        return FixBytesOutcome {
            data: input,
            applied: false,
            details: None,
        };
    }

    FixBytesOutcome {
        data: Bytes::from(out),
        applied: true,
        details: None,
    }
}

fn fix_maybe_data_json_line(line: &[u8], json_fixer: &JsonFixer) -> Option<Vec<u8>> {
    const DATA_PREFIX: &[u8] = b"data:";

    if line.len() < DATA_PREFIX.len() {
        return None;
    }
    if !line.starts_with(DATA_PREFIX) {
        return None;
    }

    let mut payload_start = DATA_PREFIX.len();
    if payload_start < line.len() && line[payload_start] == b' ' {
        payload_start += 1;
    }

    let payload = &line[payload_start..];
    let fixed_payload = match json_fixer.fix_slice(payload) {
        FixSliceOutcome::Applied(v) => v,
        _ => return None,
    };

    let mut out = Vec::with_capacity(6 + fixed_payload.len());
    out.extend_from_slice(b"data: ");
    out.extend_from_slice(&fixed_payload);
    Some(out)
}
