# Target Allocation System Design

**Status:** Product design spec, updated from the May 2026 requirements
interview.

**Goal:** Add a first-class target-allocation system to Panorama so the user can
define a desired asset structure and compare it with current reality at a
glance.

This document is a design brief, not an implementation plan. The next thread
should turn it into schema, API, calculation, and UI work.

## Concise Design Spec

V1 is a current-only visual comparison tool. It does not recommend trades, rank
what to buy, optimize taxes, or auto-rebalance. It answers: "How does my current
asset allocation compare with my plan right now?"

The plan covers included assets, not accounts. By default, included assets are
all assets except liabilities. Users can exclude assets from the plan; excluded
assets appear in a separate section and do not affect percentages.

The plan is one flexible tree under an implicit `Total Assets` root:

- folder nodes represent pots, categories, sleeves, or any user-created grouping
- asset nodes represent specific assets or cash identities and are always leaves
- `Other` is an automatic virtual row for leftover planned capacity
- `Untargeted` is an automatic current-only row when current assets have no plan
  slot

Accounts are shortcuts only. A persistent account default can assign all current
and future holdings in that account to a target folder, but specific holding
overrides win. Actual attribution is per holding/position, including per
account-currency cash balance.

Plan percentages are local to the parent, editable to one decimal place, and
optional. Blank-plan nodes show current allocation only and have no
drift/status. If explicit child targets total less than 100%, `Other` receives
the remaining target. Sibling explicit targets may not exceed 100%.

The main dashboard is a tree table with a target rail and current bar for each
planned row:

- plan: muted thick line with plan percentage at the rail end
- current: stronger colored bar below with current percentage at the bar end
- status: symbolic drift marker after current percentage
- blank-plan rows: current bar only

Status uses local percentage-point drift:

- `~`: within +/- 5 pp
- `+` / `-`: 5 to 10 pp
- `++` / `--`: 10 to 20 pp
- `+++` / `---`: over 20 pp

The page lives inside Insights. Normal mode is read-only dashboard; edit mode is
an inline draft editor with Save/Cancel.

## Why This Matters

Panorama already answers an important question: "What do I own?"

The next layer should answer a more useful investor question: "Am I still
following my plan?"

For long-term investors, a portfolio is not just a list of accounts and
holdings. It is a deliberately chosen structure:

- cash versus steady assets versus growth assets
- Pot 1 / Pot 2 / Pot 3 / Pot 4 style policy buckets
- equities versus alternatives
- A-share versus US versus HK versus other markets
- broad core versus satellite exposures
- income, healthcare, semiconductors, defense/aerospace, gold, CTA, BTC, and
  other intentional sleeves

Prices move every day. Cash enters and leaves. New trades happen. Without a
target system, the user has to mentally compare current holdings against a
separate written plan. Panorama should absorb that mechanical comparison.

The feature should make the plan visible, measurable, and easy to inspect.

## Product Objective

Panorama should provide a calm allocation dashboard where the user can see:

1. The target structure.
2. Current structure.
3. Drift from target.
4. Which parts are under, in range, or over.
5. Which assets and accounts make up each visible row.

The feature should not behave like a trading terminal. It should not say what to
buy or sell. It should give the user a visual instrument panel for their own
policy.

## V1 Scope

### In Scope

- one target allocation plan
- current-only dashboard
- flexible folder/asset tree
- all-assets denominator, excluding liabilities
- explicit untargeted holdings that override account defaults without leaving
  Total Assets
- local target percentages with one decimal place
- blank-plan current-only nodes
- automatic `Other`
- automatic `Untargeted`
- per-position holding attribution
- persistent account default attribution shortcuts
- account default selector in Account Edit modal when a plan exists
- asset/cash target leaves
- not-held asset targets
- same-asset aggregation within a folder
- drag-and-drop plus picker-based attribution
- inline draft editor with Save/Cancel
- search/filter with tree context
- remembered tree expansion state
- mobile read-only dashboard
- read-only commands/types for add-ons and AI
- calculation tests plus key UI tests

### Out Of Scope For V1

- multiple saved plans
- historical drift charts
- effective-dated target or attribution history
- trading recommendations
- rebalance instructions
- tax-lot optimization
- transaction-cost optimization
- Monte Carlo planning
- automatic target optimization
- taxonomy smart folders
- taxonomy bulk attribution helpers
- look-through fund splitting
- global future asset attribution rules
- target-plan JSON import/export
- liabilities in the target tree
- row detail drawer
- summary strip
- notes/descriptions on nodes
- row virtualization
- full mobile editing

