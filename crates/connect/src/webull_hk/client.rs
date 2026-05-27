//! Webull HK HTTP client foundation.

use std::time::Duration;

use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::de::DeserializeOwned;
use uuid::Uuid;
use wealthfolio_core::{Error, Result};

use super::auth::{
    generate_signature, SigningHeader, SigningRequest, WEBULL_API_VERSION,
    WEBULL_SIGNATURE_ALGORITHM, WEBULL_SIGNATURE_VERSION,
};
use super::models::{CheckTokenRequest, TokenResponse};

const DEFAULT_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WebullHkEnvironment {
    Sandbox,
    Production,
}

impl WebullHkEnvironment {
    pub fn http_host(self) -> &'static str {
        match self {
            Self::Sandbox => "api.sandbox.webull.hk",
            Self::Production => "api.webull.hk",
        }
    }

    pub fn http_base_url(self) -> &'static str {
        match self {
            Self::Sandbox => "https://api.sandbox.webull.hk",
            Self::Production => "https://api.webull.hk",
        }
    }
}

#[derive(Debug, Clone)]
pub struct WebullHkClient {
    client: reqwest::Client,
    environment: WebullHkEnvironment,
    app_key: String,
    app_secret: String,
    access_token: Option<String>,
}

impl WebullHkClient {
    pub fn new(
        environment: WebullHkEnvironment,
        app_key: impl Into<String>,
        app_secret: impl Into<String>,
        access_token: Option<String>,
    ) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .build()
            .map_err(|e| Error::Unexpected(format!("Failed to build Webull HK client: {e}")))?;

        Ok(Self {
            client,
            environment,
            app_key: app_key.into(),
            app_secret: app_secret.into(),
            access_token,
        })
    }

    pub async fn create_token(&self) -> Result<TokenResponse> {
        self.post_json("/openapi/auth/token/create", None::<&()>)
            .await
    }

    pub async fn check_token(&self, token: &str) -> Result<TokenResponse> {
        self.post_json(
            "/openapi/auth/token/check",
            Some(&CheckTokenRequest {
                token: token.to_string(),
            }),
        )
        .await
    }

    async fn post_json<T, B>(&self, path: &str, body: Option<&B>) -> Result<T>
    where
        T: DeserializeOwned,
        B: serde::Serialize + ?Sized,
    {
        let body_string = match body {
            Some(body) => Some(
                serde_json::to_string(body)
                    .map_err(|e| Error::Unexpected(format!("Failed to serialize body: {e}")))?,
            ),
            None => None,
        };
        let url = format!("{}{}", self.environment.http_base_url(), path);
        let headers = self.signed_headers(path, &[], body_string.as_deref())?;
        let request = self
            .client
            .post(url)
            .headers(headers)
            .header(CONTENT_TYPE, "application/json");
        let response = if let Some(body_string) = body_string {
            request.body(body_string).send().await
        } else {
            request.send().await
        }
        .map_err(|e| Error::Unexpected(format!("Webull HK request failed: {e}")))?;

        parse_response(response).await
    }

    fn signed_headers(
        &self,
        path: &str,
        query_params: &[(&str, &str)],
        body: Option<&str>,
    ) -> Result<HeaderMap> {
        let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        let nonce = Uuid::new_v4().simple().to_string();
        let host = self.environment.http_host();
        let signing_headers = vec![
            SigningHeader::new("host", host),
            SigningHeader::new("x-app-key", &self.app_key),
            SigningHeader::new("x-signature-algorithm", WEBULL_SIGNATURE_ALGORITHM),
            SigningHeader::new("x-signature-nonce", &nonce),
            SigningHeader::new("x-signature-version", WEBULL_SIGNATURE_VERSION),
            SigningHeader::new("x-timestamp", &timestamp),
        ];
        let signing_request = SigningRequest {
            path,
            query_params: query_params.to_vec(),
            headers: signing_headers,
            body,
        };
        let signature = generate_signature(&signing_request, &self.app_secret)?;

        let mut headers = HeaderMap::new();
        insert_header(&mut headers, "x-app-key", &self.app_key)?;
        insert_header(&mut headers, "x-timestamp", &timestamp)?;
        insert_header(
            &mut headers,
            "x-signature-version",
            WEBULL_SIGNATURE_VERSION,
        )?;
        insert_header(
            &mut headers,
            "x-signature-algorithm",
            WEBULL_SIGNATURE_ALGORITHM,
        )?;
        insert_header(&mut headers, "x-signature-nonce", &nonce)?;
        insert_header(&mut headers, "x-version", WEBULL_API_VERSION)?;
        insert_header(&mut headers, "x-signature", &signature)?;
        if let Some(access_token) = &self.access_token {
            insert_header(&mut headers, "x-access-token", access_token)?;
        }

        Ok(headers)
    }
}

async fn parse_response<T: DeserializeOwned>(response: reqwest::Response) -> Result<T> {
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| Error::Unexpected(format!("Failed to read Webull HK response: {e}")))?;

    if !status.is_success() {
        return Err(Error::Unexpected(format!(
            "Webull HK request failed with status {status}: {text}"
        )));
    }

    serde_json::from_str(&text)
        .map_err(|e| Error::Unexpected(format!("Failed to parse Webull HK response: {e}")))
}

fn insert_header(headers: &mut HeaderMap, name: &'static str, value: &str) -> Result<()> {
    let value = HeaderValue::from_str(value)
        .map_err(|e| Error::Unexpected(format!("Invalid Webull HK header {name}: {e}")))?;
    headers.insert(name, value);
    Ok(())
}
