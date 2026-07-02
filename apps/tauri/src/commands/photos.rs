use std::sync::Arc;

use crate::context::ServiceContext;
use log::debug;
use panorama_core::photos::{
    DeleteFilmRollMode, FilmRoll, FilmRollSummary, NewFilmRoll, NewPhoto, Photo, TrayItem,
    UpdateFilmRoll,
};
use tauri::State;

#[tauri::command]
pub async fn list_tray_items(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<TrayItem>, String> {
    debug!("Listing tray items...");
    state
        .photo_service()
        .list_tray_items()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_film_rolls(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<FilmRollSummary>, String> {
    debug!("Listing film rolls...");
    state
        .photo_service()
        .list_film_rolls()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_film_roll(
    film_roll_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<FilmRoll>, String> {
    debug!("Fetching film roll...");
    state
        .photo_service()
        .get_film_roll(&film_roll_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_film_roll_photos(
    film_roll_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Photo>, String> {
    debug!("Listing film roll photos...");
    state
        .photo_service()
        .list_film_roll_photos(&film_roll_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_photo(
    input: NewPhoto,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Photo, String> {
    debug!("Creating photo...");
    state
        .photo_service()
        .create_photo(input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_film_roll(
    input: NewFilmRoll,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<FilmRoll, String> {
    debug!("Creating film roll...");
    state
        .photo_service()
        .create_film_roll(input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_film_roll(
    film_roll_id: String,
    patch: UpdateFilmRoll,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<FilmRoll, String> {
    debug!("Updating film roll...");
    state
        .photo_service()
        .update_film_roll(&film_roll_id, patch)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_film_roll(
    film_roll_id: String,
    mode: DeleteFilmRollMode,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!("Deleting film roll...");
    state
        .photo_service()
        .delete_film_roll(&film_roll_id, mode)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn move_photos(
    photo_ids: Vec<String>,
    destination_film_roll_id: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    debug!("Moving photos...");
    state
        .photo_service()
        .move_photos(&photo_ids, destination_film_roll_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}