## Core Model

### One Plan

V1 has exactly one editable plan. There is no archive, active/default selector,
or scenario comparison.

This keeps the mental model simple: the plan is "my current target allocation."

### Denominator

The implicit root is `Total Assets`.

V1 denominator rules:

- include all assets by default
- exclude liabilities entirely
- compute all percentages from included assets
- model intentional non-target assets as a normal top-level pot named
  `Excluded Assets`, with a 0% target by default
- explicit untargeted holdings still count in `Total Assets`; they are simply
  waiting outside the target tree

Liabilities stay in net worth features, not target allocation.

V1 does not need a separate "exclude this holding" control in the attribution
panel. If users want an asset out of the plan target, they can target or
retarget it to `Excluded Assets` like any other pot.

### Flexible Tree

The tree is like folders and files:

- folders can contain folders and asset leaves
- asset leaves cannot contain children
- folders and asset leaves can sit side by side
- top-level folders may use a Pot 1-4 template, but the UI should use generic
  language such as "folder"

The database should not hardcode levels such as Pot, Category, Sleeve, and
Sub-sleeve. It should store parent/child relationships.

### Node And Display Row Types

V1 needs two stored node types and two virtual display rows:

1. **Folder node**
   - user-created
   - can have children
   - can have a local plan percentage or blank plan
   - has editable name, color, and icon/symbol

2. **Asset node**
   - user-created
   - leaf only
   - references an asset identity, or a cash identity
   - can have a local plan percentage or blank plan
   - inherits parent folder color
   - text-only in V1, no custom icon/color

3. **Other row**
   - system-created and virtual
   - not directly editable
   - always gray
   - uses a fixed ellipsis icon
   - displays `auto X%` when it has an automatic plan percentage

4. **Untargeted row**
   - system-created and virtual
   - not directly editable
   - current-only
   - appears when current assets belong to a parent but no planned child or
     `Other` slot can contain them
   - no plan percentage, drift, or status

### Assets, Cash, And Alternative Assets

Asset node identity rules:

- traded asset leaves aggregate matching positions of the same asset identity
  within the same folder scope
- cash leaves aggregate by currency within the same folder scope
- attribution for cash remains per account-currency cash holding
- alternative assets are unique asset leaves
- users can add target asset leaves for assets not currently held

Example:

```text
HK Core
  2800.HK        plan 60.0%, current from all 2800.HK positions attributed to HK Core
  HKD Cash       plan blank, current from all HKD cash attributed to HK Core
  Other          auto 40.0%
```

If `2800.HK` is held in three accounts but only two positions are attributed to
`HK Core`, the `HK Core > 2800.HK` row includes only those two positions.

The same asset may appear under different folders. It may appear only once under
the same parent folder.

## Attribution Model

### Attribution Is Per Holding

The real attribution target is an account-specific holding/position.

This matters because the same asset can exist in multiple accounts and serve
different purposes. For example, `2800.HK` in Account A can belong to `Pot 2`,
while `2800.HK` in Account B can belong to `Pot 3 > HK Core`.

Cash is also position-like:

```text
Broker A HKD cash
Broker A USD cash
Broker B HKD cash
```

Each account-currency cash balance can be attributed separately.

Implementation should use stable attribution subject keys, not transient
calculated row IDs. The minimum subject set is:

- account security position: `account_id + asset_id`
- account-currency cash balance: `account_id + currency`
- standalone asset: `asset_id`

This lets attribution survive normal value changes, position recalculation, a
holding disappearing after sale, and the same holding returning later.

### Holdings Are Attributed To Folders

Holdings are attributed to folders only, not directly to asset leaves.

Asset leaves are target definitions inside a folder. They automatically match
holdings by identity within that folder's scope.

Example:

```text
HK Core
  2800.HK   plan 60.0%
  Other     auto 40.0%
```

If a `2800.HK` position is attributed to `HK Core`, it appears under the
`2800.HK` asset leaf. Other holdings attributed to `HK Core` appear under
`Other` unless they match another explicit child target.

### Account Defaults

Account attribution is a persistent shortcut.

If Account A has default target folder `Pot 3`:

