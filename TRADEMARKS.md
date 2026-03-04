# Panorama Branding and Upstream Trademarks

Panorama is a fork of Wealthfolio. This document clarifies how Panorama branding
relates to the upstream Wealthfolio trademarks.

## Upstream marks

"Wealthfolio" (word mark) and the official Wealthfolio logos identify the
upstream Wealthfolio project and remain trademarks of Teymz Inc.

Open source licenses grant copyright permissions. They do not grant rights to
use upstream trademarks in ways that suggest Panorama is the official
Wealthfolio project.

## Panorama branding rules

When distributing this fork or derivative builds of this fork:

1. Use the Panorama name and Panorama brand assets only for official Panorama
   builds and documentation.
2. Keep clear attribution that Panorama is a fork of Wealthfolio when upstream
   provenance is relevant.
3. Do not present Panorama as the official Wealthfolio project.

## Allowed references to Wealthfolio

You may accurately say:

- "Forked from Wealthfolio"
- "Based on Wealthfolio"
- "Compatible with Wealthfolio v3 addon APIs"

Link upstream references to the official repository:
<https://github.com/afadil/wealthfolio>.

## Compatibility and maintenance policy

Panorama should keep `Panorama` as its primary product name in user-facing UI,
downloads, releases, and website copy.

At the same time, Panorama does not need to remove every internal
`Wealthfolio` identifier. Some names may remain for compatibility and easier
upstream sync, including examples such as:

- crate and package names like `wealthfolio-*`
- addon SDK package names such as `@wealthfolio/*`
- protocol, deep link, or service identifiers such as `Wealthfolio Connect`

The maintenance rule is:

1. Keep Panorama as the visible brand presented to users.
2. Keep explicit attribution that Panorama is a fork of Wealthfolio.
3. Do not rename upstream technical identifiers only for cosmetic reasons if
   that makes future upstream updates harder.
4. Prioritize removing user-visible references only when they would reasonably
   confuse users about whether Panorama is an official Wealthfolio build.

## Forks of Panorama

If you fork Panorama and redistribute modified builds, you should:

- Use a distinct product name.
- Remove Panorama-specific logos and brand assets unless you are redistributing
  official Panorama builds unchanged.
- Avoid UI, release notes, or marketing copy that implies endorsement by either
  Panorama or Wealthfolio.

## Attribution

Recommended attribution:

- "Panorama is a fork of Wealthfolio."
- "Wealthfolio is a trademark of Teymz Inc."

## Questions

If Panorama-specific branding guidance is needed, open an issue at:
<https://github.com/galza-guo/Panorama/issues>
