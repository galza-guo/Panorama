use async_trait::async_trait;
use chrono::{NaiveDate, NaiveDateTime};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::errors::Result;

use super::{
    DeleteFilmRollMode, FilmRoll, FilmRollSummary, NewFilmRoll, NewPhoto, Photo,
    PhotoRepositoryTrait, PhotoService, PhotoServiceTrait, TrayItem, UpdateFilmRoll,
    DEFAULT_ARTWORK_KEY, DEFAULT_FILM_TYPE_KEY,
};

#[derive(Default)]
struct MockPhotoRepository {
    film_rolls: Mutex<HashMap<String, FilmRoll>>,
    photos: Mutex<HashMap<String, Photo>>,
}

impl MockPhotoRepository {
    fn now() -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 7, 2)
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap()
    }

    fn add_photo(&self, id: &str, film_roll_id: Option<&str>) {
        self.photos.lock().unwrap().insert(
            id.to_string(),
            Photo {
                id: id.to_string(),
                file_path: format!("/tmp/{id}.jpg"),
                original_file_name: Some(format!("{id}.jpg")),
                thumbnail_path: None,
                film_roll_id: film_roll_id.map(str::to_string),
                sort_order: 0,
                imported_at: Self::now(),
                created_at: Self::now(),
                updated_at: Self::now(),
            },
        );
    }

    fn add_film_roll(&self, id: &str, name: &str) {
        self.film_rolls.lock().unwrap().insert(
            id.to_string(),
            FilmRoll {
                id: id.to_string(),
                name: name.to_string(),
                film_type_key: DEFAULT_FILM_TYPE_KEY.to_string(),
                artwork_key: DEFAULT_ARTWORK_KEY.to_string(),
                sort_order: 0,
                created_at: Self::now(),
                updated_at: Self::now(),
            },
        );
    }

    fn photo(&self, id: &str) -> Photo {
        self.photos.lock().unwrap().get(id).unwrap().clone()
    }
}

#[async_trait]
impl PhotoRepositoryTrait for MockPhotoRepository {
    async fn list_tray_items(&self) -> Result<Vec<TrayItem>> {
        Ok(Vec::new())
    }

    async fn list_film_rolls(&self) -> Result<Vec<FilmRollSummary>> {
        Ok(Vec::new())
    }

    async fn get_film_roll(&self, film_roll_id: &str) -> Result<Option<FilmRoll>> {
        Ok(self.film_rolls.lock().unwrap().get(film_roll_id).cloned())
    }

    async fn list_loose_photos(&self) -> Result<Vec<Photo>> {
        Ok(self
            .photos
            .lock()
            .unwrap()
            .values()
            .filter(|photo| photo.film_roll_id.is_none())
            .cloned()
            .collect())
    }

    async fn list_film_roll_photos(&self, film_roll_id: &str) -> Result<Vec<Photo>> {
        Ok(self
            .photos
            .lock()
            .unwrap()
            .values()
            .filter(|photo| photo.film_roll_id.as_deref() == Some(film_roll_id))
            .cloned()
            .collect())
    }

    async fn create_photo(&self, input: NewPhoto) -> Result<Photo> {
        let id = input.id.unwrap_or_else(|| "photo-created".to_string());
        let photo = Photo {
            id: id.clone(),
            file_path: input.file_path,
            original_file_name: input.original_file_name,
            thumbnail_path: input.thumbnail_path,
            film_roll_id: input.film_roll_id,
            sort_order: input.sort_order.unwrap_or_default(),
            imported_at: Self::now(),
            created_at: Self::now(),
            updated_at: Self::now(),
        };
        self.photos.lock().unwrap().insert(id, photo.clone());
        Ok(photo)
    }

    async fn create_film_roll(&self, input: NewFilmRoll) -> Result<FilmRoll> {
        let id = input.id.unwrap_or_else(|| "roll-created".to_string());
        let roll = FilmRoll {
            id: id.clone(),
            name: input.name,
            film_type_key: input
                .film_type_key
                .unwrap_or_else(|| DEFAULT_FILM_TYPE_KEY.to_string()),
            artwork_key: input
                .artwork_key
                .unwrap_or_else(|| DEFAULT_ARTWORK_KEY.to_string()),
            sort_order: input.sort_order.unwrap_or_default(),
            created_at: Self::now(),
            updated_at: Self::now(),
        };
        self.film_rolls.lock().unwrap().insert(id, roll.clone());
        Ok(roll)
    }

