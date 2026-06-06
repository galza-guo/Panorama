//! Webull HK request signing.

use std::collections::BTreeMap;

use base64::{engine::general_purpose, Engine as _};
use hmac::{Hmac, Mac};
use panorama_core::{Error, Result};
use sha1::Sha1;

type HmacSha1 = Hmac<Sha1>;

pub const WEBULL_SIGNATURE_ALGORITHM: &str = "HMAC-SHA1";
pub const WEBULL_SIGNATURE_VERSION: &str = "1.0";
pub const WEBULL_API_VERSION: &str = "v2";

#[derive(Debug, Clone, Copy)]
pub struct SigningHeader<'a> {
    pub name: &'a str,
    pub value: &'a str,
}

impl<'a> SigningHeader<'a> {
    pub fn new(name: &'a str, value: &'a str) -> Self {
        Self { name, value }
    }
}

#[derive(Debug, Clone)]
pub struct SigningRequest<'a> {
    pub path: &'a str,
    pub query_params: Vec<(&'a str, &'a str)>,
    pub headers: Vec<SigningHeader<'a>>,
    pub body: Option<&'a str>,
}

pub fn generate_signature(request: &SigningRequest<'_>, app_secret: &str) -> Result<String> {
    let signing_string = build_signing_string(request);
    let encoded = urlencoding::encode(&signing_string);
    let key = format!("{app_secret}&");
    let mut mac = HmacSha1::new_from_slice(key.as_bytes())
        .map_err(|e| Error::Unexpected(format!("Invalid Webull signing key: {e}")))?;
    mac.update(encoded.as_bytes());
    let signature = mac.finalize().into_bytes();

    Ok(general_purpose::STANDARD.encode(signature))
}

fn build_signing_string(request: &SigningRequest<'_>) -> String {
    let mut values: BTreeMap<&str, Vec<&str>> = BTreeMap::new();

    for (name, value) in &request.query_params {
        values.entry(name).or_default().push(value);
    }

    for header in &request.headers {
        values.entry(header.name).or_default().push(header.value);
    }

    let str1 = values
        .into_iter()
        .map(|(name, mut values)| {
            values.sort_unstable();
            format!("{name}={}", values.join("&"))
        })
        .collect::<Vec<_>>()
        .join("&");

    match request.body {
        Some(body) if !body.is_empty() => {
            let body_md5 = format!("{:X}", md5::compute(body.as_bytes()));
            format!("{}&{}&{}", request.path, str1, body_md5)
        }
        _ => format!("{}&{}", request.path, str1),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        generate_signature, SigningHeader, SigningRequest, WEBULL_SIGNATURE_ALGORITHM,
        WEBULL_SIGNATURE_VERSION,
    };

    #[test]
    fn generates_webull_documented_signature_example() {
        let request = SigningRequest {
            path: "/trade/place_order",
            query_params: vec![
                ("a1", "webull"),
                ("a2", "123"),
                ("a3", "xxx"),
                ("q1", "yyy"),
            ],
            headers: vec![
                SigningHeader::new("x-app-key", "776da210ab4a452795d74e726ebd74b6"),
                SigningHeader::new("x-timestamp", "2022-01-04T03:55:31Z"),
                SigningHeader::new("x-signature-version", WEBULL_SIGNATURE_VERSION),
                SigningHeader::new("x-signature-algorithm", WEBULL_SIGNATURE_ALGORITHM),
                SigningHeader::new("x-signature-nonce", "48ef5afed43d4d91ae514aaeafbc29ba"),
                SigningHeader::new("host", "api.webull.com"),
            ],
            body: Some(
                r#"{"k1":123,"k2":"this is the api request body","k3":true,"k4":{"foo":[1,2]}}"#,
            ),
        };

        let signature = generate_signature(&request, "0f50a2e853334a9aae1a783bee120c1f").unwrap();

        assert_eq!(signature, "kvlS6opdZDhEBo5jq40nHYXaLvM=");
    }
}
