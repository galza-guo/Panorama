# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.0] - 2026-06-06

### Added

- **Database Migration**: Added a migration to support `TIME_DEPOSIT` and
  `INSURANCE` asset kinds, automatically converting existing custom `OTHER`
  assets if their metadata contains indicators (such as start/maturity dates,
  principal, insurance provider, policy type, etc.).
- **Backend Core Support**: Implemented core models, traits, services, and
  repository layers for alternative assets in `crates/core` and
  `crates/storage-sqlite`.
- **Tauri & Server API**: Added Tauri commands and Axum HTTP endpoints to handle
  queries and mutations for the new asset kinds.
- **Specialized UI Editors**: Created dedicated input sheets for creating and
  editing `Time Deposit` and `Insurance Policy` assets with real-time rate and
  maturity calculations.
- **Dashboards**: Added brand new dashboards for Time Deposits and Insurance to
  display detailed summaries, status details, and financial highlights.
- **Health Checks & Listeners**: Expanded the global asset health status checks
  and listeners to handle edge cases and fix patterns for alternative assets.
- **Comprehensive Tests**: Added thorough unit and integration test coverage for
  both backend database repositories and frontend React components.
