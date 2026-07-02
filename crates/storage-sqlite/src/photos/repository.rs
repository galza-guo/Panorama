use async_trait::async_trait;
use diesel::dsl::count_star;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use panorama_core::errors::DatabaseError;
use panorama_core::photos::{
    FilmRoll, FilmRollSummary, NewFilmRoll, NewPhoto, Photo, PhotoRepositoryTrait, TrayItem,
    UpdateFilmRoll,
};
use panorama_core::{Error, Result};

use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::photos::model::{FilmRollChangeset, FilmRollDB, NewFilmRollDB, NewPhotoDB, PhotoDB};
use crate::schema::{film_rolls, photos};

pub struct PhotoRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl PhotoRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }

    fn photo_count_for_roll(conn: &mut SqliteConnection, film_roll_id: &str) -> Result<i64> {
        photos::table
            .filter(photos::film_roll_id.eq(film_roll_id))
            .select(count_star())
            .first::<i64>(conn)
            .map_err(StorageError::from)
            .map_err(Into::into)
    }

    fn list_film_roll_summaries_impl(conn: &mut SqliteConnection) -> Result<Vec<FilmRollSummary>> {
        let rolls = film_rolls::table
            .order((film_rolls::sort_order.asc(), film_rolls::created_at.asc()))
            .load::<FilmRollDB>(conn)
            .map_err(StorageError::from)?;

        rolls
            .into_iter()
            .map(|roll| {
                let count = Self::photo_count_for_roll(conn, &roll.id)?;
                Ok(roll.into_summary(count))
            })
            .collect()
    }
}

#[async_trait]
impl PhotoRepositoryTrait for PhotoRepository {
    async fn list_tray_items(&self) -> Result<Vec<TrayItem>> {
        let mut conn = get_connection(&self.pool)?;
        let rolls = Self::list_film_roll_summaries_impl(&mut conn)?;
        let loose_photos = photos::table
            .filter(photos::film_roll_id.is_null())
            .order((photos::sort_order.asc(), photos::imported_at.asc()))
            .load::<PhotoDB>(&mut conn)
            .map_err(StorageError::from)?;

        let mut items = rolls
            .into_iter()
            .map(TrayItem::FilmRoll)
            .collect::<Vec<_>>();
        items.extend(
            loose_photos
                .into_iter()
                .map(Photo::from)
                .map(TrayItem::Photo),
        );
        Ok(items)
    }

    async fn list_film_rolls(&self) -> Result<Vec<FilmRollSummary>> {
        let mut conn = get_connection(&self.pool)?;
        Self::list_film_roll_summaries_impl(&mut conn)
    }

    async fn get_film_roll(&self, film_roll_id: &str) -> Result<Option<FilmRoll>> {
        let mut conn = get_connection(&self.pool)?;
        film_rolls::table
            .find(film_roll_id)
            .first::<FilmRollDB>(&mut conn)
            .optional()
            .map(|roll| roll.map(FilmRoll::from))
            .map_err(StorageError::from)
            .map_err(Into::into)
    }

    async fn list_loose_photos(&self) -> Result<Vec<Photo>> {
        let mut conn = get_connection(&self.pool)?;
        photos::table
            .filter(photos::film_roll_id.is_null())
            .order((photos::sort_order.asc(), photos::imported_at.asc()))
            .load::<PhotoDB>(&mut conn)
            .map(|rows| rows.into_iter().map(Photo::from).collect())
            .map_err(StorageError::from)
            .map_err(Into::into)
    }

    async fn list_film_roll_photos(&self, film_roll_id: &str) -> Result<Vec<Photo>> {
        let mut conn = get_connection(&self.pool)?;
        photos::table
            .filter(photos::film_roll_id.eq(film_roll_id))
            .order((photos::sort_order.asc(), photos::imported_at.asc()))
            .load::<PhotoDB>(&mut conn)
            .map(|rows| rows.into_iter().map(Photo::from).collect())
            .map_err(StorageError::from)
            .map_err(Into::into)
    }

    async fn create_photo(&self, input: NewPhoto) -> Result<Photo> {
        let new_photo = NewPhotoDB::from(input);
        self.writer
            .exec(move |conn| {
                diesel::insert_into(photos::table)
                    .values(&new_photo)
                    .returning(PhotoDB::as_returning())
                    .get_result(conn)
                    .map(Photo::from)
                    .map_err(StorageError::from)
                    .map_err(Into::into)
            })
            .await
    }

    async fn create_film_roll(&self, input: NewFilmRoll) -> Result<FilmRoll> {
        let new_roll = NewFilmRollDB::from(input);
        self.writer
            .exec(move |conn| {
                diesel::insert_into(film_rolls::table)
                    .values(&new_roll)
                    .returning(FilmRollDB::as_returning())
                    .get_result(conn)
                    .map(FilmRoll::from)
                    .map_err(StorageError::from)
                    .map_err(Into::into)
            })
            .await
    }

    async fn update_film_roll(
        &self,
        film_roll_id: &str,
        patch: UpdateFilmRoll,
    ) -> Result<FilmRoll> {
        let film_roll_id = film_roll_id.to_string();
        let changeset = FilmRollChangeset::from(patch);
        self.writer
            .exec(move |conn| {
                let affected = diesel::update(film_rolls::table.find(&film_roll_id))
                    .set(&changeset)
                    .execute(conn)
                    .map_err(StorageError::from)?;

                if affected == 0 {
                    return Err(Error::Database(DatabaseError::NotFound(format!(
                        "Film roll not found: {}",
                        film_roll_id
                    ))));
                }

                film_rolls::table
                    .find(&film_roll_id)
                    .first::<FilmRollDB>(conn)
                    .map(FilmRoll::from)
                    .map_err(StorageError::from)
                    .map_err(Into::into)
            })
            .await
    }

