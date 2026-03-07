//! Application services for the Tauri app.

mod connect_service;
#[allow(dead_code)]
pub mod folder_sync_exporter;
#[allow(dead_code)]
pub mod folder_sync_fs;

pub use connect_service::{cloud_api_base_url, ConnectService};
