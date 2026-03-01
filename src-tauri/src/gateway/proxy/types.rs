//! Usage: Small shared types for the gateway proxy module.

use crate::gateway::events::decision_chain as dc;

#[derive(Debug, Clone, Copy)]
pub(in crate::gateway) enum ErrorCategory {
    SystemError,
    ProviderError,
    NonRetryableClientError,
    ResourceNotFound,
    ClientAbort,
}

impl ErrorCategory {
    pub(in crate::gateway) fn as_str(self) -> &'static str {
        match self {
            Self::SystemError => "SYSTEM_ERROR",
            Self::ProviderError => "PROVIDER_ERROR",
            Self::NonRetryableClientError => "NON_RETRYABLE_CLIENT_ERROR",
            Self::ResourceNotFound => "RESOURCE_NOT_FOUND",
            Self::ClientAbort => "CLIENT_ABORT",
        }
    }

    pub(in crate::gateway) fn reason_code(self) -> &'static str {
        match self {
            Self::ProviderError => dc::REASON_RETRY_FAILED,
            Self::ResourceNotFound => dc::REASON_RESOURCE_NOT_FOUND,
            Self::NonRetryableClientError => dc::REASON_CLIENT_ERROR_NON_RETRYABLE,
            Self::SystemError => dc::REASON_SYSTEM_ERROR,
            Self::ClientAbort => dc::REASON_ABORTED,
        }
    }
}
