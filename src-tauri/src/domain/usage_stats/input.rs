#[derive(Debug, Clone, Copy)]
pub(super) enum UsageRange {
    Today,
    Last7,
    Last30,
    Month,
    All,
}

pub(super) fn parse_range(input: &str) -> crate::shared::error::AppResult<UsageRange> {
    match input {
        "today" => Ok(UsageRange::Today),
        "last7" => Ok(UsageRange::Last7),
        "last30" => Ok(UsageRange::Last30),
        "month" => Ok(UsageRange::Month),
        "all" => Ok(UsageRange::All),
        _ => Err(format!("SEC_INVALID_INPUT: unknown range={input}").into()),
    }
}

#[derive(Debug, Clone, Copy)]
pub(super) enum UsageScopeV2 {
    Cli,
    Provider,
    Model,
    OAuthAccount,
}

pub(super) fn parse_scope_v2(input: &str) -> crate::shared::error::AppResult<UsageScopeV2> {
    match input {
        "cli" => Ok(UsageScopeV2::Cli),
        "provider" => Ok(UsageScopeV2::Provider),
        "model" => Ok(UsageScopeV2::Model),
        "oauth_account" | "oauthAccount" => Ok(UsageScopeV2::OAuthAccount),
        _ => Err(format!("SEC_INVALID_INPUT: unknown scope={input}").into()),
    }
}

#[derive(Debug, Clone, Copy)]
pub(super) enum UsagePeriodV2 {
    Daily,
    Weekly,
    Monthly,
    AllTime,
    Custom,
}

pub(super) fn parse_period_v2(input: &str) -> crate::shared::error::AppResult<UsagePeriodV2> {
    match input {
        "daily" => Ok(UsagePeriodV2::Daily),
        "weekly" => Ok(UsagePeriodV2::Weekly),
        "monthly" => Ok(UsagePeriodV2::Monthly),
        "allTime" | "all_time" | "all" => Ok(UsagePeriodV2::AllTime),
        "custom" => Ok(UsagePeriodV2::Custom),
        _ => Err(format!("SEC_INVALID_INPUT: unknown period={input}").into()),
    }
}

fn validate_cli_key(cli_key: &str) -> crate::shared::error::AppResult<()> {
    crate::shared::cli_key::validate_cli_key(cli_key)
}

pub(super) fn normalize_cli_filter(
    cli_key: Option<&str>,
) -> crate::shared::error::AppResult<Option<&str>> {
    if let Some(k) = cli_key {
        validate_cli_key(k)?;
        return Ok(Some(k));
    }
    Ok(None)
}

pub(super) fn normalize_oauth_account_filter(
    oauth_account_id: Option<i64>,
) -> crate::shared::error::AppResult<Option<i64>> {
    if let Some(id) = oauth_account_id {
        if id <= 0 {
            return Err(format!("SEC_INVALID_INPUT: invalid oauth_account_id={id}").into());
        }
    }
    Ok(oauth_account_id)
}