    async fn update_film_roll(
        &self,
        film_roll_id: &str,
        patch: UpdateFilmRoll,
    ) -> Result<FilmRoll> {
        let mut film_rolls = self.film_rolls.lock().unwrap();
        let roll = film_rolls.get_mut(film_roll_id).unwrap();
        if let Some(name) = patch.name {
            roll.name = name;
        }
        if let Some(film_type_key) = patch.film_type_key {
            roll.film_type_key = film_type_key;
        }
        if let Some(artwork_key) = patch.artwork_key {
            roll.artwork_key = artwork_key;
        }
        if let Some(sort_order) = patch.sort_order {
            roll.sort_order = sort_order;
        }
        Ok(roll.clone())
    }

    async fn delete_film_roll_record(&self, film_roll_id: &str) -> Result<usize> {
        Ok(self
            .film_rolls
            .lock()
            .unwrap()
            .remove(film_roll_id)
            .map_or(0, |_| 1))
    }

    async fn set_photo_film_roll(
        &self,
        photo_ids: &[String],
        film_roll_id: Option<&str>,
    ) -> Result<usize> {
        let mut photos = self.photos.lock().unwrap();
        let mut updated = 0;
        for photo_id in photo_ids {
            if let Some(photo) = photos.get_mut(photo_id) {
                photo.film_roll_id = film_roll_id.map(str::to_string);
                updated += 1;
            }
        }
        Ok(updated)
    }

    async fn delete_photos_in_roll(&self, film_roll_id: &str) -> Result<usize> {
        let mut photos = self.photos.lock().unwrap();
        let before = photos.len();
        photos.retain(|_, photo| photo.film_roll_id.as_deref() != Some(film_roll_id));
        Ok(before - photos.len())
    }
}

#[tokio::test]
async fn move_photos_to_roll_sets_their_single_home() {
    let repository = Arc::new(MockPhotoRepository::default());
    repository.add_film_roll("roll-1", "Trip to Europe");
    repository.add_photo("photo-1", None);
    repository.add_photo("photo-2", None);
    let service = PhotoService::new(repository.clone());

    let count = service
        .move_photos(
            &["photo-1".to_string(), "photo-2".to_string()],
            Some("roll-1"),
        )
        .await
        .unwrap();

    assert_eq!(count, 2);
    assert_eq!(
        repository.photo("photo-1").film_roll_id.as_deref(),
        Some("roll-1")
    );
    assert_eq!(
        repository.photo("photo-2").film_roll_id.as_deref(),
        Some("roll-1")
    );
}

#[tokio::test]
async fn move_photos_to_tray_clears_their_roll() {
    let repository = Arc::new(MockPhotoRepository::default());
    repository.add_film_roll("roll-1", "Trip to Europe");
    repository.add_photo("photo-1", Some("roll-1"));
    repository.add_photo("photo-2", Some("roll-1"));
    let service = PhotoService::new(repository.clone());

    let count = service
        .move_photos(&["photo-1".to_string(), "photo-2".to_string()], None)
        .await
        .unwrap();

    assert_eq!(count, 2);
    assert_eq!(repository.photo("photo-1").film_roll_id, None);
    assert_eq!(repository.photo("photo-2").film_roll_id, None);
}

#[tokio::test]
async fn delete_roll_safe_mode_moves_photos_to_tray() {
    let repository = Arc::new(MockPhotoRepository::default());
    repository.add_film_roll("roll-1", "Trip to Europe");
    repository.add_photo("photo-1", Some("roll-1"));
    repository.add_photo("photo-2", Some("roll-1"));
    let service = PhotoService::new(repository.clone());

    let count = service
        .delete_film_roll("roll-1", DeleteFilmRollMode::MovePhotosToTray)
        .await
        .unwrap();

    assert_eq!(count, 1);
    assert!(repository.get_film_roll("roll-1").await.unwrap().is_none());
    assert_eq!(repository.photo("photo-1").film_roll_id, None);
    assert_eq!(repository.photo("photo-2").film_roll_id, None);
}

#[tokio::test]
async fn create_film_roll_defaults_blank_visual_fields() {
    let repository = Arc::new(MockPhotoRepository::default());
    let service = PhotoService::new(repository);

    let roll = service
        .create_film_roll(NewFilmRoll {
            id: Some("roll-1".to_string()),
            name: "  Trip to Europe  ".to_string(),
            film_type_key: Some("".to_string()),
            artwork_key: None,
            sort_order: None,
        })
        .await
        .unwrap();

    assert_eq!(roll.name, "Trip to Europe");
    assert_eq!(roll.film_type_key, DEFAULT_FILM_TYPE_KEY);
    assert_eq!(roll.artwork_key, DEFAULT_ARTWORK_KEY);
}
