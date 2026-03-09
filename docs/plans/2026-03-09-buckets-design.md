# Buckets Design

**Goal:** Add an optional, read-only household bucket allocation layer that users can enable when they want to monitor portfolio distribution against their own bucket framework, without changing existing portfolio behavior when the feature is off.

## Context

Panorama already has strong portfolio, holdings, account, and classification views. The missing piece is not another planning engine. The missing piece is an optional monitoring layer that lets a household compare current reality against a user-defined bucket framework at a glance.

The design must stay modular because this feature may later be reapplied to newer Wealthfolio upstream versions. That makes isolation more important than short-term convenience.

## Product Principles

- `Buckets` is a standalone module.
- The feature is optional and must be safe to disable.
- Bucket logic must not change existing portfolio calculations when disabled.
- Version 1 is visualization and monitoring only.
- Version 1 does not suggest trades, rebalance actions, or planning advice.
- Use the term `bucket` consistently. Do not expose `pot` in product or code.

## Scope

### In Scope

- A global `bucketsEnabled` setting in General settings
- A dedicated `Buckets` settings tab shown only when enabled
- User-defined buckets with:
  - name
  - color
  - sort order
  - target percentage
- A system `Unassigned` bucket
- Account-level default bucket assignment
- Holding-level bucket override for portfolio holdings
- Asset-level bucket assignment for standalone assets
- Bucket labels in:
  - Dashboard account list
  - Holdings `investments` tab
  - Holdings `assets` tab
- A new bucket allocation section inside Insights
- Sync-safe persistence using dedicated database tables

### Out of Scope

- Trade recommendations
- Rebalancing actions
- Bucket-level automation rules
- Goal planning logic
- Simultaneous support for target amount and target percent
- Insurance-specific valuation handling
- Bulk move, drag-and-drop, and advanced assignment tooling in v1

## User-Facing Behavior

### Feature Toggle

- `General` gains a single `Enable Buckets` switch.
- When disabled:
  - `Settings > Buckets` is hidden
  - the bucket section in Insights is hidden
  - bucket labels are hidden across the app
  - all bucket data remains stored
- When enabled:
  - the `Buckets` settings tab appears
  - bucket labels appear in their supported surfaces
  - the bucket section appears in Insights

This preserves the "use it if you want it, ignore it if you don't" requirement.

### Settings Surface

The `Buckets` settings tab is the editing hub for the module. Version 1 keeps editing centralized here instead of scattering bucket controls through account and asset detail forms.

The page should support:

- listing all buckets in display order
- creating and editing buckets
- deleting user buckets
- showing target percentage
- showing how many accounts, holdings, and assets currently resolve into each bucket
- searching and filtering assignable items
- assigning account defaults
- assigning holding overrides
- assigning standalone asset buckets

Deleting a user bucket must not remove data. Existing mappings fall back to `Unassigned`.

### Insights Surface

Insights gains a bucket allocation section. This section should reuse the visual language of existing compact allocation widgets such as risk composition and security types instead of introducing a new design system.

Each bucket row shows:

- current amount
- current percent of included tracked assets
- target percent
- deviation from target

Version 1 stays read-only. No rebalance or trade suggestion UI appears here.

### Labels

Bucket labels are shown as low-emphasis pills:

- account rows in Dashboard
- holding rows in Holdings `investments`
- standalone asset rows in Holdings `assets`

The labels should use a muted style compatible with both light and dark themes. They should feel informative, not dominant. Reuse existing badge/pill styling where practical and tone bucket colors down rather than rendering fully saturated chips.

## Why This Is Not Taxonomy

Existing taxonomy infrastructure is useful as inspiration for UI patterns and allocation presentation, but it should not be reused as the bucket data model.

Taxonomy is asset classification.
Buckets are household allocation policy.

The distinction matters because buckets need:

- account defaults
- holding overrides
- target percentages
- a guaranteed `Unassigned` fallback
- an enable/disable product switch

Those concerns are different enough that forcing buckets into taxonomy would couple unrelated systems and make migration harder later.

## Data Model

Bucket data lives in dedicated tables, not in the existing settings blob and not inside holding records.

### Tables

#### `buckets`

- `id`
- `name`
- `color`
- `sort_order`
- `target_percent`
- `is_system`
- timestamps

The `Unassigned` bucket is represented as a system bucket. It cannot be deleted.

#### `bucket_account_defaults`

- `account_id`
- `bucket_id`
- timestamps

Stores the default bucket for an account.

#### `bucket_holding_overrides`

- `account_id`
- `asset_id`
- `bucket_id`
- timestamps

