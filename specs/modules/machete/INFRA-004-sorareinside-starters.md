---
status: active
---

<a name="root"></a>

# INFRA-004: SorareInside Foundation {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

Starting-lineup flags refresh every hour at minute 05 from SorareInside forecasts for the club's nearest future match. An unknown player or a missing forecast preserves the previous flags for the whole team.

<a name="scope"></a>

## Scope {#scope}
Controlling product canon: `specs/common/main.md`. Region - current seasons with fantasy prices and active club rosters. Saved user squads, national teams and the interface do not change. All source tournaments participate in the selection of the club's next match, including cups. The resulting club forecast is applied to the available current fantasy pools of that club.

<a name="goal"></a>

## Goal {#goal}
Maintain an up-to-date basis for the forecast of the next match without re-guessing the identity of the players and without clearing the team when the source is incomplete.

<a name="governing-specs"></a>

## Governing specifications {#governing-specs}
Legacy product canon: `specs/common/main.md`; runtime ownership: `specs/common/structure.md`; issue: `docs/operations/DEPLOYMENT.md`.

<a name="environments"></a>

## Environments and dependencies {#environments}
Node.js 20+, Prisma/PostgreSQL, HTTPS access to SorareInside. Production is an existing Docker worker. Web does not receive origin credentials. The CLI uses the same database connection and explicit environment credentials.

<a name="decisions"></a>

## Canonical decisions {#decisions}
Persistent UUIDs are stored in a common mapping table, the calendar is selected before the forecast, the entry is performed only for the full XI. Cache protection and updating use the project's existing transactional mechanisms.

<a name="source"></a>

## Source and match selection {#source}
Authorized API `https://platform-api.sorareinside.com`, the same one the site uses. `/gameweeks` sets the current windows, `/games` returns the schedule along with nullable links to forecasts, `/lineups/:id` returns the published forecast. All windows with an end in the future and a start within 14 days are loaded, as well as scheduledLineups. First, the minimum future date of the team is selected, then its lineupId; matches without a forecast cannot be discarded until the minimum is selected. Past, canceled, postponed and already started matches are excluded. Unknown format/status closes the entry. Conflicting schedule duplicates block the cycle. Incomplete loading of any window prevents the entire loop from being applied.

<a name="mapping"></a>

## Identity and data {#mapping}
The existing `ProviderEntityMap` is used: provider `SORAREINSIDE`, providerSeason `GLOBAL`, types TEAM/PLAYER, source UUID → FotMob ID. There are no new columns or player copies. Primary automatic binding requires a unique strict match of the normalized name/full slug within the club, or a match of the full date of birth and the significant name token. One date of birth without name verification is not enough. If there are dates of birth, they must match. Teams are matched strictly by normalized name/explicit verified alias and country. Ambiguity, date contradiction, duplicate internal IDs and IDs outside the active roster block the command from being used. An existing ID is not replaced by a name search. Bindings are only preserved by apply, a unique upsert, without changing the already established mapping. For new mismatches, the operator can record the verified binding.

Mapped Sports.ru prices checked within 48 hours may supply a full-name alias and birth date for the same canonical player and club. The price foreign key alone is insufficient: its MATCHED provider mapping must agree on player, contest and season. Conflicting birth dates or competing mapped club assignments are rejected. An existing inactive member may be restored only in the exact current league/season/club when a fresh mapped Sports.ru price, the published XI's full birth date and corroborated name agree, and there is no active membership in another club of that league/season. Missing roster rows, stale prices and transfer conflicts still block the whole XI. Revalidate that evidence and restore membership under the starting-XI transaction before validating the active XI; a failure rolls back membership, mappings, flags, metadata and refresh requests together. Keep the membership's source so normal roster refresh can deactivate it when corroboration disappears.

<a name="apply"></a>

## Application and competition {#apply}
Only `lineup_players.starting_players`, exactly 11 unique players and one goalkeeper; not alternate_players and not the total start percentage. Game_id, team.id, is_published and future date are checked immediately before recording. In one transaction, under the existing starting-xi lock, the checkboxes are changed and a CURRENT_XI snapshot update request is written. An existing framework application implementation is used. Metadata stores match ID, kickoff, lineup ID, check time, source and fingerprint, including the case of permanent checkmarks. As long as the prediction is for a future match, other automated sources will not overwrite it. Manually setting the base retains the same scenario; the next import applies the current forecast according to the schedule.

