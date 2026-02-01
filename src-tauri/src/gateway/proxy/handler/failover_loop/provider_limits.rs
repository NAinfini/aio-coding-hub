//! Usage: Provider spend-limit gating (5h/daily/weekly/monthly/total).

use super::context::CommonCtx;
use crate::providers;
use rusqlite::{params, Connection};

pub(super) struct ProviderLimitsInput<'a> {
    pub(super) ctx: CommonCtx<'a>,
    pub(super) provider: &'a providers::ProviderForGateway,
    pub(super) earliest_available_unix: &'a mut Option<i64>,
    pub(super) skipped_limits: &'a mut usize,
}

const USD_FEMTO_DENOM: f64 = 1_000_000_000_000_000.0;
const WINDOW_5H_SECS: i64 = 5 * 60 * 60;
const WINDOW_24H_SECS: i64 = 24 * 60 * 60;

fn update_earliest(earliest: &mut Option<i64>, candidate: i64) {
    if candidate <= 0 {
        return;
    }
    match earliest {
        Some(existing) if *existing <= candidate => {}
        _ => *earliest = Some(candidate),
    }
}

fn update_latest(latest: &mut Option<i64>, candidate: i64) {
    if candidate <= 0 {
        return;
    }
    match latest {
        Some(existing) if *existing >= candidate => {}
        _ => *latest = Some(candidate),
    }
}

fn limit_usd_to_femto(limit_usd: f64) -> Option<i128> {
    if !limit_usd.is_finite() || limit_usd < 0.0 {
        return None;
    }
    let limit_femto = (limit_usd * USD_FEMTO_DENOM).round();
    if !limit_femto.is_finite() {
        return None;
    }
    Some(limit_femto as i128)
}

fn limit_exceeded(limit_usd: f64, spent_femto: i64) -> bool {
    let Some(limit_femto) = limit_usd_to_femto(limit_usd) else {
        return false;
    };
    (spent_femto.max(0) as i128) >= limit_femto
}

fn has_any_limit(provider: &providers::ProviderForGateway) -> bool {
    provider.limit_5h_usd.is_some()
        || provider.limit_daily_usd.is_some()
        || provider.limit_weekly_usd.is_some()
        || provider.limit_monthly_usd.is_some()
        || provider.limit_total_usd.is_some()
}

#[derive(Debug, Clone, Copy, Default)]
struct SpendSums {
    spent_5h: i64,
    spent_daily_rolling: i64,
    spent_daily_fixed: i64,
    spent_weekly: i64,
    spent_monthly: i64,
    spent_total: i64,
}

fn min_start_ts(values: &[Option<i64>]) -> Option<i64> {
    values.iter().copied().flatten().min()
}

#[derive(Debug, Clone, Copy)]
struct SpendQueryBounds {
    start_5h: Option<i64>,
    start_daily_rolling: Option<i64>,
    start_daily_fixed: Option<i64>,
    start_weekly: Option<i64>,
    start_monthly: Option<i64>,
    end_ts: i64,
    min_start: Option<i64>,
}

fn sum_cost_usd_femto_windows(
    conn: &Connection,
    provider_id: i64,
    bounds: SpendQueryBounds,
) -> Result<SpendSums, String> {
    let SpendQueryBounds {
        start_5h,
        start_daily_rolling,
        start_daily_fixed,
        start_weekly,
        start_monthly,
        end_ts,
        min_start,
    } = bounds;

    conn.query_row(
        r#"
SELECT
  COALESCE(SUM(CASE WHEN created_at >= ?2 THEN CASE WHEN cost_usd_femto < 0 THEN 0 ELSE cost_usd_femto END ELSE 0 END), 0) AS spent_5h,
  COALESCE(SUM(CASE WHEN created_at >= ?3 THEN CASE WHEN cost_usd_femto < 0 THEN 0 ELSE cost_usd_femto END ELSE 0 END), 0) AS spent_daily_rolling,
  COALESCE(SUM(CASE WHEN created_at >= ?4 THEN CASE WHEN cost_usd_femto < 0 THEN 0 ELSE cost_usd_femto END ELSE 0 END), 0) AS spent_daily_fixed,
  COALESCE(SUM(CASE WHEN created_at >= ?5 THEN CASE WHEN cost_usd_femto < 0 THEN 0 ELSE cost_usd_femto END ELSE 0 END), 0) AS spent_weekly,
  COALESCE(SUM(CASE WHEN created_at >= ?6 THEN CASE WHEN cost_usd_femto < 0 THEN 0 ELSE cost_usd_femto END ELSE 0 END), 0) AS spent_monthly,
  COALESCE(SUM(CASE WHEN cost_usd_femto < 0 THEN 0 ELSE cost_usd_femto END), 0) AS spent_total
FROM request_logs
WHERE excluded_from_stats = 0
  AND status >= 200 AND status < 300 AND error_code IS NULL
  AND cost_usd_femto IS NOT NULL
  AND final_provider_id = ?1
  AND created_at < ?7
  AND (?8 IS NULL OR created_at >= ?8)
"#,
        params![
            provider_id,
            start_5h,
            start_daily_rolling,
            start_daily_fixed,
            start_weekly,
            start_monthly,
            end_ts,
            min_start
        ],
        |row| {
            Ok(SpendSums {
                spent_5h: row.get::<_, Option<i64>>("spent_5h")?.unwrap_or(0).max(0),
                spent_daily_rolling: row
                    .get::<_, Option<i64>>("spent_daily_rolling")?
                    .unwrap_or(0)
                    .max(0),
                spent_daily_fixed: row
                    .get::<_, Option<i64>>("spent_daily_fixed")?
                    .unwrap_or(0)
                    .max(0),
                spent_weekly: row
                    .get::<_, Option<i64>>("spent_weekly")?
                    .unwrap_or(0)
                    .max(0),
                spent_monthly: row
                    .get::<_, Option<i64>>("spent_monthly")?
                    .unwrap_or(0)
                    .max(0),
                spent_total: row.get::<_, Option<i64>>("spent_total")?.unwrap_or(0).max(0),
            })
        },
    )
    .map_err(|e| format!("DB_ERROR: failed to sum provider cost windows: {e}"))
}