- current holdings without explicit overrides in Account A inherit `Pot 3`
- future holdings in Account A inherit `Pot 3`
- explicit holding overrides remain where the user placed them
- changing Account A's default moves inherited holdings to the new folder
- changing Account A's default does not move explicit overrides

The Account Edit modal should expose a `Default target folder` selector only
when a target allocation plan exists.

### Holding Overrides

Specific holding attribution overrides account default attribution.

When the user assigns one position of an asset, Panorama can ask whether to
apply the same attribution to other current positions of the same asset. This is
a one-time bulk action only.

V1 does not create a remembered global rule such as "all future 2800.HK belongs
to HK Core."

### Manual Only In V1

V1 attribution is manual, plus account defaults and one-time same-asset apply.

V1 does not include:

- taxonomy smart folders
- taxonomy bulk helpers
- automatic region/sector/category routing
- look-through split assignment

This keeps behavior predictable. Taxonomies can be used later as smart-folder
rules or bulk helpers.

## Target Percentages

### Local Percentages

Users enter local percentages only.

Example:

```text
Total Assets
  Pot 3       plan 60.0% of Total Assets
    HK Core   plan 20.0% of Pot 3
      2800.HK plan 60.0% of HK Core
```

Effective total-assets percentage is calculated and shown in tooltip, not edited
directly.

### Precision

Target percentages allow one decimal place.

### Blank Plan Values

Plan percentage is optional.

If a node has blank plan:

- current percentage is still displayed
- plan is blank
- no drift is calculated
- no status is shown
- it can be used as current-only organization

When editing a blank asset target, the input should prefill with current local
percentage as a starting point. The value is not saved unless the user saves it.

User-edited plan percentages persist and never change automatically when prices
move or new assets are attributed.

### Parent Requirement

A node can have explicit target children only if that node itself has a plan
percentage, except for the implicit root.

Valid:

```text
Total Assets
  Pot 3 plan 60.0%
    HK Core plan 20.0%
      2800.HK plan 60.0%
```

Invalid:

```text
Total Assets
  Pot 3 plan 60.0%
    HK Core plan blank
      2800.HK plan 60.0%
```

Blank-plan folders may still have blank-plan children and attributed holdings.
They are current-only organization nodes.

If a folder's plan percentage is cleared, descendant plan percentages must also
be cleared. If many targets would be affected, show confirmation.

### Sibling Sum Rules

Explicit child targets may total less than or equal to 100%.

They may never exceed 100%. Save is blocked if siblings exceed 100%.

The editor may offer a `Normalize to 100%` helper that scales sibling targets
down proportionally inside the draft and shows a toast. It must not auto-save.

There is no V1 helper to split remaining percentage across blank children.

## Other

`Other` replaces the earlier "Residual" concept in UI language.

`Other` is automatic and never directly editable. It exists only when explicit
child targets total less than 100%. Its target is:

```text
Other target % = 100% - sum(explicit child target %)
```

`Other` appears when:

- a parent has at least one explicit child target
- explicit child targets total less than 100%

`Other` is the plan's deliberate leftover capacity. It can contain blank-plan
children and current holdings that belong to the parent but do not match an
explicit planned child.

Clean distinction:

- explicitly attributed holding: belongs to a specific folder
- child target match: shown under the matching child folder/asset
- unmatched current value with leftover planned capacity: shown under `Other`
- unmatched current value with no leftover planned capacity: shown under
  `Untargeted`

`Other` participates in target/current/status math like a normal planned row,
but its plan label should be marked automatic, e.g. `auto 40.0%`.

Blank-plan child nodes appear under `Other` in the dashboard when their parent
has explicit target children and leftover planned capacity. If explicit child
targets total 100%, blank-plan child nodes appear under `Untargeted` instead.
The editor can keep them in place and label their Plan cell as `Other` or
`Untargeted` to make the dashboard behavior clear.

Nested current-only structure should be preserved under `Other`.

Example:

```text
HK Core plan 20.0%
  2800.HK plan 60.0%
  Dividend folder plan blank
    Bank A plan blank
    Bank B plan blank
  Other auto 40.0%
```

Dashboard:

```text
HK Core
  2800.HK
  Other
    Dividend folder
      Bank A
      Bank B
```

## Untargeted

`Untargeted` is separate from `Other`.

`Untargeted` appears when current value belongs under a parent but is not
represented by any stored child node or planned child target, and there is no
`Other` slot for it. The most common case is a parent whose explicit child
targets already total 100%.

