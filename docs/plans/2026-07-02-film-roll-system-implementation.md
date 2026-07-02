# Film Roll System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Build the v1 film roll system: a mixed tray with loose photos and film
roll objects, plus a focused tray view inside one roll.

**Architecture:** Core owns the rule that each photo has one home: loose tray or
one film roll. SQLite persists film rolls and each photo's nullable
`film_roll_id`. Tauri and web expose the same small command surface, and the
frontend reuses one tray view with either top-level scope or film-roll scope.

**Tech Stack:** Rust, Diesel, SQLite, Tauri commands, Axum web API, React, Vite,
Tailwind v4, shadcn, TanStack Query, Vitest.

---

## Important Context

The current checkout does not expose a committed tray/photo module under names
such as `tray`, `photo`, `picture`, or `library`. Before implementation, locate
the real tray/photo code in the target branch. If it exists, adapt the file
paths below to the existing module. If it does not exist, use the new paths in
this plan.

Do not create film rolls inside film rolls. There should be no `parent_id` on
film rolls. Only photos can point at a film roll.

## Implementation Path Notes

- Tray page: none found in this checkout; create
  `/Users/guolite/GitHub/Panorama/apps/frontend/src/pages/tray/tray-page.tsx`.
- Photo model: none found in this checkout; create
  `/Users/guolite/GitHub/Panorama/crates/core/src/photos/photos_model.rs`.
- Photo repository: none found in this checkout; create
  `/Users/guolite/GitHub/Panorama/crates/storage-sqlite/src/photos/repository.rs`.
- Import flow: none found in this checkout; v1 implementation should include
  minimal photo creation/listing surfaces needed to exercise film roll
  organization.

## Task 1: Locate Existing Tray And Photo Boundaries

**Files:**

- Read: `/Users/guolite/GitHub/Panorama/apps/frontend/src`
- Read: `/Users/guolite/GitHub/Panorama/crates/core/src`
- Read: `/Users/guolite/GitHub/Panorama/crates/storage-sqlite/src`

**Step 1: Search for tray/photo code**

Run:

```bash
rg -n "tray|photo|picture|scan|library|album|image" apps/frontend/src crates apps/tauri/src apps/server/src -g '!target'
```

Expected: identify the real tray page, photo model, photo repository, and import
flow. If there are no matches, continue with the new module paths in later
tasks.

**Step 2: Write down the resolved paths**

Add a short implementation note to the top of this plan before coding:

```markdown
## Implementation Path Notes

- Tray page: `<resolved path>`
- Photo model: `<resolved path>`
- Photo repository: `<resolved path>`
- Import flow: `<resolved path>`
```

**Step 3: Do not change behavior yet**

Run:

```bash
git status --short
```

Expected: no product code changes from this task.

## Task 2: Add Core Film Roll Model And Rules

**Files:**

- Create: `/Users/guolite/GitHub/Panorama/crates/core/src/photos/mod.rs`
- Create:
  `/Users/guolite/GitHub/Panorama/crates/core/src/photos/photos_model.rs`
- Create:
  `/Users/guolite/GitHub/Panorama/crates/core/src/photos/photos_traits.rs`
- Create:
  `/Users/guolite/GitHub/Panorama/crates/core/src/photos/photos_service.rs`
- Create:
  `/Users/guolite/GitHub/Panorama/crates/core/src/photos/photos_service_tests.rs`
- Modify: `/Users/guolite/GitHub/Panorama/crates/core/src/lib.rs`

If a photo module already exists, add the film roll types there instead of
creating a parallel module.

**Step 1: Write the failing service tests**

Create `photos_service_tests.rs` with tests for:

```rust
#[tokio::test]
async fn move_photos_to_roll_sets_their_single_home() {
    // Given two loose photos and one film roll
    // When move_photos(photo_ids, Some(roll_id)) runs
    // Then both photos have film_roll_id = Some(roll_id)
}

#[tokio::test]
async fn move_photos_to_tray_clears_their_roll() {
    // Given two photos inside a film roll
    // When move_photos(photo_ids, None) runs
    // Then both photos have film_roll_id = None
}

#[tokio::test]
async fn delete_roll_safe_mode_moves_photos_to_tray() {
    // Given a film roll with photos
    // When delete_film_roll(roll_id, MovePhotosToTray) runs
    // Then the roll is gone and photos remain with film_roll_id = None
}
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cargo test -p panorama-core photos::photos_service_tests
```

Expected: FAIL because the module and service do not exist yet.

**Step 3: Add model types**

Add minimal model types:

