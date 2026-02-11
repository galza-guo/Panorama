use diesel::prelude::*;
use diesel::Queryable;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub font: String,
    pub base_currency: String,
    pub instance_id: String,
    pub onboarding_completed: bool,
    pub auto_update_check_enabled: bool,
    pub handle_exchange_automatically: bool,
    pub exchange_rate_provider: String,
    pub menu_bar_visible: bool,
    pub sync_enabled: bool,
    pub insurance_visible: bool,
    pub mpf_visible: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            font: "font-mono".to_string(),
            base_currency: "".to_string(),
            instance_id: "".to_string(),
            onboarding_completed: false,
            auto_update_check_enabled: true,
            handle_exchange_automatically: true,
            exchange_rate_provider: "YAHOO".to_string(),
            menu_bar_visible: true,
            sync_enabled: true,
            insurance_visible: true,
            mpf_visible: true,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdate {
    pub theme: Option<String>,
    pub font: Option<String>,
    pub base_currency: Option<String>,
    pub onboarding_completed: Option<bool>,
    pub auto_update_check_enabled: Option<bool>,
    pub handle_exchange_automatically: Option<bool>,
    pub exchange_rate_provider: Option<String>,
    pub menu_bar_visible: Option<bool>,
    pub sync_enabled: Option<bool>,
    pub insurance_visible: Option<bool>,
    pub mpf_visible: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Sort {
    pub id: String,
    pub desc: bool,
}

#[derive(Queryable, Insertable, Serialize, Deserialize, Debug)]
#[diesel(table_name= crate::schema::app_settings)]
#[serde(rename_all = "camelCase")]
pub struct AppSetting {
    pub setting_key: String,
    pub setting_value: String,
}