`Untargeted` has:

- current value
- current percentage
- no plan percentage
- no drift
- no status

Example:

```text
HK Core plan 100.0%
  2800.HK plan 60.0%
  3033.HK plan 40.0%
```

If `1211.HK` is attributed to `HK Core`, the dashboard shows:

```text
HK Core
  2800.HK
  3033.HK
  Untargeted
    1211.HK
```

This means `1211.HK` belongs under `HK Core` today, but the plan has no target
slot for it yet.

## Calculation Rules

### Current Value

Root current value is total included assets.

Folder current value is the sum of all current holdings attributed to that
folder or any descendant folder.

Asset node current value is the sum of matching attributed positions inside the
parent folder scope.

Other current value is unmatched current value inside the parent scope, but only
when the parent has leftover planned capacity.

Untargeted current value is unmatched current value inside the parent scope when
no `Other` slot exists for that parent.

All current values should be converted to the user's base currency for math.

### Current Percentage

Root-level current percentage:

```text
node_current_value / total_included_assets
```

Nested current percentage:

```text
node_current_value / parent_current_value
```

If parent current value is zero, child current percentages display as `0%`.

### Target Value

Root-level target value:

```text
total_included_assets * node_target_percent
```

Nested target value:

```text
parent_target_value * node_target_percent
```

`Other` target value uses the automatic leftover target percentage.

`Untargeted` has no target value.

### Drift

For nodes with a plan percentage:

```text
value_gap = current_value - target_value
percentage_point_gap = current_percent - target_percent
```

For nodes without a plan percentage:

- no target value
- no drift
- no status

Main table uses local percentages. Tooltip may show:

- local current/plan percentages
- effective total-assets current/plan percentages
- current/target money values
- included holdings/account breakdown

## Status

V1 uses global thresholds only, based on local percentage-point drift from
target.

| Symbol | Meaning               | Threshold        |
| ------ | --------------------- | ---------------- |
| `---`  | far below target      | less than -20 pp |
| `--`   | below target          | -20 to -10 pp    |
| `-`    | slightly below target | -10 to -5 pp     |
| `~`    | in range              | within +/- 5 pp  |
| `+`    | slightly above target | +5 to +10 pp     |
| `++`   | above target          | +10 to +20 pp    |
| `+++`  | far above target      | over +20 pp      |

Status color is separate from node color:

- below target: red-ish
- in range: blue/neutral
- above target: green-ish

Use restrained colors and avoid success/error wording. Above target is not
necessarily good, and below target is not necessarily bad. Do not rely on color
alone. Always show the symbol.

## Dashboard UX

### Location

Target Allocation should live inside Insights as a peer section/tab alongside
Holdings, Performance, and Income.

### Default View

Normal view is the read-only dashboard. Editing is entered with an Edit button.

No V1 summary strip. The tree is the main experience.

### Main Visual

Use a tree table/list with one compact visual per row.

Hovering any row for 2 seconds opens row details; users should not need to aim
specifically at the rail or bar. The detail popover should anchor near the hover
location rather than always opening from the row's left edge.

Clicking/tapping a row performs the row's primary action:

- asset/holding rows navigate to the existing holding detail page
- folder rows expand/collapse
- root and virtual rows with children also expand/collapse

The tree includes a visible root row:

- root label: `Total Assets`
- root amount: total current portfolio value
- root can expand/collapse all allocation rows
- no plan rail or current bar, because root is always 100%

For planned rows:

- muted plan rail, more like a thick line than a filled bar
- plan metric at the end of the plan rail
- colorful current bar below the rail, thicker than the plan rail
- current metric at the end of the current bar
- status symbol beside the row label, not beside the current metric
- plan rails and current bars are drawn directly, without a 100% background
  track/notch
- within each folder and at the top level under `Total Assets`, rows are
  displayed by planned weight from heaviest to lightest; rows without a planned
  weight appear after planned rows

Metrics next to rails/bars can be toggled between:

- percentage only
- amount only
- percentage + amount

The metric toggle should use the app's existing icon set. Percentage mode uses a
percent icon; amount mode uses a money/amount icon rather than the percent icon.

Metric labels should sit close to the right end of the actual rail/bar, not in a
separate far-right column.

For blank-plan rows:

- current bar only
- current metric
- no plan rail
- no status

For `Other`:

- gray visual identity
- fixed ellipsis icon
- auto plan label when applicable, e.g. `auto 12.5%`

For `Untargeted`:

- neutral current-only row
- no plan rail
- no status symbol

### Tree Depth

Tree depth should be visually obvious without changing the color system.

- labels use structural tree connector lines, not only chevrons and whitespace
- plan rails and current bars indent by depth with a clear step size
- deeper rows keep inherited folder color, but their geometry shows hierarchy
- chevrons remain for expand/collapse, but are not the only tree cue
- chevrons are scoped to expand/collapse only, matching folder row click
  behavior
- rows highlight subtly on hover for easier scanning
- folder rows, including top-level pots and nested categories/subcategories, do
  not draw their own bottom divider line

### Color And Icons

Current bar color comes from the folder color.

Folder color/icon rules:

- folders inherit color/icon from parent unless explicitly overridden
- folder name, color, and icon are editable through the pencil modal
- provide about 7-8 restrained selectable colors
- provide a small set of selectable folder symbols/icons
- call inherited style `Automatic` in the UI

Asset leaves:

- inherit parent folder color
- can be renamed through the pencil modal
- no editable color in V1
- no icon in V1
- text-only

`Other`:

- always gray
- fixed ellipsis icon

### Search

Dashboard includes search/filter by:

- folder name
- asset name/symbol
- account name in breakdowns

Search results preserve tree context. Searching `2800` should show matching rows
with ancestors rather than a flat orphan list.

### Expansion

Tree expand/collapse is supported and remembered locally.

V1 expected size is under 50 rows, so row virtualization is not required.

### Tooltips And Popovers

V1 uses rich tooltips/popovers instead of a row detail drawer.

Tooltips/popovers can show:

- local current/plan percentages
- effective total-assets current/plan percentages
- current/target money values
- compact holdings/account breakdown

If a breakdown is too large, show a compact preview. Do not add a full detail
drawer in V1.

Keyboard focus opens these details immediately. In V1, pointer users get the
detail popover on delayed hover while click/tap is reserved for row actions.

### Mobile

Mobile supports dashboard/read-only mode.

Mobile uses a responsive tree list with simplified columns, not a horizontal
scroll table.

Full editing is desktop/tablet only in V1.

## Edit Mode

### Draft Editing

Edit mode is an inline tree editor with draft Save/Cancel.

Changes do not affect the saved dashboard until Save.

Save is blocked if:

- sibling explicit target percentages exceed 100%
- duplicate sibling folder names exist
- duplicate asset leaves exist under the same parent
- a node has explicit target children while its own plan is blank, except root

There is no explicit undo/redo in V1. Save/Cancel is the safety model.

### Editor Columns

Edit mode is plan-first. The left target tree should show only:

- Name
- Plan %

Blank Plan values must look different from user-set Plan values.

Current values are hidden in the left edit tree. Normal/read-only mode remains
the place where current and plan are compared visually.

For blank-plan nodes that would appear under `Other` or `Untargeted` in
dashboard, show a simple `Other` or `Untargeted` label in the Plan area.

When the user starts editing a blank Plan value:

- asset target inputs prefill with current local percentage when available
- folders start blank, because folder targets are policy choices

### Editor Actions

Global edit actions live beside the top-level `Edit` control:

- `Normalize` scales draft sibling targets down to fit 100% and shows a toast
- `Cancel` leaves the saved plan unchanged
- `Save` validates and persists the draft

Row tools sit immediately beside the row name, not in separate table columns:

- clicking a row's icon/name edits the row name, and for folders also edits
  color/symbol
- move opens a compact current-tree modal and moves the row under the selected
  destination; moving an asset leaf also retargets matching current holdings
- plus adds a child folder under that folder
- trash deletes empty folders, asks how to handle non-empty folders, and
  untargets asset leaves

Row tools are hidden by default and appear only while hovering/focusing the
row's icon/name area.

The edit modal lays out choices directly rather than hiding them in inline
popovers. Folder style has an `Automatic` option for color and symbol, meaning
inherit from the parent. Asset leaves can be renamed but do not have separate
color/symbol controls in V1.

The move modal shows a compressed version of the current draft tree. Users
select a valid destination and choose `Move under`; invalid destinations include
the node itself, descendants, asset leaves, and the current parent. Untargeted
holdings use the same modal, but can only move under folders. The only modal
action buttons are `Move under` and `Cancel`.