Stores a bucket override for a specific holding identity. The stable key is `(account_id, asset_id)`.

#### `bucket_asset_assignments`

- `asset_id`
- `bucket_id`
- timestamps

Stores bucket assignment for standalone assets.

## Resolution Rules

### Portfolio Holdings

For investment holdings, bucket resolution is:

1. holding override
2. account default
3. `Unassigned`

This allows a mixed account to keep a sensible account-level default while still overriding selected positions.

### Standalone Assets

For standalone assets, bucket resolution is:

1. asset assignment
2. `Unassigned`

This keeps non-portfolio assets independent from account logic.

### Known Boundary

If the underlying portfolio model does not distinguish certain positions separately, then buckets cannot distinguish them either. For example, if a cash account aggregates multiple internal sleeves into one holding, bucket assignment can only be as granular as the holding identity exposed by the current model.

This is an acceptable v1 limitation and should be documented in-product where appropriate.

## Valuation and Target Logic

- Buckets use the existing market value / current value already surfaced by Panorama.
- Target is percent only in v1.
- Deviation is `current_percent - target_percent`.
- Insurance does not receive special handling in the design. Assume it will later behave like any other asset with a usable value.

## Module Boundary and Portability

The bucket module should remain isolated from unrelated models as much as possible.

### Store Separately

- bucket definitions
- bucket assignment mappings
- bucket aggregation logic
- bucket-specific API commands
- bucket-specific frontend hooks and UI

### Do Not Store In

- the current `Settings` object, except for `bucketsEnabled`
- existing taxonomy tables
- holding snapshots
- ad hoc JSON blobs when a dedicated relational table is available

This separation is the main portability choice. It reduces risk when upstream Wealthfolio changes adjacent models and makes future reapplication of the module safer.

## Sync and Persistence

All bucket definitions and mappings must be database-backed so they participate in the same persistence and sync flows as the rest of the portfolio data.

When the feature is disabled, only the UI disappears. The database state stays intact.

## Frontend Architecture

The frontend should add a dedicated bucket adapter and query layer rather than piggyback on settings or taxonomy hooks.

Likely frontend pieces:

- bucket types in `apps/frontend/src/lib/types.ts`
- bucket query keys in `apps/frontend/src/lib/query-keys.ts`
- bucket adapters in `apps/frontend/src/adapters/shared/`
- bucket hooks in `apps/frontend/src/hooks/`
- a `Buckets` settings page under `apps/frontend/src/pages/settings/`
- bucket label rendering in existing holdings and account list components
- an Insights section reusing compact allocation UI patterns

## Backend Architecture

The backend should add a dedicated bucket domain instead of folding bucket logic into accounts, taxonomies, or settings.

Likely backend pieces:

- core models, traits, and service under `crates/core/src/`
- storage repository and migrations under `crates/storage-sqlite/src/`
- Tauri commands under `apps/tauri/src/commands/`
- Axum routes under `apps/server/src/api/`

The bucket aggregation service should return a pre-resolved breakdown suitable for Insights, plus enough resolved bucket data to render labels in account and holdings surfaces.

## Deletion and Safety Rules

- User buckets may be deleted.
- System `Unassigned` may not be deleted.
- Deleting a bucket sends all affected assignments back to `Unassigned`.
- Disabling the feature must not delete bucket rows or mappings.

## UI Style Constraints

- Keep the UI consistent with current Panorama styling.
- Reuse existing cards, badges, separators, compact strips, and spacing where they fit.
- Keep the new module visually restrained.
- Use a small seeded palette of roughly eight colors.
- Ensure labels and charts remain legible in both light and dark themes.

## Testing Strategy

Testing should cover four layers:

### Data Layer

- migrations
- repository CRUD
- delete-to-unassigned behavior
- uniqueness rules for account, holding, and asset mappings

### Resolution Logic

- holding override precedence over account default
- account default precedence over `Unassigned`
- standalone asset assignment
- stable aggregation totals and ordering

### API Layer

- settings toggle behavior
- bucket CRUD
- assignment CRUD
- Insights allocation response

### Frontend

- tab visibility based on `bucketsEnabled`
- label visibility in supported surfaces
- label hiding when disabled
- correct percent, target, and deviation rendering in Insights
- theme-safe label appearance

## Future Extensions

These are explicitly deferred:

- drag-and-drop bucket ordering in the assignment UI
- multi-select and batch reassignment
- bucket templates beyond simple seeds
- richer analytics or drift history
- trade suggestions or rebalance workflows

The v1 design intentionally leaves room for them without requiring those features now.
