# Target Allocation System Design

**Goal:** Add a first-class target-allocation system to Panorama so a user can define desired portfolio structure, compare it with current reality, and decide where the next contribution or rebalance should go.

This document is intentionally a product philosophy and design brief, not an implementation plan. The next implementation thread should turn it into schema, API, calculation, and UI work.

## Why This Matters

Panorama already answers an important question: "What do I own?"

The next layer should answer a more useful investor question: "Am I still following my plan?"

For long-term investors, a portfolio is not just a list of accounts and holdings. It is a set of deliberately chosen proportions:

- emergency cash versus steady assets versus growth assets
- equities versus alternatives
- A-share versus US versus HK versus other markets
- broad core versus satellite exposures
- income, healthcare, semiconductors, defense/aerospace, gold, CTA, BTC, and other intentional sleeves

Prices move every day. Cash enters and leaves. New trades happen. Without a target system, the user has to mentally compare current holdings against a separate written plan. That is exactly the kind of work Panorama should absorb.

The feature should make the plan visible, measurable, and actionable.

## Investment Philosophy

The underlying philosophy is strategic allocation with disciplined rebalancing.

The user defines target weights first. The portfolio then drifts as market prices, FX, cash flows, deposits, withdrawals, and new trades change the real weights. Panorama should continuously compare the two.

The purpose is not to predict short-term winners. The purpose is to keep risk and exposure aligned with the user's own policy.

This naturally creates a "buy low / trim high" discipline:

- if a target sleeve is below target, new money can be directed there first
- if a sleeve is materially above target, the user can pause fresh buys or consider trimming
- if a sleeve is within band, Panorama should say "leave it alone"

That last point is important. A good allocation system should reduce unnecessary trading. It should not turn every small drift into an urgent alert.

The system should support both:

- **cash-flow rebalancing:** use new contributions, dividends, or interest to fill underweight sleeves
- **active rebalancing:** sell overweight sleeves only when drift is large enough to justify transaction cost, tax, and operational friction

Vanguard's public rebalancing guidance makes the same distinction: rebalancing is not market timing, but a way to stay aligned with a long-term asset mix. CFA Institute frames rebalancing as adjusting portfolio weights back toward strategic allocation, while also considering transaction costs, taxes, volatility, and liquidity.

## Product Objective

Panorama should become the dashboard where a household can see:

1. The plan.
2. Current reality.
3. Drift from plan.
4. Whether each sleeve is underweight, in range, or overweight.
5. The cleanest next action if new cash is available.

The core screen should feel like an investment policy cockpit, not a trading terminal.

It should be calm, structural, and easy to scan.

## Core Concepts

### Allocation Plan

An allocation plan is a named set of target weights.

Examples:

- `Household Policy v1`
- `Gallant Pot 3`
- `Vermouth Toy Sleeve`
- `Retirement Conservative Plan`

An allocation plan can be active or archived. Only one plan should be the default for a given scope at a time.

### Scope

Targets need a denominator. Without a denominator, percentages become ambiguous.

Supported scopes should include:

- whole household balance sheet
- whole investment portfolio
- one pot
- one account
- one custom group of accounts
- one parent sleeve inside a plan

Example:

```text
Pot 3
  equities: 92%
    A-share: 35%
      CSI300: 40%
      CSI500: 20%
      dividend: 6%
      bank: 10%
      semiconductors: 6%
      healthcare: 6%
      defense/aerospace/aviation chain: 6%
      toy sleeve: 6%
    US: 25%
    HK: 20%
    Other: 20%
  alternatives: 8%
    CTA: 3%
    BTC ETF: 3%
    Gold: 2%
```

The UI must always show the denominator plainly:

- "% of total balance sheet"
- "% of Pot 3"
- "% of Pot 3 equities"
- "% of A-share sleeve"

This prevents a common confusion: a sleeve can be 6% of A-share, but only around 1.9% of Pot 3.

### Allocation Node

Each target is a node in a tree.

Each node should have:

- name
- target percent
- optional min / max band
- parent node
- classification rule or manual holdings mapping
- current value
- current percent
- target value
- drift amount
- drift percentage points
- status

Status should be simple:

- `underweight`
- `in range`
- `overweight`
- `unclassified`

