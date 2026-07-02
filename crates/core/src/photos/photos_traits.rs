use async_trait::async_trait;

use crate::errors::Result;

use super::{
    DeleteFilmRollMode, FilmRoll, FilmRollSummary, NewFilmRoll, NewPhoto, Photo, TrayItem,
    UpdateFilmRoll,
};

#[async_trait]
pub trait PhotoRepositoryTrait: Send + Sync {
    async fn list_tray_items(&self) -> Result<Vec<TrayItem>>;
    async fn list_film_rolls(&self) -> Result<Vec<FilmRollSummary>>;
    async fn get_film_roll(&self, film_roll_id: &str) -> Result<Option<FilmRoll>>;
    async fn list_loose_photos(&self) -> Result<Vec<Photo>>;
    async fn list_film_roll_photos(&self, film_roll_id: &str) -> Result<Vec<Photo>>;
    async fn create_photo(&self, input: NewPhoto) -> Result<Photo>;
    async fn create_film_roll(&self, input: NewFilmRoll) -> Result<FilmRoll>;
    async fn update_film_roll(&self, film_roll_id: &str, patch: UpdateFilmRoll)
        -> Result<FilmRoll>;
    async fn delete_film_roll_record(&self, film_roll_id: &str) -> Result<usize>;
    async fn set_photo_film_roll(
        &self,
        photo_ids: &[String],
        film_roll_id: Option<&str>,
    ) -> Result<usize>;
    async fn delete_photos_in_roll(&self, film_roll_id: &str) -> Result<usize>;
}

#[async_trait]
pub trait PhotoServiceTrait: Send + Sync {
    async fn list_tray_items(&self) -> Result<Vec<TrayItem>>;
    async fn list_film_rolls(&self) -> Result<Vec<FilmRollSummary>>;
    async fn get_film_roll(&self, film_roll_id: &str) -> Result<Option<FilmRoll>>;
    async fn list_loose_photos(&self) -> Result<Vec<Photo>>;
    async fn list_film_roll_photos(&self, film_roll_id: &str) -> Result<Vec<Photo>>;
    async fn create_photo(&self, input: NewPhoto) -> Result<Photo>;
    async fn create_film_roll(&self, input: NewFilmRoll) -> Result<FilmRoll>;
    async fn update_film_roll(&self, film_roll_id: &str, patch: UpdateFilmRoll)
        -> Result<FilmRoll>;
    async fn delete_film_roll(&self, film_roll_id: &str, mode: DeleteFilmRollMode)
        -> Result<usize>;
    async fn move_photos(
        &self,
        photo_ids: &[String],
        destination_film_roll_id: Option<&str>,
    ) -> Result<usize>;
}
