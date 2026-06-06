use std::{net::SocketAddr, time::Duration};

use crate::auth::{decode_secret_key, AuthConfig};

pub struct Config {
    pub listen_addr: SocketAddr,
    pub db_path: String,
    pub cors_allow: Vec<String>,
    pub request_timeout: Duration,
    pub static_dir: String,
    pub addons_root: String,
    pub secret_key: String,
    pub auth: Option<AuthConfig>,
}

impl Config {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();
        let listen_addr: SocketAddr =
            env_with_legacy_fallback("PANORAMA_LISTEN_ADDR", "WF_LISTEN_ADDR")
                .unwrap_or_else(|| "0.0.0.0:8088".to_string())
                .parse()
                .expect("Invalid PANORAMA_LISTEN_ADDR");
        let db_path = env_with_legacy_fallback("PANORAMA_DB_PATH", "WF_DB_PATH")
            .unwrap_or_else(|| "./db/app.db".into());
        let cors_allow =
            env_with_legacy_fallback("PANORAMA_CORS_ALLOW_ORIGINS", "WF_CORS_ALLOW_ORIGINS")
                .unwrap_or_else(|| "*".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
        let timeout_ms: u64 =
            env_with_legacy_fallback("PANORAMA_REQUEST_TIMEOUT_MS", "WF_REQUEST_TIMEOUT_MS")
                .unwrap_or_else(|| "30000".into())
                .parse()
                .unwrap_or(30000);
        let static_dir = env_with_legacy_fallback("PANORAMA_STATIC_DIR", "WF_STATIC_DIR")
            .unwrap_or_else(|| "dist".into());
        let secret_key = env_with_legacy_fallback("PANORAMA_SECRET_KEY", "WF_SECRET_KEY")
            .unwrap_or_else(|| panic!("PANORAMA_SECRET_KEY must be set and contain a 32-byte key"))
            .trim()
            .to_string();
        if secret_key.is_empty() {
            panic!("PANORAMA_SECRET_KEY must not be empty");
        }
        let secret_key_bytes = decode_secret_key(&secret_key)
            .unwrap_or_else(|e| panic!("Failed to decode PANORAMA_SECRET_KEY: {e}"));
        let addons_root = env_with_legacy_fallback("PANORAMA_ADDONS_DIR", "WF_ADDONS_DIR")
            .unwrap_or_else(|| {
                std::path::Path::new(&db_path)
                    .parent()
                    .unwrap_or_else(|| std::path::Path::new("."))
                    .to_string_lossy()
                    .into_owned()
            });
        let auth = env_with_legacy_fallback("PANORAMA_AUTH_PASSWORD_HASH", "WF_AUTH_PASSWORD_HASH")
            .map(|hash| hash.trim().to_string())
            .filter(|hash| !hash.is_empty())
            .map(|password_hash| {
                let ttl_minutes = env_with_legacy_fallback(
                    "PANORAMA_AUTH_TOKEN_TTL_MINUTES",
                    "WF_AUTH_TOKEN_TTL_MINUTES",
                )
                .and_then(|value| value.parse::<u64>().ok())
                .filter(|value| *value > 0)
                .unwrap_or(60);
                AuthConfig {
                    password_hash,
                    jwt_secret: secret_key_bytes.clone(),
                    access_token_ttl: Duration::from_secs(ttl_minutes.saturating_mul(60)),
                }
            });
        Self {
            listen_addr,
            db_path,
            cors_allow,
            request_timeout: Duration::from_millis(timeout_ms),
            static_dir,
            addons_root,
            secret_key,
            auth,
        }
    }
}

pub(crate) fn env_with_legacy_fallback(primary: &str, legacy: &str) -> Option<String> {
    std::env::var(primary)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            std::env::var(legacy)
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
}
