use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use panorama_core::photos::{
    DeleteFilmRollMode, FilmRoll, FilmRollSummary, NewFilmRoll, NewPhoto, Photo, TrayItem,
    UpdateFilmRoll,
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MovePhotosRequest {
    photo_ids: Vec<String>,
    destination_film_roll_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteFilmRollRequest {
    mode: DeleteFilmRollMode,
}

async fn list_tray_items(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<TrayItem>>> {
    Ok(Json(state.photo_service.list_tray_items().await?))
}

async fn list_film_rolls(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<FilmRollSummary>>> {
    Ok(Json(state.photo_service.list_film_rolls().await?))
}

async fn get_film_roll(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Option<FilmRoll>>> {
    Ok(Json(state.photo_service.get_film_roll(&id).await?))
}

async fn list_film_roll_photos(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<Photo>>> {
    Ok(Json(state.photo_service.list_film_roll_photos(&id).await?))
}

async fn create_photo(
    State(state): State<Arc<AppState>>,
    Json(input): Json<NewPhoto>,
) -> ApiResult<Json<Photo>> {
    Ok(Json(state.photo_service.create_photo(input).await?))
}

async fn create_film_roll(
    State(state): State<Arc<AppState>>,
    Json(input): Json<NewFilmRoll>,
) -> ApiResult<Json<FilmRoll>> {
    Ok(Json(state.photo_service.create_film_roll(input).await?))
}

async fn update_film_roll(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(patch): Json<UpdateFilmRoll>,
) -> ApiResult<Json<FilmRoll>> {
    Ok(Json(
        state.photo_service.update_film_roll(&id, patch).await?,
    ))
}

async fn delete_film_roll(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(request): Json<DeleteFilmRollRequest>,
) -> ApiResult<StatusCode> {
    let _ = state
        .photo_service
        .delete_film_roll(&id, request.mode)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn move_photos(
    State(state): State<Arc<AppState>>,
    Json(request): Json<MovePhotosRequest>,
) -> ApiResult<StatusCode> {
    let _ = state
        .photo_service
        .move_photos(
            &request.photo_ids,
            request.destination_film_roll_id.as_deref(),
        )
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/tray/items", get(list_tray_items))
        .route("/photos", post(create_photo))
        .route("/photos/move", post(move_photos))
        .route("/film-rolls", get(list_film_rolls).post(create_film_roll))
        .route(
            "/film-rolls/{id}",
            get(get_film_roll)
                .patch(update_film_roll)
                .delete(delete_film_roll),
        )
        .route("/film-rolls/{id}/photos", get(list_film_roll_photos))
}
