use chrono::{NaiveDateTime, Utc};
use diesel::prelude::*;

use panorama_core::photos::{
    FilmRoll, FilmRollSummary, NewFilmRoll, NewPhoto, Photo, UpdateFilmRoll, DEFAULT_ARTWORK_KEY,
    DEFAULT_FILM_TYPE_KEY,
};

#[derive(Queryable, Identifiable, Selectable, PartialEq, Debug, Clone)]
#[diesel(table_name = crate::schema::film_rolls)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct FilmRollDB {
    pub id: String,
    pub name: String,
    pub film_type_key: String,
    pub artwork_key: String,
    pub sort_order: i32,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::film_rolls)]
pub struct NewFilmRollDB {
    pub id: String,
    pub name: String,
    pub film_type_key: String,
    pub artwork_key: String,
    pub sort_order: i32,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(AsChangeset, Debug, Clone)]
#[diesel(table_name = crate::schema::film_rolls)]
pub struct FilmRollChangeset {
    pub name: Option<String>,
    pub film_type_key: Option<String>,
    pub artwork_key: Option<String>,
    pub sort_order: Option<i32>,
    pub updated_at: NaiveDateTime,
}

#[derive(Queryable, Identifiable, Selectable, PartialEq, Debug, Clone)]
#[diesel(table_name = crate::schema::photos)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct PhotoDB {
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

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::photos)]
pub struct NewPhotoDB {
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

impl FilmRollDB {
    pub fn into_summary(self, photo_count: i64) -> FilmRollSummary {
        FilmRollSummary {
            id: self.id,
            name: self.name,
            film_type_key: self.film_type_key,
            artwork_key: self.artwork_key,
            sort_order: self.sort_order,
            photo_count,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

impl From<FilmRollDB> for FilmRoll {
    fn from(db: FilmRollDB) -> Self {
        Self {
            id: db.id,
            name: db.name,
            film_type_key: db.film_type_key,
            artwork_key: db.artwork_key,
            sort_order: db.sort_order,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

impl From<PhotoDB> for Photo {
    fn from(db: PhotoDB) -> Self {
        Self {
            id: db.id,
            file_path: db.file_path,
            original_file_name: db.original_file_name,
            thumbnail_path: db.thumbnail_path,
            film_roll_id: db.film_roll_id,
            sort_order: db.sort_order,
            imported_at: db.imported_at,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

impl From<NewFilmRoll> for NewFilmRollDB {
    fn from(domain: NewFilmRoll) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: domain
                .id
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            name: domain.name,
            film_type_key: domain
                .film_type_key
                .unwrap_or_else(|| DEFAULT_FILM_TYPE_KEY.to_string()),
            artwork_key: domain
                .artwork_key
                .unwrap_or_else(|| DEFAULT_ARTWORK_KEY.to_string()),
            sort_order: domain.sort_order.unwrap_or_default(),
            created_at: now,
            updated_at: now,
        }
    }
}

impl From<NewPhoto> for NewPhotoDB {
    fn from(domain: NewPhoto) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: domain
                .id
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            file_path: domain.file_path,
            original_file_name: domain.original_file_name,
            thumbnail_path: domain.thumbnail_path,
            film_roll_id: domain.film_roll_id,
            sort_order: domain.sort_order.unwrap_or_default(),
            imported_at: now,
            created_at: now,
            updated_at: now,
        }
    }
}

impl From<UpdateFilmRoll> for FilmRollChangeset {
    fn from(domain: UpdateFilmRoll) -> Self {
        Self {
            name: domain.name,
            film_type_key: domain.film_type_key,
            artwork_key: domain.artwork_key,
            sort_order: domain.sort_order,
            updated_at: Utc::now().naive_utc(),
        }
    }
}