<a name="data"></a>

## Data and state {#data}
`ProviderEntityMap`, `TeamPlayerSeason.isStarter`, `LeagueSeasonTeam.metadata.probableLineup`, `startingXiChangedAt`, `FantasyPlayerPoolRefreshRequest`. No new migration is required. Other metadata fields are preserved; full provider response and account data are not saved.

<a name="contracts"></a>

## Contracts {#contracts}
`npm run starters:sync-sorareinside -- --json` returns a report without a record; `--apply` allows recording. Worker connects the same sync from instrumentation. The report contains status, totals, commands, fixture/kickoff and mismatches; HTTP, application and mapping conflict give a non-zero CLI exit code.

<a name="runtime"></a>

## Runtime and operations {#runtime}
Worker starts one timer for the nearest :05 UTC (in Moscow it is also :05). Starting after a restart replenishes the condition. The default CLI is dry-run, `--apply` allows writing. Interprocess advisory lock does not allow simultaneous launch of scheduler/CLI. Feature flag `SORAREINSIDE_SYNC_ENABLED=true`; login and password only in the environment, without getting into Git/reports. Cookie authorization; requests are sequential, limited by timeout, size, number of windows/commands and total duration. Cookies are reused in the worker's memory; match and player data is not stored in the global cache.

The worker's existing Sports.ru scheduler refreshes the configured corroborating price scopes. The immutable promoter reads optional operator-owned `/home/deploy/.config/fantasy-scout/sports-ru.env` (mode 600) for `SPORTS_RU_FANTASY_SYNC_ENABLED`, `SCOPES` and `INTERVAL_HOURS`; it preserves existing container settings when that file is absent. Price scopes required for ongoing inactive-member reconciliation must continue to refresh within the 48-hour evidence window. The validated price batch has a bounded 60-second write transaction; provider HTTP completes before it begins, and timeout still rolls back the entire batch.

<a name="errors"></a>

## Errors and validation {#errors}
Authorization, HTTP/JSON, or schema failure does not reset the framework. A separate invalid squad saves the entire team. The log contains the result, the selected match, omissions and discrepancies without secrets and account data. Rerunning does not duplicate the mapping or cache queue; Unchanged checkboxes do not trigger recalculation. The logs are limited by the current Docker rotation.

<a name="observability"></a>

## Observability {#observability}
Worker reports next run in UTC, cycle total, number of commands changed/unchanged/skipped and memory. For a missed team, the selected match and reason are visible. Partial success is not called complete coverage.

<a name="recovery"></a>

## Rollout, rollback, and recovery {#recovery}
Clean commit to origin, checks, production dry-run and canonical Docker deploy. Prior to application, a limited snapshot of the affected checkmarks/metadata is saved for recovery. Disabling the feature flag stops new launches; rollback of the image returns the previous worker. There is no destructive migration.

<a name="acceptance"></a>

## Acceptance criteria {#acceptance}
`@spec` on provider parser/client, sync, scheduler, CLI, guard and direct contract tests. Checks: selection of the minimum before checking the presence of a forecast, UUID/duplicates, ambiguity and club change, 11 players, atomicity/cache, :05 and competitive launch. Production evidence confirms real data, schedule, memory and re-run without duplication.

<a name="traceability"></a>

## Implementation traceability {#traceability}
`src/providers/sorareinside/`, `src/machete/sorareinside-sync.ts`, `src/machete/sorareinside-identity.ts`, `src/machete/sorareinside-protection.ts`, `src/server/sorareinside-scheduler.ts`, CLI and automatic writers. Direct unit/contract tests refer to the owning anchor.

<a name="relationships"></a>

## Related specifications {#relationships}
Existing probable-lineup sync, starting-xi-from-match, fantasy-player-pool-refresh-queue; `docs/operations/DEPLOYMENT.md`.

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-10-09: Verified fresh Sports.ru full-name aliases and atomic corroborated restoration of inactive current-club members prevent valid XI rejection without guessing identities (WI-058).
- 2026-10-09: Bound the corroborating Sports.ru price write batch to 60 seconds so startup load does not cancel a normal tournament at the default five seconds (WI-058).
- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).
- 2026-09-11: SorareInside import canon created.