```rust
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct FilmRoll {
    pub id: String,
    pub name: String,
    pub film_type_key: String,
    pub artwork_key: String,
    pub sort_order: i32,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct NewFilmRoll {
    pub name: String,
    pub film_type_key: Option<String>,
    pub artwork_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum DeleteFilmRollMode {
    MovePhotosToTray,
    DeletePhotos,
}
```

**Step 4: Add repository trait**

Define only the operations v1 needs:

```rust
#[async_trait::async_trait]
pub trait PhotoRepository: Send + Sync {
    async fn list_film_rolls(&self) -> crate::Result<Vec<FilmRoll>>;
    async fn create_film_roll(&self, input: NewFilmRoll) -> crate::Result<FilmRoll>;
    async fn update_film_roll(&self, roll: FilmRoll) -> crate::Result<FilmRoll>;
    async fn delete_film_roll_record(&self, film_roll_id: &str) -> crate::Result<usize>;
    async fn set_photo_film_roll(
        &self,
        photo_ids: &[String],
        film_roll_id: Option<&str>,
    ) -> crate::Result<usize>;
    async fn delete_photos_in_roll(&self, film_roll_id: &str) -> crate::Result<usize>;
}
```

**Step 5: Add service methods**

Implement a small service that:

- defaults missing `film_type_key` and `artwork_key`
- moves photos by setting one nullable roll reference
- deletes rolls safely by clearing photo assignments first
- never accepts a film roll as a move source or destination object

**Step 6: Wire module export**

In `crates/core/src/lib.rs`, add:

```rust
pub mod photos;
```

**Step 7: Run tests**

Run:

```bash
cargo test -p panorama-core photos::photos_service_tests
```

Expected: PASS.

## Task 3: Add SQLite Migration And Repository

**Files:**

- Create:
  `/Users/guolite/GitHub/Panorama/crates/storage-sqlite/migrations/2026-07-02-000001_film_rolls/up.sql`
- Create:
  `/Users/guolite/GitHub/Panorama/crates/storage-sqlite/migrations/2026-07-02-000001_film_rolls/down.sql`
- Create:
  `/Users/guolite/GitHub/Panorama/crates/storage-sqlite/src/photos/mod.rs`
- Create:
  `/Users/guolite/GitHub/Panorama/crates/storage-sqlite/src/photos/model.rs`
- Create:
  `/Users/guolite/GitHub/Panorama/crates/storage-sqlite/src/photos/repository.rs`
- Modify: `/Users/guolite/GitHub/Panorama/crates/storage-sqlite/src/lib.rs`
- Modify: `/Users/guolite/GitHub/Panorama/crates/storage-sqlite/src/schema.rs`

If a photo table already exists, alter it. If not, add the film roll field to
the existing photo persistence table in the target branch.

**Step 1: Write migration**

`up.sql`:

```sql
CREATE TABLE film_rolls (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  film_type_key TEXT NOT NULL DEFAULT 'classic-color',
  artwork_key TEXT NOT NULL DEFAULT 'classic-color',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE photos ADD COLUMN film_roll_id TEXT REFERENCES film_rolls(id) ON DELETE SET NULL;
CREATE INDEX idx_photos_film_roll_id ON photos(film_roll_id);
CREATE INDEX idx_film_rolls_sort_order ON film_rolls(sort_order);
```

If the actual photo table has another name, replace `photos` with that table.

`down.sql`:

```sql
DROP INDEX IF EXISTS idx_film_rolls_sort_order;
DROP INDEX IF EXISTS idx_photos_film_roll_id;
DROP TABLE IF EXISTS film_rolls;
```

SQLite cannot reliably drop the added `film_roll_id` column on older versions.
Follow the repository's existing migration style if it rebuilds tables for down
migrations.

**Step 2: Generate or update schema**

Run the repository's Diesel schema update command if one exists. If not, update
`schema.rs` following nearby generated table definitions.

**Step 3: Add repository tests**

Add tests near `crates/storage-sqlite/src/photos/repository.rs` for:

- creating and listing film rolls
- assigning photos to a roll
- clearing photos back to tray
- deleting a roll with photos leaves photos loose

**Step 4: Run storage tests**

Run:

```bash
cargo test -p panorama-storage-sqlite photos
```

Expected: PASS.

## Task 4: Expose Film Roll Commands In Desktop And Web

**Files:**

