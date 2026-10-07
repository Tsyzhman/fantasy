---
status: active
---

<a name="root"></a>

# FEAT-008: Platform transfer trends in Squad {#root}

## Plain language {#plain-language}

The compact “Берут и продают на платформе” panel shows which players platform participants most often add to or remove from their saved plans compared with their published squad in the latest round. Each participant contributes once per league.

## Goal {#goal}

Expose actual changes in platform plans with an explicit baseline and sample size, separately from Sports/FPL-wide popularity. Saved plans are intentions on this platform, not proof of externally executed transfers.

## Governing specifications {#governing-specs}

- `spec://common/main#root` — product boundaries.
- `spec://modules/khl/FEAT-002-khl-squad#scope` — KHL squad isolation and 17 players.

## Scope {#scope}

Football Sports.ru leagues, FPL and KHL share presentation and set-difference counting, with isolated readers and identities. No user names, profiles, squads or identifiers are returned. Existing planner controls and provider popularity panels remain available. No provider HTTP requests, new collector, new table or persisted aggregate are introduced.

## Actors and launch {#actors}

An authenticated participant opens the Squad workspace for a league. Loading the panel, explicit refresh, and successful save/import request a fresh aggregate. Existing snapshot importers supply trusted baseline data; this feature only reads their results.

## Scenarios {#scenarios}

- On opening a league, the participant sees the two top-five lists with baseline/target rounds and the comparable sample.
- Saving a changed plan refreshes the counts. Replacing a player and then restoring them to the baseline removes that participant's contribution from both lists.
- Switching leagues cancels the old request; a result belongs only to the contest it was computed for.
- Missing latest-round snapshots, incomplete plans, an absent future round, and database failures show their explicit states without inventing transfer counts.

## Baseline and counting {#counting}

- Resolve the latest eligible published provider round independently of an individual user's available history; all compared participants use that same round. Sports uses the latest started round; FPL uses the latest completed round, matching its published-squad importer. Football compares the next provider round's saved plan. KHL compares current saved entries with the latest started verified fantasy week. The panel labels both sides explicitly.
- Use the latest saved variant per active user, ordered by update time and ID for deterministic ties. Do not union multiple variants or count the same participant several times. Exclude a latest incomplete variant rather than substituting an older variant.
- Baselines must come from complete published squad snapshots in this exact contest/provider/season and round. Sports snapshots must belong to the participant's currently linked Sports profile. For FPL/KHL, match the current provider entry binding when available. Missing baseline, incomplete mapping, malformed IDs, duplicate entries, incomplete current roster, missing plan for the next round, or stale legacy plans are excluded with sample coverage reported.
- Football uses the saved plan whose stored round identity matches the next round. Legacy plans without round identities can use offset zero only when saved after the baseline round began. A plan with explicit identities for other rounds is excluded.
- For each comparable participant, `buys = saved IDs − baseline IDs`, `sells = baseline IDs − saved IDs`. Returning a player to the baseline cancels the change. Captain, starter/bench, slot and lock changes do not count. Every roster includes the whole squad, including the bench.
- Rank each direction by unique participant count descending, then player ID for ties; return at most five. Percentage is count / comparable participants × 100. An unchanged comparable squad still contributes to the denominator.
- Keep football provider placeholders as stable identities; render their saved/provider names when mapped metadata is unavailable. Missing metadata must not silently erase a counted player.

## Data and states {#data}

Football reads `UserFantasySquad`/`UserFantasySquadPlayer`, `FantasyProviderRound`, `SportsRuSquadSnapshot` or `FantasyProviderSquadSnapshot`, and the current `UserExternalProfile`. KHL reads its isolated squads, entries, verified weeks and provider snapshots. Player names and clubs come from the existing contest catalog or saved placeholder metadata. Source snapshot payloads and user profiles are not copied to the result.

`READY` means at least one complete comparable pair, including unchanged pairs. `NO_BASELINE` means the latest eligible round/week is absent; `NO_COMPARABLE_SQUADS` means that round exists but no participant has a complete matching baseline and saved plan. Football `NO_NEXT_ROUND` means there is no future target. These states do not indicate a request failure.

## API and resource bounds {#contracts}

`GET /api/machete/platform-transfers?contestId=...&module=football|khl` uses session auth and the existing KHL enablement gate. Omitted module means football. Response has contest/provider/season, baseline and target round labels/IDs, `asOf`, `status` (`READY`, `NO_BASELINE`, `NO_COMPARABLE_SQUADS`, `NO_NEXT_ROUND`), participant/comparable/excluded counts, and `buys`/`sells` entries with player ID/name/team/position/count/percent. The API returns aggregates only with `Cache-Control: private, no-store`.

Reads use batches of at most 100 latest participant variants, selecting only IDs, saved selections/filters, and one matching baseline per participant. Provider payloads and forecast pools are never loaded. Aggregation retains player counters and at most one batch; metadata is resolved only for the returned top ten identities. A repeatable-read transaction keeps the result internally consistent. No process-global cache, timer or in-flight registry grows with visitors.

## UI and failure states {#ui}

The compact panel is visible in each Squad workspace, with two top-five lists “Берут” / “Продают”, counts and percentages, baseline → target labels and sample coverage. It loads after mounting and refreshes on explicit request or a successful squad save/import; it does not poll. Abort obsolete requests on scope change/unmount and never show a previous league's response under the new league heading. Preserve keyboard controls, light/dark tokens and readable mobile layout without horizontal page scrolling.

Empty changes show “Пока без изменений”; unavailable baseline, no comparable squads and season end explain their specific state. Request failures show an error with retry, not zero transfers. The panel explains that the sample consists of saved platform plans and one latest variant per participant.

## Errors and validation {#errors}

Validate module and bounded contest ID before querying. Unknown contests return 404; malformed requests return 400; unauthenticated requests preserve existing auth responses. Database errors retain the shared API error behavior. Reject broken rosters wholesale instead of treating missing selections as sales. Never use an older round for a participant missing the latest baseline.

## Traceability {#traceability}

Ownership markers belong on the pure counting module, server readers, aggregate route, shared UI component and direct contract tests. Existing save/import services retain their owners and emit the existing save event (also from KHL) for refresh.

## Acceptance {#acceptance}

- Known set differences produce the expected counts, percentages and stable top five; unchanged/bench/captain/duplicate variants do not inflate totals.
- Provider, contest, season, profile/entry and latest-round boundaries are checked against fixtures; older or broken data are excluded.
- Empty, error, mobile, dark-theme and scope-change states preserve truthful labels and existing controls.
- SQL runs on PostgreSQL, batched reads stay bounded, and repeat reads create no persistent data/cache/processes.

## Relationships {#relationships}

- `spec://modules/machete/FEAT-006-sports-popularity#sources` — external Sports popularity remains separate.
- `spec://modules/khl/FEAT-002-khl-squad#sports-import` — trusted KHL baseline import.

## Changelog {#changelog}

- 2026-10-06: Created and activated for the requested platform-only per-league transfer mini block.