fn fetch_cost_buckets(
    conn: &Connection,
    provider_id: i64,
    start_ts: i64,
    end_ts: i64,
) -> Result<Vec<(i64, i64)>, String> {
    let mut stmt = conn
        .prepare(
            r#"
SELECT
  created_at,
  SUM(CASE WHEN cost_usd_femto < 0 THEN 0 ELSE cost_usd_femto END) AS cost
FROM request_logs
WHERE excluded_from_stats = 0
  AND status >= 200 AND status < 300 AND error_code IS NULL
  AND cost_usd_femto IS NOT NULL
  AND final_provider_id = ?1
  AND created_at >= ?2 AND created_at < ?3
GROUP BY created_at
ORDER BY created_at ASC
"#,
        )
        .map_err(|e| format!("DB_ERROR: failed to prepare provider cost bucket query: {e}"))?;

    let rows = stmt
        .query_map(params![provider_id, start_ts, end_ts], |row| {
            let ts: i64 = row.get(0)?;
            let cost: i64 = row.get::<_, Option<i64>>(1)?.unwrap_or(0).max(0);
            Ok((ts, cost))
        })
        .map_err(|e| format!("DB_ERROR: failed to query provider cost buckets: {e}"))?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("DB_ERROR: failed to read provider cost bucket: {e}"))?);
    }
    Ok(out)
}

fn compute_next_available_rolling_from_buckets(
    buckets: &[(i64, i64)],
    window_start: i64,
    window_secs: i64,
    limit_femto: i128,
) -> Option<i64> {
    if window_secs <= 0 {
        return None;
    }
    if limit_femto <= 0 {
        return None;
    }

    let mut total: i128 = 0;
    for (ts, cost) in buckets.iter().copied() {
        if ts < window_start {
            continue;
        }
        total = total.saturating_add(cost.max(0) as i128);
    }
    if total < limit_femto {
        return None;
    }

    let threshold = total.saturating_sub(limit_femto).saturating_add(1);
    let mut prefix: i128 = 0;
    for (ts, cost) in buckets.iter().copied() {
        if ts < window_start {
            continue;
        }
        prefix = prefix.saturating_add(cost.max(0) as i128);
        if prefix >= threshold {
            return Some(ts.saturating_add(1).saturating_add(window_secs));
        }
    }

    None
}

fn parse_reset_time_hms_lossy(input: &str) -> (u8, u8, u8) {
    let trimmed = input.trim();
    let mut parts = trimmed.split(':');

    let h_raw = parts.next().unwrap_or("0");
    let m_raw = parts.next().unwrap_or("0");
    let s_raw = parts.next().unwrap_or("0");

    let h = h_raw.parse::<u8>().ok().filter(|v| *v <= 23).unwrap_or(0);
    let m = m_raw.parse::<u8>().ok().filter(|v| *v <= 59).unwrap_or(0);
    let s = s_raw.parse::<u8>().ok().filter(|v| *v <= 59).unwrap_or(0);
    (h, m, s)
}