    async fn delete_film_roll_record(&self, film_roll_id: &str) -> Result<usize> {
        let film_roll_id = film_roll_id.to_string();
        self.writer
            .exec(move |conn| {
                diesel::delete(film_rolls::table.find(film_roll_id))
                    .execute(conn)
                    .map_err(StorageError::from)
                    .map_err(Into::into)
            })
            .await
    }

    async fn set_photo_film_roll(
        &self,
        photo_ids: &[String],
        film_roll_id: Option<&str>,
    ) -> Result<usize> {
        if photo_ids.is_empty() {
            return Ok(0);
        }

        let photo_ids = photo_ids.to_vec();
        let film_roll_id = film_roll_id.map(str::to_string);
        self.writer
            .exec(move |conn| {
                diesel::update(photos::table.filter(photos::id.eq_any(photo_ids)))
                    .set((
                        photos::film_roll_id.eq(film_roll_id),
                        photos::updated_at.eq(chrono::Utc::now().naive_utc()),
                    ))
                    .execute(conn)
                    .map_err(StorageError::from)
                    .map_err(Into::into)
            })
            .await
    }

    async fn delete_photos_in_roll(&self, film_roll_id: &str) -> Result<usize> {
        let film_roll_id = film_roll_id.to_string();
        self.writer
            .exec(move |conn| {
                diesel::delete(photos::table.filter(photos::film_roll_id.eq(film_roll_id)))
                    .execute(conn)
                    .map_err(StorageError::from)
                    .map_err(Into::into)
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use panorama_core::photos::{DeleteFilmRollMode, PhotoService, PhotoServiceTrait};
    use tempfile::tempdir;

    use crate::db::{create_pool, init, run_migrations, write_actor::spawn_writer};

    async fn create_test_repository() -> (PhotoRepository, tempfile::TempDir) {
        let app_data = tempdir().expect("tempdir");
        let app_data_path = app_data.path().to_string_lossy().to_string();
        let db_path = init(&app_data_path).expect("init db");
        run_migrations(&db_path).expect("migrate db");
        let pool = create_pool(&db_path).expect("create pool");
        let writer = spawn_writer((*pool).clone());
        (PhotoRepository::new(pool, writer), app_data)
    }

    #[tokio::test]
    async fn create_and_list_film_rolls() {
        let (repo, _temp_dir) = create_test_repository().await;

        repo.create_film_roll(NewFilmRoll {
            id: Some("roll-1".to_string()),
            name: "Trip to Europe".to_string(),
            film_type_key: None,
            artwork_key: None,
            sort_order: Some(2),
        })
        .await
        .unwrap();

        let rolls = repo.list_film_rolls().await.unwrap();

        assert_eq!(rolls.len(), 1);
        assert_eq!(rolls[0].id, "roll-1");
        assert_eq!(rolls[0].photo_count, 0);
    }

    #[tokio::test]
    async fn assigning_and_clearing_photos_changes_their_home() {
        let (repo, _temp_dir) = create_test_repository().await;
        repo.create_film_roll(NewFilmRoll {
            id: Some("roll-1".to_string()),
            name: "Trip to Europe".to_string(),
            film_type_key: None,
            artwork_key: None,
            sort_order: None,
        })
        .await
        .unwrap();
        repo.create_photo(NewPhoto {
            id: Some("photo-1".to_string()),
            file_path: "/tmp/photo-1.jpg".to_string(),
            original_file_name: Some("photo-1.jpg".to_string()),
            thumbnail_path: None,
            film_roll_id: None,
            sort_order: None,
        })
        .await
        .unwrap();

        repo.set_photo_film_roll(&["photo-1".to_string()], Some("roll-1"))
            .await
            .unwrap();
        assert_eq!(
            repo.list_film_roll_photos("roll-1").await.unwrap()[0]
                .film_roll_id
                .as_deref(),
            Some("roll-1")
        );

        repo.set_photo_film_roll(&["photo-1".to_string()], None)
            .await
            .unwrap();
        assert_eq!(repo.list_loose_photos().await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn deleting_roll_safe_mode_keeps_photos_loose() {
        let (repo, _temp_dir) = create_test_repository().await;
        repo.create_film_roll(NewFilmRoll {
            id: Some("roll-1".to_string()),
            name: "Trip to Europe".to_string(),
            film_type_key: None,
            artwork_key: None,
            sort_order: None,
        })
        .await
        .unwrap();
        repo.create_photo(NewPhoto {
            id: Some("photo-1".to_string()),
            file_path: "/tmp/photo-1.jpg".to_string(),
            original_file_name: Some("photo-1.jpg".to_string()),
            thumbnail_path: None,
            film_roll_id: Some("roll-1".to_string()),
            sort_order: None,
        })
        .await
        .unwrap();
        let service = PhotoService::new(Arc::new(repo));

        service
            .delete_film_roll("roll-1", DeleteFilmRollMode::MovePhotosToTray)
            .await
            .unwrap();

        let photos = service.list_loose_photos().await.unwrap();
        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].film_roll_id, None);
    }
}
