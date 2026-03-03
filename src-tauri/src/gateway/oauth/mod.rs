//! Usage: OAuth adapter pattern for multi-CLI OAuth login support.

pub(crate) mod adapters;
pub(crate) mod callback_server;
pub(crate) mod pkce;
pub(crate) mod provider_trait;
pub(crate) mod refresh;
pub(crate) mod refresh_loop;
pub(crate) mod registry;
pub(crate) mod token_exchange;
