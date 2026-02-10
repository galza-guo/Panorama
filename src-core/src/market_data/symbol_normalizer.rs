use crate::market_data::market_data_constants::{
    DATA_SOURCE_EASTMONEY_CN, DATA_SOURCE_TIANTIAN_FUND,
};

#[derive(Debug, Clone, Copy, Default)]
pub struct SymbolNormalizationOptions {
    pub treat_bare_six_digit_as_fund: bool,
}

pub fn normalize_panorama_symbol(symbol: &str, options: SymbolNormalizationOptions) -> String {
    let normalized = symbol.trim().to_uppercase();
    if normalized.is_empty() {
        return normalized;
    }

    if normalized.starts_with("$CASH-") || normalized.contains('=') {
        return normalized;
    }

    if let Some((code, market)) = normalized.split_once('.') {
        let code = code.trim();
        let market = market.trim();

        match market {
            "US" => {
                if !code.is_empty() {
                    return code.to_string();
                }
            }
            "SS" | "SH" | "SZ" => {
                if code.len() == 6 && code.chars().all(|c| c.is_ascii_digit()) {
                    let canonical_market = if market == "SS" { "SH" } else { market };
                    return format!("{code}.{canonical_market}");
                }
            }
            "HK" => {
                if let Some(code) = normalize_hk_code(code) {
                    return format!("{code}.HK");
                }
            }
            "FUND" => {
                if code.len() == 6 && code.chars().all(|c| c.is_ascii_digit()) {
                    return format!("{code}.FUND");
                }
            }
            _ => {}
        }

        return normalized;
    }

    if options.treat_bare_six_digit_as_fund
        && normalized.len() == 6
        && normalized.chars().all(|c| c.is_ascii_digit())
    {
        return format!("{normalized}.FUND");
    }

    normalized
}

pub fn infer_panorama_data_source(symbol: &str) -> Option<&'static str> {
    let normalized = symbol.trim().to_uppercase();
    if normalized.is_empty() || normalized.starts_with("$CASH-") || normalized.contains('=') {
        return None;
    }

    let (code, market) = normalized.split_once('.')?;
    if code.len() != 6 || !code.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    match market {
        "SH" | "SS" | "SZ" => Some(DATA_SOURCE_EASTMONEY_CN),
        "FUND" => Some(DATA_SOURCE_TIANTIAN_FUND),
        _ => None,
    }
}

fn normalize_hk_code(code: &str) -> Option<String> {
    if code.is_empty() || code.len() > 5 || !code.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    let stripped = code.trim_start_matches('0');
    let numeric = if stripped.is_empty() {
        0
    } else {
        stripped.parse::<u32>().ok()?
    };

    if numeric < 10_000 {
        Some(format!("{numeric:04}"))
    } else {
        Some(format!("{numeric:05}"))
    }
}

#[cfg(test)]
mod tests {
    use super::{
        infer_panorama_data_source, normalize_panorama_symbol, SymbolNormalizationOptions,
    };
    use crate::market_data::market_data_constants::{
        DATA_SOURCE_EASTMONEY_CN, DATA_SOURCE_TIANTIAN_FUND,
    };

    #[test]
    fn normalizes_us_suffix_to_provider_compatible_symbol() {
        let result = normalize_panorama_symbol("aapl.us", SymbolNormalizationOptions::default());
        assert_eq!(result, "AAPL");
    }

    #[test]
    fn converts_shanghai_ss_suffix_to_sh() {
        let result = normalize_panorama_symbol("600519.SS", SymbolNormalizationOptions::default());
        assert_eq!(result, "600519.SH");
    }

    #[test]
    fn normalizes_hk_code_length_and_leading_zeros() {
        let tencent = normalize_panorama_symbol("00700.HK", SymbolNormalizationOptions::default());
        let hutchison =
            normalize_panorama_symbol("00001.HK", SymbolNormalizationOptions::default());
        let baba = normalize_panorama_symbol("09988.HK", SymbolNormalizationOptions::default());

        assert_eq!(tencent, "0700.HK");
        assert_eq!(hutchison, "0001.HK");
        assert_eq!(baba, "9988.HK");
    }

    #[test]
    fn normalizes_bare_fund_code_only_when_fund_hint_is_enabled() {
        let as_default = normalize_panorama_symbol(
            "161039",
            SymbolNormalizationOptions {
                treat_bare_six_digit_as_fund: false,
            },
        );
        let with_hint = normalize_panorama_symbol(
            "161039",
            SymbolNormalizationOptions {
                treat_bare_six_digit_as_fund: true,
            },
        );

        assert_eq!(as_default, "161039");
        assert_eq!(with_hint, "161039.FUND");
    }

    #[test]
    fn infers_data_source_for_cn_equities() {
        assert_eq!(
            infer_panorama_data_source("600519.SH"),
            Some(DATA_SOURCE_EASTMONEY_CN)
        );
        assert_eq!(
            infer_panorama_data_source("000001.SZ"),
            Some(DATA_SOURCE_EASTMONEY_CN)
        );
        assert_eq!(
            infer_panorama_data_source("600519.SS"),
            Some(DATA_SOURCE_EASTMONEY_CN)
        );
    }

    #[test]
    fn infers_data_source_for_funds() {
        assert_eq!(
            infer_panorama_data_source("161039.FUND"),
            Some(DATA_SOURCE_TIANTIAN_FUND)
        );
    }

    #[test]
    fn does_not_infer_for_non_cn_symbols() {
        assert_eq!(infer_panorama_data_source("AAPL"), None);
        assert_eq!(infer_panorama_data_source("0700.HK"), None);
        assert_eq!(infer_panorama_data_source("$CASH-CNY"), None);
        assert_eq!(infer_panorama_data_source("CNYUSD=X"), None);
    }
}
