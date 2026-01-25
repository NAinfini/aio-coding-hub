use axum::body::Bytes;

#[derive(Debug)]
pub(super) struct FixBytesOutcome {
    pub(super) data: Bytes,
    pub(super) applied: bool,
    pub(super) details: Option<&'static str>,
}

pub(super) struct EncodingFixer;

impl EncodingFixer {
    fn has_utf8_bom(data: &[u8]) -> bool {
        data.len() >= 3 && data[0] == 0xef && data[1] == 0xbb && data[2] == 0xbf
    }

    fn has_utf16_bom(data: &[u8]) -> bool {
        data.len() >= 2
            && ((data[0] == 0xfe && data[1] == 0xff) || (data[0] == 0xff && data[1] == 0xfe))
    }

    fn is_valid_utf8(data: &[u8]) -> bool {
        std::str::from_utf8(data).is_ok()
    }

    fn strip_null_bytes(data: &[u8]) -> Option<Vec<u8>> {
        let first_null = data.iter().position(|b| *b == 0)?;
        let null_count = data[first_null..].iter().filter(|b| **b == 0).count();
        let mut out = Vec::with_capacity(data.len().saturating_sub(null_count));
        out.extend_from_slice(&data[..first_null]);
        for b in &data[first_null..] {
            if *b != 0 {
                out.push(*b);
            }
        }
        Some(out)
    }

    fn can_fix(data: &[u8]) -> bool {
        if Self::has_utf8_bom(data) || Self::has_utf16_bom(data) {
            return true;
        }
        if data.contains(&0) {
            return true;
        }
        !Self::is_valid_utf8(data)
    }

    pub(super) fn fix_bytes(input: Bytes) -> FixBytesOutcome {
        if !Self::can_fix(input.as_ref()) {
            return FixBytesOutcome {
                data: input,
                applied: false,
                details: None,
            };
        }

        let mut details: Option<&'static str> = None;
        let mut changed_by_strip = false;

        // 先去 BOM（可零拷贝 slice）。
        let mut data = if Self::has_utf8_bom(input.as_ref()) {
            changed_by_strip = true;
            details = Some("removed_utf8_bom");
            input.slice(3..)
        } else if Self::has_utf16_bom(input.as_ref()) {
            changed_by_strip = true;
            details = Some("removed_utf16_bom");
            input.slice(2..)
        } else {
            input
        };

        // 去空字节（需要重建 buffer）。
        if let Some(stripped) = Self::strip_null_bytes(data.as_ref()) {
            changed_by_strip = true;
            if details.is_none() {
                details = Some("removed_null_bytes");
            }
            data = Bytes::from(stripped);
        }

        if Self::is_valid_utf8(data.as_ref()) {
            return FixBytesOutcome {
                data,
                applied: changed_by_strip,
                details,
            };
        }

        // 有损修复：用 replacement char 替换无效序列，再重新编码，保证输出一定是合法 UTF-8。
        let lossy = String::from_utf8_lossy(data.as_ref());
        FixBytesOutcome {
            data: Bytes::from(lossy.into_owned().into_bytes()),
            applied: true,
            details: Some("lossy_utf8_decode_encode"),
        }
    }
}
