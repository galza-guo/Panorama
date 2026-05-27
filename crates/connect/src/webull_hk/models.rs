//! Webull HK response and request models.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct CheckTokenRequest {
    pub token: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TokenStatus {
    Pending,
    Normal,
    Invalid,
    Expired,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TokenResponse {
    pub token: String,
    pub expires: i64,
    pub status: TokenStatus,
}
