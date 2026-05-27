//! Local external connector domain models and traits.

mod connectors_model;
mod connectors_traits;

pub use connectors_model::*;
pub use connectors_traits::*;

#[cfg(test)]
mod connectors_model_tests;
