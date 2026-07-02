//! Photo tray and film roll domain models.

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

pub const DEFAULT_FILM_TYPE_KEY: &str = "classic-color";
pub const DEFAULT_ARTWORK_KEY: &str = "classic-color";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FilmRoll {
    pub id: String,
    pub name: String,
    pub film_type_key: String,
    pub artwork_key: String,
    pub sort_order: i32,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FilmRollSummary {
    pub id: String,
    pub name: String,
    pub film_type_key: String,
    pub artwork_key: String,
    pub sort_order: i32,
    pub photo_count: i64,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NewFilmRoll {
    pub id: Option<String>,
    pub name: String,
    pub film_type_key: Option<String>,
    pub artwork_key: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFilmRoll {
    pub name: Option<String>,
    pub film_type_key: Option<String>,
    pub artwork_key: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DeleteFilmRollMode {
    MovePhotosToTray,
    DeletePhotos,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Photo {
    pub id: String,
    pub file_path: String,
    pub original_file_name: Option<String>,
    pub thumbnail_path: Option<String>,
    pub film_roll_id: Option<String>,
    pub sort_order: i32,
    pub imported_at: NaiveDateTime,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NewPhoto {
    pub id: Option<String>,
    pub file_path: String,
    pub original_file_name: Option<String>,
    pub thumbnail_path: Option<String>,
    pub film_roll_id: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type", content = "item")]
pub enum TrayItem {
    FilmRoll(FilmRollSummary),
    Photo(Photo),
}
