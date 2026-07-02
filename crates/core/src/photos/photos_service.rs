use async_trait::async_trait;
use std::sync::Arc;

use crate::errors::{Result, ValidationError};

use super::{
    DeleteFilmRollMode, FilmRoll, FilmRollSummary, NewFilmRoll, NewPhoto, Photo,
    PhotoRepositoryTrait, PhotoServiceTrait, TrayItem, UpdateFilmRoll, DEFAULT_ARTWORK_KEY,
    DEFAULT_FILM_TYPE_KEY,
};

pub struct PhotoService {
    repository: Arc<dyn PhotoRepositoryTrait>,
}

impl PhotoService {
    pub fn new(repository: Arc<dyn PhotoRepositoryTrait>) -> Self {
        Self { repository }
    }

    fn normalize_new_film_roll(input: NewFilmRoll) -> Result<NewFilmRoll> {
        let name = input.name.trim().to_string();
        if name.is_empty() {
            return Err(ValidationError::MissingField("name".to_string()).into());
        }

        Ok(NewFilmRoll {
            id: input.id,
            name,
            film_type_key: Some(
                input
                    .film_type_key
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| DEFAULT_FILM_TYPE_KEY.to_string()),
            ),
            artwork_key: Some(
                input
                    .artwork_key
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| DEFAULT_ARTWORK_KEY.to_string()),
            ),
            sort_order: input.sort_order,
        })
    }

    fn normalize_film_roll_patch(patch: UpdateFilmRoll) -> Result<UpdateFilmRoll> {
        let name = match patch.name {
            Some(name) => {
                let trimmed = name.trim().to_string();
                if trimmed.is_empty() {
                    return Err(ValidationError::MissingField("name".to_string()).into());
                }
                Some(trimmed)
            }
            None => None,
        };

        Ok(UpdateFilmRoll { name, ..patch })
    }
}

#[async_trait]
impl PhotoServiceTrait for PhotoService {
    async fn list_tray_items(&self) -> Result<Vec<TrayItem>> {
        self.repository.list_tray_items().await
    }

    async fn list_film_rolls(&self) -> Result<Vec<FilmRollSummary>> {
        self.repository.list_film_rolls().await
    }

    async fn get_film_roll(&self, film_roll_id: &str) -> Result<Option<FilmRoll>> {
        self.repository.get_film_roll(film_roll_id).await
    }

    async fn list_loose_photos(&self) -> Result<Vec<Photo>> {
        self.repository.list_loose_photos().await
    }

    async fn list_film_roll_photos(&self, film_roll_id: &str) -> Result<Vec<Photo>> {
        self.repository.list_film_roll_photos(film_roll_id).await
    }

    async fn create_photo(&self, input: NewPhoto) -> Result<Photo> {
        self.repository.create_photo(input).await
    }

    async fn create_film_roll(&self, input: NewFilmRoll) -> Result<FilmRoll> {
        self.repository
            .create_film_roll(Self::normalize_new_film_roll(input)?)
            .await
    }

    async fn update_film_roll(
        &self,
        film_roll_id: &str,
        patch: UpdateFilmRoll,
    ) -> Result<FilmRoll> {
        self.repository
            .update_film_roll(film_roll_id, Self::normalize_film_roll_patch(patch)?)
            .await
    }

    async fn delete_film_roll(
        &self,
        film_roll_id: &str,
        mode: DeleteFilmRollMode,
    ) -> Result<usize> {
        match mode {
            DeleteFilmRollMode::MovePhotosToTray => {
                self.repository
                    .set_photo_film_roll_for_roll(film_roll_id, None)
                    .await?;
            }
            DeleteFilmRollMode::DeletePhotos => {
                self.repository.delete_photos_in_roll(film_roll_id).await?;
            }
        }

        self.repository.delete_film_roll_record(film_roll_id).await
    }

    async fn move_photos(
        &self,
        photo_ids: &[String],
        destination_film_roll_id: Option<&str>,
    ) -> Result<usize> {
        if photo_ids.is_empty() {
            return Ok(0);
        }

        self.repository
            .set_photo_film_roll(photo_ids, destination_film_roll_id)
            .await
    }
}

#[async_trait]
trait PhotoRepositoryRollMoveExt {
    async fn set_photo_film_roll_for_roll(
        &self,
        source_film_roll_id: &str,
        destination_film_roll_id: Option<&str>,
    ) -> Result<usize>;
}

#[async_trait]
impl PhotoRepositoryRollMoveExt for Arc<dyn PhotoRepositoryTrait> {
    async fn set_photo_film_roll_for_roll(
        &self,
        source_film_roll_id: &str,
        destination_film_roll_id: Option<&str>,
    ) -> Result<usize> {
        let photos = self.list_film_roll_photos(source_film_roll_id).await?;
        let photo_ids = photos
            .iter()
            .map(|photo| photo.id.clone())
            .collect::<Vec<_>>();

        if photo_ids.is_empty() {
            return Ok(0);
        }

        self.set_photo_film_roll(&photo_ids, destination_film_roll_id)
            .await
    }
}
