# WI-044: Import FPL squads with provider positions

- Kind: `fix`
- Canon action: `none`

## Outcome

The production FPL import accepts a published squad when every mapped player is active for the correct EPL club, preserving the official FPL positions and lineup.

## Specs

- Governing: `spec://modules/machete/FEAT-001-global-ranking-strategy#data`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#contracts`

## Scope

- In: reproduce the reported two-player import failure; check shared roster membership independently of provider positions; keep FPL squad validation; bound FPL snapshot transactions; regression verification and immutable production deployment.
- Out: changing shared player identities or roster positions, completing unrelated pool mappings, changing the interface, migrations, storing host VPN configuration in Git.

## Acceptance

- [x] The regression reproduces rejection of active wingers classified as midfielders by FPL.
- [x] Published import preserves FPL positions, all 15 picks, captain and bench.
- [x] Inactive players and players without active membership of their mapped club are still rejected before writes.
- [ ] Focused tests, type checking and the required release checks pass.
- [ ] The immutable production release imports the linked published FPL squad successfully; repeated import has no duplicate picks or snapshots.
- [ ] Cache, duplicate records/jobs and memory are checked after verification.

## Result

The unchanged importer reproduced the exact reported two-player error. After separating active club membership from provider position, all 25 focused FPL tests passed. Type checking and focused lint passed. The standalone specification snapshot is current with no diagnostics. Full CI/release gates and production verification are pending.