### Adding Nodes

First-time setup offers:

1. Blank plan.
2. Pot 1-4 starter template.

New plans include `Excluded Assets` as a default top-level pot with a 0% target.
The Pot 1-4 template creates folders only, plus `Excluded Assets` as a 0%
top-level pot.

Asset target leaves can reference assets that are not currently held. If an
asset target has no current holding, show `not held` while calculating current
as 0%.

Not-held asset targets must still reference a stable asset identity. The UI
should select from an existing asset record or create/link a zero-holding asset
record; it should not store target leaves as loose text labels.

### Attribution Editing

Attribution/mapping follows a folder/file mental model:

- the left pane is the target tree and is the main editor
- folders are target categories
- asset leaves represent holdings/assets inside folders
- moving an asset leaf to another folder retargets matching current holdings
- untargeting an asset leaf removes the target leaf and clears or suppresses its
  holding-level route

The right panel is not a permanent assignment control surface. It appears only
when at least one current holding is outside the target tree. This panel is an
`Untargeted` inbox grouped by account, with a `!` mark and a move action for
each holding.

Holding attribution has three states:

1. Explicit target: the holding has its own route to a target folder.
2. Use account default: the holding has no holding-specific rule and follows its
   account default, if one exists.
3. Explicitly untargeted: the holding suppresses any account default and appears
   in the right-side `Untargeted` inbox.

When an explicitly targeted holding belongs to an account with a default, the
`Untarget` action asks whether to `Use Account Default`, `Explicitly Untarget`,
or `Cancel`. If the holding is already using the account default, `Untarget`
means `Explicitly Untarget`.

Account defaults remain persistent shortcuts configured from Account Edit. They
apply to current and future holdings in that account unless a holding has an
explicit target or is explicitly untargeted.

### Keyboard

Basic editing shortcuts:

- Enter to edit selected cell/node
- Escape to cancel cell edit
- Delete to delete selected node
- Tab / Shift+Tab for standard navigation

## Tree Mutation Rules

### Deleting Folders

Deleting an empty folder deletes it directly.

Deleting a folder with child folders, asset leaves, matching holdings, or
account defaults opens a short choice dialog:

1. `Move contents to parent`: remove the folder and move direct child nodes to
   the deleted folder's parent. If the deleted folder and a moved child both
   have Plan %, rebase the child's Plan % so the effective target weight is
   preserved.
2. `Untarget contents`: remove the folder subtree and mark affected current
   holdings as explicitly untargeted.
3. `Cancel`: leave the draft unchanged.

### Moving Folders

Moving a folder carries:

- child nodes
- attributed holdings
- attributed account defaults

If the moved folder has a Plan %:

- preserve it if new siblings still total <= 100%
- otherwise clear the moved folder's Plan %
- if the moved folder's Plan % is cleared, descendant Plan % values are also
  cleared
- show confirmation if many descendant targets would be cleared

### Moving Asset Leaves

Moving an asset target leaf preserves its Plan % and retargets matching current
holdings to the destination folder. Moving an asset leaf to top level makes
matching current holdings explicitly untargeted so the leaf can represent them
outside a folder.

### Deleting Asset Leaves

Deleting an asset leaf means `Untarget`, not deleting the real asset.

If matching explicitly targeted holdings have an account default, ask whether
they should `Use Account Default`, become `Explicitly Untargeted`, or cancel. If
matching holdings are already using an account default, untargeting makes them
explicitly untargeted. Holdings without a usable account default become
explicitly untargeted.

### Duplicates

Folder names must be unique among siblings only. They do not need to be unique
globally.

Asset leaves must be unique by identity under the same parent. The same asset
may appear under different folders.

## Relationship To Existing Panorama Concepts

### Accounts

Accounts are containers and shortcut defaults, not allocation targets.

The user may have multiple securities accounts and mixed-risk holdings inside
one account. The allocation plan should not assume account equals policy bucket.

### Goals

Goals answer: "How much money do I need for this objective?"

Target allocations answer: "How should this pool of assets be structured?"

They are adjacent but should remain separate in V1.

### Taxonomies

Taxonomies already classify holdings and may power future smart folders or bulk
helpers.

V1 target allocation attribution is manual only. Do not depend on taxonomy rules
for V1 behavior.

### Portfolio Allocation Views

Existing allocation charts show current exposure.

Target allocation adds the missing comparison layer: desired structure versus
current structure.

