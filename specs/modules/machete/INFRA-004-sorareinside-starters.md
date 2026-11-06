---
status: active
---

<a name="root"></a>

# INFRA-004: SorareInside Foundation {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

Starting-lineup flags refresh every hour at minute 05. Use the published SorareInside forecast for the club's nearest future match when available. Otherwise the verified XI from the latest finished club match can supply the flags.

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
Persistent UUIDs are stored in a common mapping table. Choose the nearest fixture before inspecting the forecast. Both forecasts and last-played lineups require a complete XI. Use the existing transactions and Squad refresh queue.

<a name="source"></a>

## Source and match selection {#source}
Authorized API `https://platform-api.sorareinside.com`, the same one the site uses. `/gameweeks` sets the current windows, `/games` returns the schedule along with nullable links to forecasts, `/lineups/:id` returns the published forecast. All windows with an end in the future and a start within 14 days are loaded, as well as scheduledLineups. First, the minimum future date of the team is selected, then its lineupId; matches without a forecast cannot be discarded until the minimum is selected. Past, canceled, postponed and already started matches are excluded. Unknown format/status closes the entry. Conflicting schedule duplicates block the cycle. Incomplete loading of any window prevents the entire loop from being applied.

Derive the relevant club scope from active clubs in the current fantasy price scopes before parsing fixture metadata. Use established source UUIDs and the existing exact club/country identity rules, including reviewed aliases. Discard fixtures involving no relevant club before validating their countries, statuses or forecasts. Do not request or parse lineups for unrelated clubs. The scope covers every source competition of each relevant club, including cups, and never depends on the presence of a prediction. A potentially relevant club with incomplete identity remains subject to strict validation rather than being silently excluded.

The scheduledLineups projection may omit a club's country. For a relevant club, reuse country only from complete gameweek data loaded in the same cycle for the identical source UUID, name, slug and club/national-team type. Full gameweeks still require country for relevant clubs. Missing or conflicting corroborating metadata aborts the cycle. An unrelated opponent retains its validated fixture identity and name, but its country and forecast are not prerequisites for the relevant club's prediction. Never infer country from a club name, discard an unparseable window, or choose a later fixture to obtain a prediction. An empty validated scoped calendar reports missing matches and allows the last-played path.

<a name="mapping"></a>

## Identity and data {#mapping}
The existing `ProviderEntityMap` is used: provider `SORAREINSIDE`, providerSeason `GLOBAL`, types TEAM/PLAYER, source UUID → FotMob ID. There are no new columns or player copies. Primary automatic binding requires a unique strict match of the normalized name/full slug within the club, or a match of the full date of birth and the significant name token. One date of birth without name verification is not enough. If there are dates of birth, they must match. Teams are matched strictly by normalized name/explicit verified alias and country. Ambiguity, date contradiction, duplicate internal IDs and IDs outside the active roster block the command from being used. An existing ID is not replaced by a name search. Bindings are only preserved by apply, a unique upsert, without changing the already established mapping. For new mismatches, the operator can record the verified binding.

Mapped Sports.ru prices checked within 48 hours may supply a full-name alias and birth date for the same canonical player and club. The price foreign key alone is insufficient: its MATCHED provider mapping must agree on player, contest and season. Conflicting birth dates or competing mapped club assignments are rejected. An existing inactive member may be restored only in the exact current league/season/club when a fresh mapped Sports.ru price, the published XI's full birth date and corroborated name agree, and there is no active membership in another club of that league/season. Missing roster rows, stale prices and transfer conflicts still block the whole XI. Revalidate that evidence and restore membership under the starting-XI transaction before validating the active XI; a failure rolls back membership, mappings, flags, metadata and refresh requests together. Keep the membership's source so normal roster refresh can deactivate it when corroboration disappears.

An operator may review a known birth-date discrepancy after corroborating the player's identity with official club or league evidence. The exception requires an existing MATCHED SorareInside UUID, the exact canonical player and active club, and the two reviewed dates. A different binding, date or club still fails the normal validation. The reviewed record does not set a birth date or create a mapping.

<a name="apply"></a>