fn compute_daily_fixed_bounds(
    conn: &Connection,
    now_unix: i64,
    reset_time: &str,
) -> Result<(i64, i64), String> {
    let (h, m, s) = parse_reset_time_hms_lossy(reset_time);
    let mod_h = format!("+{h} hours");
    let mod_m = format!("+{m} minutes");
    let mod_s = format!("+{s} seconds");

    conn.query_row(
        r#"
WITH bounds AS (
  SELECT
    CAST(strftime('%s', ?1, 'unixepoch','localtime','start of day', ?2, ?3, ?4, 'utc') AS INTEGER) AS today_reset,
    CAST(strftime('%s', ?1, 'unixepoch','localtime','start of day','-1 day', ?2, ?3, ?4, 'utc') AS INTEGER) AS yesterday_reset,
    CAST(strftime('%s', ?1, 'unixepoch','localtime','start of day','+1 day', ?2, ?3, ?4, 'utc') AS INTEGER) AS tomorrow_reset
)
SELECT
  CASE WHEN ?1 >= today_reset THEN today_reset ELSE yesterday_reset END AS start_ts,
  CASE WHEN ?1 < today_reset THEN today_reset ELSE tomorrow_reset END AS next_reset
FROM bounds
"#,
        params![now_unix, mod_h, mod_m, mod_s],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    )
    .map_err(|e| format!("DB_ERROR: failed to compute daily reset bounds: {e}"))
}

fn compute_weekly_bounds(conn: &Connection, now_unix: i64) -> Result<(i64, i64), String> {
    conn.query_row(
        r#"
WITH w AS (
  SELECT (CAST(strftime('%w', ?1, 'unixepoch','localtime') AS INTEGER) + 6) % 7 AS offset
)
SELECT
  CAST(strftime('%s', ?1, 'unixepoch','localtime','start of day', printf('-%d days', offset), 'utc') AS INTEGER) AS start_ts,
  CAST(strftime('%s', ?1, 'unixepoch','localtime','start of day', printf('+%d days', 7 - offset), 'utc') AS INTEGER) AS next_reset
FROM w
"#,
        params![now_unix],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    )
    .map_err(|e| format!("DB_ERROR: failed to compute weekly bounds: {e}"))
}

fn compute_monthly_bounds(conn: &Connection, now_unix: i64) -> Result<(i64, i64), String> {
    conn.query_row(
        r#"
SELECT
  CAST(strftime('%s', ?1, 'unixepoch','localtime','start of month','utc') AS INTEGER) AS start_ts,
  CAST(strftime('%s', ?1, 'unixepoch','localtime','start of month','+1 month','utc') AS INTEGER) AS next_reset
"#,
        params![now_unix],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    )
    .map_err(|e| format!("DB_ERROR: failed to compute monthly bounds: {e}"))
}