### Net Worth

Target allocation uses all assets in the allocation universe. It excludes
liabilities; intentional non-target assets are represented inside the allocation
tree by the `Excluded Assets` pot.

Net worth remains the broader balance sheet feature.

## External Read Access

V1 should expose read-only commands/types for future add-ons and AI tools.

Read-only access should include:

- aggregate target-vs-current tree
- drill-down holding/account breakdowns

V1 does not expose external write APIs for target allocation.

There is no V1 JSON import/export for target plans.

## Sync, Backup, And Local-First

Target allocation data is local app data and should be stored in SQLite.

It should be included in normal backup and device-sync paths. If sync requires
explicit table registration, the implementation plan must include it.

The feature must not depend on cloud services.

## Testing Expectations

V1 should include:

- calculation tests for nested local/effective percentages
- tests for `Other` target/current math
- tests for `Untargeted` current-only rows
- tests for blank-plan nodes
- tests for exclusion precedence
- tests for account-default inheritance versus explicit overrides
- tests for same-asset aggregation within a folder scope
- tests for move/delete clearing rules
- key UI tests for dashboard rendering
- key UI tests for edit/save validation

Broad mobile editing tests are not needed because mobile editing is out of
scope.

## Example

This example is illustrative, not hard-coded behavior.

```text
Total Assets
  Pot 3 plan 60.0%
    Equities plan 92.0%
      A-share plan 35.0%
        CSI300 plan 40.0%
        CSI500 plan 20.0%
        Dividend plan 6.0%
        Bank plan 10.0%
        Semiconductors plan 6.0%
        Healthcare plan 6.0%
        Defense/Aerospace plan 6.0%
        Other auto 6.0%
      US plan 25.0%
      HK plan 20.0%
        2800.HK plan 60.0%
        3033.HK plan 20.0%
        Biotech plan 10.0%
        Other auto 10.0%
      Other auto 20.0%
    Alternatives plan 8.0%
      CTA plan 37.5%
      BTC ETF plan 37.5%
      Gold plan 25.0%
  Other auto 40.0%
    Pot 1
      Cash
    Pot 2
      Steady assets
    Pot 4
```

Notes on the example:

- Pot folders without Plan % are current-only organization until the user sets a
  target.
- `Other` appears only where planned children leave room below 100%.
- `Untargeted` appears when current holdings have no matching planned child and
  no `Other` room.
- Asset rows such as `2800.HK` aggregate matching positions attributed inside
  their parent folder scope.
- The user can keep much of the tree blank and only target the parts they care
  about.

## Success Criteria

The feature succeeds if the user can open Panorama and answer these questions in
less than one minute:

- What is my target allocation?
- What is my current allocation?
- Which areas are under, in range, or over?
- Which assets are explicitly targeted?
- What is sitting in Other?
- What is Untargeted?
- Which holdings/accounts make up a row?
- Which assets are excluded from the allocation plan?
- Am I following my own plan right now?

The feature fails if:

- users still need an external Markdown file or spreadsheet to know their
  targets
- accounts are treated as the true allocation unit
- percentages are shown without a clear denominator
- `Other` double-counts or hides current value
- `Untargeted` rows are confused with planned `Other`
- blank-plan nodes look like real targets
- the UI implies trading advice
- the system cannot explain how a row value was calculated

## Implementation Direction For Next Thread

Recommended next step: create a concrete implementation plan with schema and API
design.

Likely implementation areas:

- SQLite migrations for target allocation nodes, attribution records, account
  defaults, exclusions, and saved UI metadata
- repository/service layer in `crates/core` and `crates/storage-sqlite`
- current-value calculation service using existing holdings/net-worth data
- frontend commands/adapters for desktop and web
- read-only external/add-on data types
- Insights target allocation page
- inline dashboard/editor component
- Account Edit modal integration
- tests for math, attribution, and key UI behavior
- backup/device-sync table registration if required

## References Consulted

- Vanguard, "Rebalancing your portfolio":
  https://investor.vanguard.com/investor-resources-education/portfolio-management/rebalancing-your-portfolio
- Vanguard, "Balancing act: Enhancing target-date fund efficiency":
  https://corporate.vanguard.com/content/corporatesite/us/en/corp/articles/balancing-act-enhancing-target-date-fund-efficiency.html
- CFA Institute, "Overview of Asset Allocation":
  https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/overview-asset-allocation
