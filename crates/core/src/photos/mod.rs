//! Photo tray and film roll domain.

pub mod photos_model;
pub mod photos_service;
#[cfg(test)]
mod photos_service_tests;
pub mod photos_traits;

pub use photos_model::*;
pub use photos_service::*;
pub use photos_traits::*;
