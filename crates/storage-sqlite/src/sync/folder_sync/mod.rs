//! SQLite storage for local-only folder sync metadata.

pub mod model;
pub mod repository;

pub use repository::{
    FolderSyncConfigRecord, FolderSyncHistoryEntryRecord, FolderSyncRepository,
    FolderSyncStatusRecord, FolderSyncStatusUpdate,
};
