# Film Roll System Design

**Goal:** Add a simple film roll organization system to the tray so users can
keep loose photos at the top level or place photos inside one named film roll.

## Context

The current tray concept is flat: imported pictures all sit directly in one
place. That is easy to understand at small scale, but harder to browse once a
user has many scans.

The film roll system adds one light layer of organization. It should feel like
using real rolls of film or simple folders, not like managing a technical file
system.

## Product Decision

Version 1 uses a mixed tray model:

- The top-level tray shows loose photos and film roll objects together.
- A photo has exactly one home: loose in the tray or inside one film roll.
- Film rolls cannot contain other film rolls.
- Opening a film roll shows the same tray view, focused only on that roll.
- The screen title inside a roll is the roll name.
- The only required navigation is a `Back to Tray` button.
- The film-strip slide-out animation is reserved for a later version.

This keeps the first release understandable while leaving room for a more
physical, playful interaction later.

## User Model

Users should be able to think about the system in plain terms:

- Tray: the top-level desk where everything starts.
- Loose photo: a photo that has not been filed into a roll.
- Film roll: a named group of photos.
- Inside a roll: the same tray experience, just narrowed to that roll.

The product should avoid exposing terms such as collection IDs, parent IDs, or
metadata in the interface.

## V1 Scope

### In Scope

- Create a film roll.
- Rename a film roll.
- Edit a film roll's visual type or artwork.
- Delete a film roll.
- Show film rolls and loose photos together in the top-level tray.
- Open a film roll into a focused tray view.
- Select photos and move them to a film roll.
- Select photos inside a film roll and move them back to the tray.
- Drag selected photos onto a film roll to move them there.
- Prevent film rolls from being placed inside film rolls.

### Out of Scope

- Film rolls inside film rolls.
- One photo appearing in multiple film rolls.
- Tags, smart albums, or saved searches.
- Slide-out film strip animation.
- Complex custom film stock management.
- Sync-specific behavior beyond normal local data persistence.

## UX Design

### Top-Level Tray

The top-level tray title remains `Tray`.

It shows two item types in one surface:

- Film roll cards.
- Loose photo thumbnails.

Film roll cards should be visually distinct from photos, using roll artwork,
the roll name, and a small photo count. They should still sit naturally in the
same grid or tray layout.

Recommended film roll card content:

- Roll artwork.
- Roll name.
- Photo count, for example `24 photos`.
- Subtle overflow menu for rename, edit, and delete.

### Film Roll View

Opening a roll should not feel like entering a separate feature. It reuses the
tray layout with a narrower source of photos.

The view contains:

- Title: the film roll name.
- A simple `Back to Tray` button.
- The same photo grid, selection behavior, and photo actions as the tray.

The top-level tray shows loose photos and film rolls. A roll view shows only
photos in that roll.

### Creating A Film Roll

Creation should use a compact sheet or dialog.

Required field:

- Name.

Optional visual field:

- Film type or artwork.

The default should be tasteful and automatic, so users can create a roll
quickly without choosing from a long catalog.

### Editing A Film Roll

Editing should use the same surface as creation.

Editable fields:

- Name.
- Film type or artwork.

For v1, film type is visual only. It should not affect photo processing,
color, sorting, or metadata behavior.

### Moving Photos

Users can move photos through two paths.

First path: select photos, then use a top-right action such as `Move to Film
Roll`.

Second path: drag selected photos onto a film roll card.

The move target picker should include:

- Existing film rolls.
- `Tray`, when the selected photos are currently inside a roll.

If photos from different locations are selected in a future multi-scope view,
the same rule still applies: each photo ends with exactly one destination.

### Deleting A Film Roll

Deleting a film roll should be safe by default.

Recommended default behavior:

- Delete the film roll.
- Move its photos back to the tray.

If destructive photo deletion exists in the surrounding product, it can be
offered as a clearly separated destructive option:

- Delete film roll and photos.

The default confirmation copy should make clear that photos are kept.

### Import Behavior