- Create: `/Users/guolite/GitHub/Panorama/apps/tauri/src/commands/photos.rs`
- Modify: `/Users/guolite/GitHub/Panorama/apps/tauri/src/commands/mod.rs`
- Modify: `/Users/guolite/GitHub/Panorama/apps/tauri/src/lib.rs`
- Create: `/Users/guolite/GitHub/Panorama/apps/server/src/api/photos.rs`
- Modify: `/Users/guolite/GitHub/Panorama/apps/server/src/api.rs`
- Modify: service context file resolved in Task 1, likely
  `/Users/guolite/GitHub/Panorama/apps/tauri/src/context.rs` and
  `/Users/guolite/GitHub/Panorama/apps/server/src/main_lib.rs`

**Step 1: Add Tauri command tests if the project has command tests**

If command tests exist nearby, add thin tests that assert requests map to
service calls. If command tests are not used in this repo, skip and cover
behavior at service/repository level.

**Step 2: Add Tauri commands**

Expose:

```rust
#[tauri::command]
pub async fn list_film_rolls(state: tauri::State<'_, Arc<ServiceContext>>) -> Result<Vec<FilmRoll>, String>;

#[tauri::command]
pub async fn create_film_roll(
    state: tauri::State<'_, Arc<ServiceContext>>,
    input: NewFilmRoll,
) -> Result<FilmRoll, String>;

#[tauri::command]
pub async fn update_film_roll(
    state: tauri::State<'_, Arc<ServiceContext>>,
    film_roll: FilmRoll,
) -> Result<FilmRoll, String>;

#[tauri::command]
pub async fn delete_film_roll(
    state: tauri::State<'_, Arc<ServiceContext>>,
    film_roll_id: String,
    mode: DeleteFilmRollMode,
) -> Result<(), String>;

#[tauri::command]
pub async fn move_photos(
    state: tauri::State<'_, Arc<ServiceContext>>,
    photo_ids: Vec<String>,
    destination_film_roll_id: Option<String>,
) -> Result<(), String>;
```

**Step 3: Register Tauri commands**

Add `pub mod photos;` in `apps/tauri/src/commands/mod.rs`.

Add the commands to `tauri::generate_handler!` in `apps/tauri/src/lib.rs`.

**Step 4: Add Axum routes**

Expose routes under `/photos` or `/tray`, matching the existing API naming
style:

```text
GET    /film-rolls
POST   /film-rolls
PATCH  /film-rolls/:id
DELETE /film-rolls/:id
POST   /photos/move
```

**Step 5: Register web router**

In `apps/server/src/api.rs`, add:

```rust
mod photos;
```

and merge:

```rust
.merge(photos::router())
```

**Step 6: Run backend checks**

Run:

```bash
cargo check -p panorama-app
cargo check -p panorama-server
```

Expected: PASS.

## Task 5: Add Frontend Adapter Functions

**Files:**

- Create:
  `/Users/guolite/GitHub/Panorama/apps/frontend/src/adapters/shared/photos.ts`
- Modify:
  `/Users/guolite/GitHub/Panorama/apps/frontend/src/adapters/tauri/index.ts`
- Modify:
  `/Users/guolite/GitHub/Panorama/apps/frontend/src/adapters/web/index.ts`
- Modify: `/Users/guolite/GitHub/Panorama/apps/frontend/src/lib/query-keys.ts`

**Step 1: Write adapter tests**

Create tests next to the shared adapter if the current adapter pattern supports
mocked platform calls. Test that:

- `movePhotos(["a"], "roll-1")` sends destination roll ID
- `movePhotos(["a"], null)` sends null
- `deleteFilmRoll("roll-1", "MovePhotosToTray")` sends safe mode

**Step 2: Add shared types**

Add:

```ts
export interface FilmRoll {
  id: string;
  name: string;
  filmTypeKey: string;
  artworkKey: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewFilmRoll {
  name: string;
  filmTypeKey?: string;
  artworkKey?: string;
}

export type DeleteFilmRollMode = "MovePhotosToTray" | "DeletePhotos";
```

**Step 3: Add shared functions**

Add:

```ts
export async function listFilmRolls(): Promise<FilmRoll[]>;
export async function createFilmRoll(input: NewFilmRoll): Promise<FilmRoll>;
export async function updateFilmRoll(input: FilmRoll): Promise<FilmRoll>;
export async function deleteFilmRoll(
  id: string,
  mode: DeleteFilmRollMode,
): Promise<void>;
export async function movePhotos(
  photoIds: string[],
  destinationFilmRollId: string | null,
): Promise<void>;
```

Follow the existing shared adapter style for `RUN_ENV`.

**Step 4: Re-export adapters**

Re-export the shared module from both:

- `apps/frontend/src/adapters/tauri/index.ts`
- `apps/frontend/src/adapters/web/index.ts`

