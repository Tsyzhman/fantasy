# WI-098: Retire the Baltika workspace

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Fantasy Scout serves Machete and MiXerr as its football scouting workspaces. Historical Wyscout records remain available to the existing Machete readers.

## Specs

- Governing: `spec://common/PROP-002-editorial-sport-design#workspace-navigation`
- Affected: `spec://common/main#product-modes`
- Affected: `spec://common/structure#root`
- Constraint: `spec://common/FEAT-009-session-authentication#root`

## Scope

- In: remove Baltika pages, workbook and schedule operations, legacy aliases, and their exclusive code, assets, tests and documentation.
- Out: database schema and stored records, account franchise assignments, Machete scouting and Squad, the RPL club, and production rollout.

## Acceptance

- [x] Route discovery omits Baltika and its legacy upload, publication, and player-snapshot endpoints.
- [x] Remaining player navigation, comparison, watchlists, saved views and global scoring settings use Machete and pass existing checks.
- [x] Shared Wyscout reads, franchise assignments, MiXerr shots and the football club retain their active contracts.
- [x] Specifications and current documentation describe the served routes. Local disk savings and test inventory are measured.

## Result

Completed locally on 2026-11-06 from `origin/main` at `bd493e0`.

- `npm run check` passed. 1,380 unit and contract tests passed and four were skipped. ESLint reported 237 warnings and zero errors, with zero warnings on added lines. Type generation and TypeScript passed. Playwright discovered 49 cases across eight files.
- A clean `npm ci`, Prisma client generation, and standalone build completed. The 102-route manifest omitted the retired workspace and its dedicated aliases and APIs. Machete, MiXerr, shared player preferences, the admin model, and the normalized player shot API appeared in the manifest. The standalone server started on loopback and returned HTTP 200 for `/login`. The `/players` entry preserved repeated filter values and the retired comparison source returned 404.
- Prisma schema, migration history, account franchise access, RPL team identity, and Machete's read-only Wyscout data path stayed intact. The global model action rejects the retired source before database access. Three test files serving the removed code were deleted. The separate Netherlands and Portugal mapping tests passed all five cases.
- The original workspace measured 7.66 GB before and 4.97 GB after, excluding junction targets. The removed files totaled 2.68 GB across generated Next.js caches, a SHA-256-verified GitHub Actions archive copy, and an old test log. The verification checkout's generated build and dependency installation were cleaned.