Imported photos should land loose in the tray by default.

This keeps import fast and avoids asking users to organize before they have
seen what was imported. Users can file photos into film rolls afterward through
selection or drag and drop.

## Visual Direction

The UI should stay minimalist and calm.

Film roll artwork gives the feature its personality, so the surrounding
controls should stay restrained. Avoid a dense sidebar or heavy management
screen in v1.

Recommended visual rules:

- Use real-looking PNG or rendered film roll assets for roll cards.
- Keep roll card controls quiet until hover or selection.
- Prefer one primary action for creating a roll.
- Keep the move flow short and searchable if many rolls exist.
- Keep labels human: `Move to Film Roll`, `Back to Tray`, `New Film Roll`.

The app can ship with a small built-in set of generic film-inspired types. If
real brand-like artwork is used, confirm licensing before shipping. Otherwise,
use original artwork inspired by film categories rather than exact commercial
labels.

## Data Model

At the storage level, the model is intentionally simple.

Add a `film_rolls` entity:

- `id`
- `name`
- `film_type_key`
- `artwork_key`
- `sort_order`
- `created_at`
- `updated_at`

Add a nullable film roll reference to photos:

- `film_roll_id`

When `film_roll_id` is null, the photo is loose in the tray.

When `film_roll_id` is set, the photo belongs to that roll.

Do not add a parent field to film rolls. That omission is the enforcement of
the one-level rule.

If the existing tray already has ordering, keep using it. If it does not, add
ordering only where the current tray needs it, not as a separate v1 feature.

## Command Surface

The frontend should call a small set of focused operations:

- `listTrayItems()`
- `listFilmRollPhotos(filmRollId)`
- `createFilmRoll(input)`
- `updateFilmRoll(filmRollId, patch)`
- `deleteFilmRoll(filmRollId, mode)`
- `movePhotos(photoIds, destinationFilmRollId)`

`destinationFilmRollId` should be nullable. Null means move photos back to the
top-level tray.

The same command shape should be available in desktop and web mode, following
the existing adapter pattern.

## Frontend Structure

The tray should be implemented as one reusable view with a scope.

Suggested shape:

- `TrayView`
  - `scope: "tray" | "filmRoll"`
  - `filmRollId?: string`
  - `title`
  - `showBackToTray`

Top-level tray scope:

- Load loose photos.
- Load film roll cards.
- Render both item types.

Film roll scope:

- Load photos for one film roll.
- Render photo items only.
- Show `Back to Tray`.

Suggested components:

- `FilmRollCard`
- `FilmRollEditorSheet`
- `MovePhotosDialog`
- `TraySelectionToolbar`

This avoids building a separate album screen. It also keeps the v2 slide-out
idea easier to add later because film rolls are already first-class tray items.

## Error Handling

Use plain, recoverable messages:

- If creating a roll fails: `Could not create film roll. Please try again.`
- If moving photos fails: keep the photos where they were and show a retryable
  toast.
- If a roll no longer exists during a move: keep the photos in their current
  location and refresh the tray.

Do not expose database or command names in user-facing errors.

## Testing

Core behavior to test:

- Creating a film roll adds it to the top-level tray.
- Renaming a film roll updates the tray and the focused roll title.
- Moving photos to a film roll removes them from loose tray results.
- Moving photos back to tray removes their film roll assignment.
- Deleting a film roll with the safe mode moves photos back to tray.
- Film rolls cannot be moved into film rolls.
- Film roll view reuses tray selection actions.

Frontend behavior to test:

- Top-level tray renders both film rolls and loose photos.
- Film roll view renders only photos in that roll.
- `Back to Tray` returns to the top-level tray.
- Selection action opens the move dialog.
- Dragging photos onto a film roll calls the move operation.

## V2 Ideas

The main v2 candidate is the physical film-strip interaction:

- Clicking or hovering a film roll can expand a short preview strip in place.
- The strip can show a limited number of photos.
- Opening the roll still enters the full focused tray view.

This should come after v1 proves the organization model works.