**Step 5: Add query keys**

Add keys for:

- film rolls
- top-level tray items
- film roll photos

**Step 6: Run frontend tests**

Run:

```bash
pnpm --filter frontend test -- photos
pnpm --filter frontend type-check
```

Expected: PASS.

## Task 6: Build Reusable Tray Scope UI

**Files:**

- Create or modify resolved tray page from Task 1
- Create:
  `/Users/guolite/GitHub/Panorama/apps/frontend/src/features/tray/components/film-roll-card.tsx`
- Create:
  `/Users/guolite/GitHub/Panorama/apps/frontend/src/features/tray/components/film-roll-editor-sheet.tsx`
- Create:
  `/Users/guolite/GitHub/Panorama/apps/frontend/src/features/tray/components/move-photos-dialog.tsx`
- Create:
  `/Users/guolite/GitHub/Panorama/apps/frontend/src/features/tray/components/tray-selection-toolbar.tsx`
- Create:
  `/Users/guolite/GitHub/Panorama/apps/frontend/src/features/tray/hooks/use-film-rolls.ts`
- Create:
  `/Users/guolite/GitHub/Panorama/apps/frontend/src/features/tray/hooks/use-move-photos.ts`

If the tray already has feature folders, place these components there instead.

**Step 1: Write UI tests**

Add tests for:

- top-level tray renders film roll cards and loose photos
- film roll view title is the roll name
- film roll view has `Back to Tray`
- clicking `Move to Film Roll` opens the move dialog
- selecting `Tray` inside a roll moves selected photos out

**Step 2: Add `TrayView` scope**

Refactor the tray into one reusable view:

```ts
interface TrayViewProps {
  scope: "tray" | "filmRoll";
  filmRollId?: string;
  title: string;
  showBackToTray?: boolean;
}
```

Top-level scope loads loose photos plus film rolls.

Film-roll scope loads only photos for `filmRollId`.

**Step 3: Add film roll card**

Render:

- roll artwork
- roll name
- photo count
- quiet overflow menu

Use a normal button or link wrapper so the card is keyboard accessible.

**Step 4: Add create/edit sheet**

Fields:

- name
- film type/artwork select

Keep the default film type selected automatically.

**Step 5: Add move dialog**

Show:

- existing film rolls
- `Tray` only when moving out of a film roll

Disable the current roll as a destination when already inside that roll.

**Step 6: Add drag/drop onto film roll cards**

When selected photos are dragged onto a film roll card, call:

```ts
movePhotos(selectedPhotoIds, filmRoll.id);
```

On success, invalidate tray and film roll queries.

**Step 7: Run UI tests**

Run:

```bash
pnpm --filter frontend test -- tray
```

Expected: PASS.

## Task 7: Route And Navigation

**Files:**

- Modify: `/Users/guolite/GitHub/Panorama/apps/frontend/src/routes.tsx`
- Modify: resolved navigation file if tray is already in app navigation

**Step 1: Add route shape**

Use:

```text
/tray
/tray/rolls/:filmRollId
```

If the existing tray route already has a path, keep that path and add only the
nested film roll route.

**Step 2: Implement back navigation**

Inside film roll scope, `Back to Tray` navigates to `/tray`.

No breadcrumb is required for v1.

**Step 3: Test route rendering**

Add a route test if the app has route tests. Otherwise verify manually in dev
server.

Run:

```bash
pnpm --filter frontend type-check
```

Expected: PASS.

## Task 8: Verification Pass

**Files:**

- No new files unless tests expose a missing edge case.

**Step 1: Run Rust checks**

Run:

```bash
cargo test
cargo check
```

Expected: PASS.

**Step 2: Run frontend checks**

Run:

```bash
pnpm test
pnpm type-check
```

Expected: PASS.

**Step 3: Manual desktop smoke test**

Run:

```bash
pnpm tauri dev
```

Verify:

- create a film roll
- import or use existing loose photos
- move selected photos to the roll
- open the roll
- move photos back to tray
- delete the roll and keep photos

**Step 4: Manual web smoke test**

Run:

```bash
pnpm run dev:web
```

Verify the same flow in web mode.

**Step 5: Commit**

Commit in small groups:

```bash
git add crates/core crates/storage-sqlite
git commit -m "feat: add film roll domain model"

git add apps/tauri apps/server apps/frontend/src/adapters
git commit -m "feat: expose film roll commands"

git add apps/frontend/src/features apps/frontend/src/pages apps/frontend/src/routes.tsx
git commit -m "feat: add film roll tray UI"
```

Expected: commits contain only related film roll work.