### Bands

Targets should support bands. Bands are the difference between "watch" and "act".

Minimum version:

- default absolute band, e.g. `+/- 5 percentage points` at top-level buckets
- tighter band for large core buckets
- looser band for small satellites

Later versions can support:

- relative bands, e.g. `+/- 20% of target weight`
- asymmetric bands
- volatility-aware bands

The first version does not need to optimize bands mathematically. It only needs to make drift visible and stop tiny deviations from becoming noise.

### Classification Source

A target node must know what holdings count toward it.

Panorama already has taxonomy-based allocation views, custom groups, goals, and account-level data. The target allocation system should build on those instead of inventing an unrelated classifier.

Possible mapping inputs:

- taxonomy category, e.g. region, sector, asset class, custom group
- explicit asset ids
- account ids
- pot / bucket assignment
- manual override
- look-through allocation from fund metadata

Version 1 should allow explicit asset mapping and taxonomy category mapping. Look-through support can be staged if the existing data is incomplete.

## Desired User Experience

### Plan Setup

The user should be able to create a target plan through a tree editor:

- add parent sleeve
- add child sleeve
- set target percent
- set band
- choose mapping rule
- see whether siblings sum to 100%

The editor should not require the user to make the entire household plan at once. They should be able to start with one pot or one account and expand later.

### Tracking Dashboard

The dashboard should show a compact tree/table:

```text
Pot 3                                 100.0% target   100.0% current   in range
  Equities                             92.0% target    91.4% current   in range
    HK                                 20.0% target    14.4% current   underweight
      2800 core                        60.0% target    30.3% current   underweight
      3033 offense                     20.0% target     8.2% current   underweight
      biotech                          10.0% target     4.9% current   underweight
      income/defense                   10.0% target    10.2% current   in range
```

Rows should support drill-down:

- what holdings are counted here
- which holdings are unmapped
- how current value was calculated
- what the target value would be at today's portfolio size
- how much cash would be needed to reach target

### Next Contribution Guidance

Given available cash, Panorama should be able to answer:

> If I have 10,000 CNY/HKD/USD to deploy, which sleeves are most underweight?

This should be informational, not a command to trade.

The guidance can rank deficits:

1. Largest underweight by currency-compatible sleeve.
2. Largest underweight by absolute target value gap.
3. Largest underweight by drift percentage points.

Currency matters. If the user has HKD cash, the system should prefer HK sleeves before suggesting unnecessary FX conversion. If the user has CNY cash, it should prefer A-share sleeves. If the user has USD cash, it should prefer US / Other sleeves.

### Rebalance Review

A rebalance review should show:

- overweight nodes
- underweight nodes
- suggested "use new cash first" opportunities
- optional trim candidates only when a node is materially outside band
- expected post-action allocation if the user enters hypothetical trades

This is not an auto-trading feature.

Panorama should never place trades. It should help the user see tradeoffs before they act.

## MVP Scope

Version 1 should focus on visibility and manual discipline.

In scope:

- create / edit target allocation plan
- tree of allocation nodes
- target percentages and bands
- explicit asset mapping
- taxonomy category mapping
- current versus target calculation
- underweight / in-range / overweight statuses
- drill-down to counted holdings
- unmapped holdings list
- dashboard for one active plan

Out of scope for version 1:

- automatic trading
- tax-lot optimization
- transaction-cost optimizer
- automatic target optimization
- Monte Carlo planning
- full look-through for every fund type
- AI-generated investment advice

## Relationship To Existing Panorama Concepts

### Goals

Existing goals answer: "How much money do I need for this objective?"

Target allocations answer: "How should this pool of money be structured?"

They are adjacent but not the same. A goal may use an allocation plan, but an allocation plan should not be implemented as a financial goal.

### Taxonomies

Taxonomies already classify holdings. Target plans should use taxonomy categories as one mapping source.

However, taxonomies alone are not enough. A user may want a sleeve like "HK income line" that maps to a hand-picked basket of H-share banks. That requires explicit asset mapping or a custom group.

### Buckets / Pots

Pots are high-level policy containers.

Target allocations should work inside pots and across pots. The same engine should support:

- Pot 1 / Pot 2 / Pot 3 / Pot 4
- Pot 3 geography targets
- A-share internal sleeves
- HK internal sleeves
- alternatives sleeves

### Portfolio Allocation Views

Existing allocation charts show current exposure. Target allocation adds the missing comparison layer.

The key new object is not "allocation"; it is "desired allocation versus current allocation."

## Calculation Rules

### Current Value

Each node's current value is the sum of mapped holdings, converted to the plan base currency.

If the node has children, default current value should be the sum of child nodes unless the node has its own direct mapping.

If a holding maps to multiple children, the system must know the weight split. This is necessary for fund look-through and blended assets.

### Target Value

Target value is:

```text
plan_scope_current_value * target_percent
```

For nested nodes:

```text
parent_target_value * child_target_percent
```

The UI should show both local and effective percentages when helpful:

```text
Defense/Aerospace = 6% of A-share = 1.932% of Pot 3
```

### Drift

Drift should be shown in both money and percentage points:

```text
value_gap = current_value - target_value
percentage_point_gap = current_percent - target_percent
```

For actionability, underweight should be shown as "needs X to target" rather than negative numbers everywhere.

### Unknowns

Unmapped holdings should be visible. Silent omission is dangerous.

A plan should show:

- mapped value
- unmapped value
- percentage of scope that is unmapped

If unmapped value is material, the dashboard should warn that allocation accuracy is incomplete.

## UI Principles

The feature should feel like a control panel, not a spreadsheet.

Preferred UI elements:

- tree table for hierarchy
- progress bars for current versus target
- status chips for underweight / in range / overweight
- small drift badges
- drill-down drawer for holdings
- setup wizard only for first plan creation

Avoid:

- giant pie charts as the main view
- hiding the denominator
- implying precision when mappings are incomplete
- presenting suggested trades as orders
- making every tiny drift look urgent

## Example: Household Policy

This example is included to make the product intention concrete. It is not hard-coded product behavior.

```text
Household Balance Sheet
  Pot 1: living and operating cash
  Pot 2: steady assets
  Pot 3: long-term growth
    Equities: 92%
      A-share: 35%
        CSI300: 40%
        CSI500: 20%
        Dividend: 6%
        Bank: 10%
        Semiconductors: 6%
        Healthcare: 6%
        Defense/Aerospace/Aviation Chain: 6%
        Toy Sleeve: 6%
      US: 25%
      HK: 20%
        2800 core: 60%
        3033 offense: 20%
        3069/9069 biotech: 10%
        income/defense: 10%
      Other: 20%
    Alternatives: 8%
      CTA: 3%
      BTC ETF: 3%
      Gold: 2%
  Pot 4: insurance / long-horizon protection layer
```

This is exactly the kind of structure the feature should make easy to define, review, and adjust.

## Success Criteria

The feature succeeds if a user can open Panorama and answer these questions in less than one minute:

- What is my target allocation?
- What is my current allocation?
- Which sleeves are underweight?
- Which sleeves are overweight?
- Which holdings are counted in each sleeve?
- What is unmapped?
- Where should the next contribution probably go?
- Am I following my own plan?

The feature fails if:

- users still need an external Markdown file or spreadsheet to know their targets
- percentages are shown without denominators
- look-through gaps are hidden
- the UI encourages over-trading
- the system cannot explain how a sleeve value was calculated

## Implementation Direction For Next Thread

Recommended next step: create a concrete implementation plan with schema and API design.

Likely implementation areas:

- SQLite migrations for allocation plans and nodes
- repository/service layer in `crates/core` and `crates/storage-sqlite`
- frontend commands/adapters
- target allocation dashboard page
- plan editor
- mapping UI for assets and taxonomy categories
- tests for nested percentage math and unmapped holdings

The implementation should stay local-first and should not depend on cloud services.

## References Consulted

- Vanguard, "Rebalancing your portfolio": https://investor.vanguard.com/investor-resources-education/portfolio-management/rebalancing-your-portfolio
- Vanguard, "Balancing act: Enhancing target-date fund efficiency": https://corporate.vanguard.com/content/corporatesite/us/en/corp/articles/balancing-act-enhancing-target-date-fund-efficiency.html
- CFA Institute, "Overview of Asset Allocation": https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/overview-asset-allocation