## Application and competition {#apply}
Only `lineup_players.starting_players`, exactly 11 unique players and one goalkeeper; not alternate_players and not the total start percentage. Game_id, team.id, is_published and future date are checked immediately before recording. In one transaction, under the existing starting-xi lock, the checkboxes are changed and a CURRENT_XI snapshot update request is written. An existing framework application implementation is used. Metadata stores match ID, kickoff, lineup ID, check time, source and fingerprint, including the case of permanent checkmarks. As long as the prediction is for a future match, other automated sources will not overwrite it. Manually setting the base retains the same scenario; the next import applies the current forecast according to the schedule.

Ordinary club-roster refreshes atomically merge their metadata into the current database row and never replace the `probableLineup` field. Logo/short-name updates preserve the forecast's source, selected fixture, check time and fingerprint, including when a lineup publication happens concurrently.

If the scoped calendar has no matching upcoming fixture, the nearest fixture has no published forecast, or its published starter list fails the full-XI check, take the latest finished, non-cancelled club match in the shared FotMob data across competitions. Choose the match before checking lineup completeness. Use the match's actual starters only when there are eleven unique players, one goalkeeper, and every player is active for that club in the target fantasy scope. Missing memberships and conflicting active club assignments block the fallback. A stored SorareInside forecast for a future kickoff and a newer recorded completed match have priority. Revalidate under the same team lock and publish changes through the existing CURRENT_XI queue.

Store fallback provenance as `FOTMOB_LAST_PLAYED` with the completed match ID, kickoff and fingerprint. The fallback is a basis for Squad and is not an upcoming prediction for deadline reports. Repeating the same XI preserves the metadata and queues no update once that match is recorded.

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
Authorization, transport, or unexpected schema failures preserve existing flags. Player-identity conflicts still block the forecast for the whole team. If a last-played lineup cannot be verified, preserve the prior flags. Reports distinguish SorareInside coverage from last-played results and include the match and reason. Rerunning does not duplicate mappings or queue entries. Unchanged flags do not trigger recalculation. The logs are limited by Docker rotation.

<a name="observability"></a>

## Observability {#observability}
Worker reports next run in UTC, cycle total, number of commands changed/unchanged/skipped and memory. For a missed team, the selected match and reason are visible. Partial success is not called complete coverage.

<a name="recovery"></a>

## Rollout, rollback, and recovery {#recovery}
Clean commit to origin, checks, production dry-run and canonical Docker deploy. Prior to application, a limited snapshot of the affected checkmarks/metadata is saved for recovery. Disabling the feature flag stops new launches; rollback of the image returns the previous worker. There is no destructive migration.

<a name="acceptance"></a>

## Acceptance criteria {#acceptance}
`@spec` on provider parser/client, sync, scheduler, CLI, guard and direct contract tests. Verify nearest and latest match selection before checking lineup completeness, exact manual bindings, active players, forecast precedence, atomic publication, :05 scheduling and concurrent launch. Production evidence confirms real data, schedule, memory and repeat runs without duplication.

<a name="traceability"></a>

## Implementation traceability {#traceability}
`src/providers/sorareinside/`, `src/machete/sorareinside-sync.ts`, `src/machete/sorareinside-identity.ts`, `src/machete/sorareinside-protection.ts`, `src/machete/sorareinside-last-played.ts`, `src/server/sorareinside-scheduler.ts`, CLI and automatic writers. Direct unit/contract tests refer to the owning anchor.

<a name="relationships"></a>

## Related specifications {#relationships}
Existing probable-lineup sync, starting-xi-from-match, fantasy-player-pool-refresh-queue; `docs/operations/DEPLOYMENT.md`.

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-11-06: WI-097 — record exact reviewed SorareInside birth-date exceptions and fall back to the verified XI from the latest finished match when the nearest forecast is unavailable.

- 2026-11-04: WI-083 — determine current fantasy club scope before schedule validation so unrelated source clubs cannot abort imports; retain nearest-match selection across all competitions and strict relevant-club/XI checks.

- 2026-10-23: WI-080 — accept the sparse scheduled-lineups club projection only with exact same-cycle complete identity metadata; retain all schedule and XI safeguards.

- 2026-10-09: Verified fresh Sports.ru full-name aliases and atomic corroborated restoration of inactive current-club members prevent valid XI rejection without guessing identities (WI-058).
- 2026-10-09: Bound the corroborating Sports.ru price write batch to 60 seconds so startup load does not cancel a normal tournament at the default five seconds (WI-058).
- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).
- 2026-09-11: SorareInside import canon created.