pub(super) fn gate_provider(input: ProviderLimitsInput<'_>) -> bool {
    let ProviderLimitsInput {
        ctx,
        provider,
        earliest_available_unix,
        skipped_limits,
    } = input;

    if !has_any_limit(provider) {
        return true;
    }

    let conn = match ctx.state.db.open_connection() {
        Ok(conn) => conn,
        Err(_) => return true,
    };

    let now_unix = ctx.created_at;
    let end_unix = now_unix.saturating_add(1);

    let start_5h = provider
        .limit_5h_usd
        .map(|_| now_unix.saturating_sub(WINDOW_5H_SECS));

    let (start_daily_rolling, start_daily_fixed, next_daily_fixed) =
        match (provider.limit_daily_usd, provider.daily_reset_mode) {
            (Some(_), providers::DailyResetMode::Rolling) => {
                (Some(now_unix.saturating_sub(WINDOW_24H_SECS)), None, None)
            }
            (Some(_), providers::DailyResetMode::Fixed) => {
                let (start, next) = match compute_daily_fixed_bounds(
                    &conn,
                    now_unix,
                    provider.daily_reset_time.as_str(),
                ) {
                    Ok(v) => v,
                    Err(_) => return true,
                };
                (None, Some(start), Some(next))
            }
            _ => (None, None, None),
        };

    let (start_weekly, next_weekly) = if provider.limit_weekly_usd.is_some() {
        match compute_weekly_bounds(&conn, now_unix) {
            Ok((start, next)) => (Some(start), Some(next)),
            Err(_) => return true,
        }
    } else {
        (None, None)
    };

    let (start_monthly, next_monthly) = if provider.limit_monthly_usd.is_some() {
        match compute_monthly_bounds(&conn, now_unix) {
            Ok((start, next)) => (Some(start), Some(next)),
            Err(_) => return true,
        }
    } else {
        (None, None)
    };

    let needs_total = provider.limit_total_usd.is_some();
    let min_start = if needs_total {
        None
    } else {
        min_start_ts(&[
            start_5h,
            start_daily_rolling,
            start_daily_fixed,
            start_weekly,
            start_monthly,
        ])
    };

    let sums = match sum_cost_usd_femto_windows(
        &conn,
        provider.id,
        SpendQueryBounds {
            start_5h,
            start_daily_rolling,
            start_daily_fixed,
            start_weekly,
            start_monthly,
            end_ts: end_unix,
            min_start,
        },
    ) {
        Ok(v) => v,
        Err(_) => return true,
    };

    let mut exceeded = false;
    let mut provider_next_available: Option<i64> = None;
    let mut need_rolling_5h = false;
    let mut need_rolling_daily = false;

    if let Some(limit) = provider.limit_5h_usd {
        if limit_exceeded(limit, sums.spent_5h) {
            exceeded = true;
            need_rolling_5h = true;
        }
    }

    if let Some(limit) = provider.limit_daily_usd {
        match provider.daily_reset_mode {
            providers::DailyResetMode::Rolling => {
                if limit_exceeded(limit, sums.spent_daily_rolling) {
                    exceeded = true;
                    need_rolling_daily = true;
                }
            }
            providers::DailyResetMode::Fixed => {
                if limit_exceeded(limit, sums.spent_daily_fixed) {
                    exceeded = true;
                    if let Some(next_reset) = next_daily_fixed {
                        update_latest(&mut provider_next_available, next_reset);
                    }
                }
            }
        }
    }

    if let Some(limit) = provider.limit_weekly_usd {
        if limit_exceeded(limit, sums.spent_weekly) {
            exceeded = true;
            if let Some(next_reset) = next_weekly {
                update_latest(&mut provider_next_available, next_reset);
            }
        }
    }

    if let Some(limit) = provider.limit_monthly_usd {
        if limit_exceeded(limit, sums.spent_monthly) {
            exceeded = true;
            if let Some(next_reset) = next_monthly {
                update_latest(&mut provider_next_available, next_reset);
            }
        }
    }

    if let Some(limit) = provider.limit_total_usd {
        if limit_exceeded(limit, sums.spent_total) {
            exceeded = true;
        }
    }

    if !exceeded {
        return true;
    }

    if need_rolling_5h || need_rolling_daily {
        let mut buckets_start: Option<i64> = None;
        if need_rolling_daily {
            buckets_start = start_daily_rolling;
        }
        if need_rolling_5h {
            if let Some(start_5h) = start_5h {
                buckets_start = Some(match buckets_start {
                    Some(existing) => existing.min(start_5h),
                    None => start_5h,
                });
            }
        }

        if let Some(buckets_start) = buckets_start {
            if let Ok(buckets) = fetch_cost_buckets(&conn, provider.id, buckets_start, end_unix) {
                if need_rolling_5h {
                    if let (Some(start_5h), Some(limit_usd)) = (start_5h, provider.limit_5h_usd) {
                        if let Some(limit_femto) = limit_usd_to_femto(limit_usd) {
                            if let Some(next) = compute_next_available_rolling_from_buckets(
                                &buckets,
                                start_5h,
                                WINDOW_5H_SECS,
                                limit_femto,
                            ) {
                                update_latest(&mut provider_next_available, next);
                            }
                        }
                    }
                }

                if need_rolling_daily {
                    if let (Some(start_24h), Some(limit_usd)) =
                        (start_daily_rolling, provider.limit_daily_usd)
                    {
                        if let Some(limit_femto) = limit_usd_to_femto(limit_usd) {
                            if let Some(next) = compute_next_available_rolling_from_buckets(
                                &buckets,
                                start_24h,
                                WINDOW_24H_SECS,
                                limit_femto,
                            ) {
                                update_latest(&mut provider_next_available, next);
                            }
                        }
                    }
                }
            }
        }
    }

    *skipped_limits = skipped_limits.saturating_add(1);
    if let Some(next) = provider_next_available {
        update_earliest(earliest_available_unix, next);
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rolling_next_available_returns_cutoff_plus_window_plus_1() {
        let window_secs = 5;
        let window_start = 100;
        let limit_femto: i128 = 100;

        let buckets = vec![(100, 60), (101, 50)];

        let next = compute_next_available_rolling_from_buckets(
            &buckets,
            window_start,
            window_secs,
            limit_femto,
        )
        .expect("next available");
        assert_eq!(next, 100 + 1 + window_secs);
    }

    #[test]
    fn rolling_next_available_handles_equal_to_limit_as_exceeded() {
        let window_secs = 10;
        let window_start = 1_000;
        let limit_femto: i128 = 100;

        let buckets = vec![(1_000, 100)];
        let next = compute_next_available_rolling_from_buckets(
            &buckets,
            window_start,
            window_secs,
            limit_femto,
        )
        .expect("next available");
        assert_eq!(next, 1_000 + 1 + window_secs);
    }
}
