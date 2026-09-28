---
status: active
---

<a name="root"></a>

# FEAT-002: Hockey Squad on 17 players {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

Hockey squad planning, fixtures, and player comparisons are available in a separate workspace.

<a name="goal"></a>

## Goal {#goal}

Give the user a verifiable local plan, preserving all 17 active locations.

<a name="governing-specs"></a>

## Governing specifications {#governing-specs}

Product boundaries: `specs/common/main.md`; mutual contracts and exact links are listed in #relationships. Canon is active upon user request; source/rules gates determine the availability of relevant features, not the status of the document.


<a name="scope"></a>

## Scope {#scope}

The user sees all 17 players and the remaining matches of each, selects a replacement taking into account TOI, power play, goalkeeper starting probability, price and lock. No bench and assignment of starters 11. Existing football `FantasySquadPlanner` does not scale to hockey by CSS swap: new squad `src/components/khl/KhlSquadPlanner.tsx` with separate DTOs and domain logic.

Neutral dialogs, buttons, accessibility, formatting, mechanics for canceling worker and saving widths can be highlighted/reused. Football columns, `FantasyPositionGroup`, 60-minute probability, captain multiplier and bench selection do not work in KHL props.

<a name="layout"></a>

## Layout {#layout}

Top line: KHL / season / official week with its interval / lineup option / last synchronization. Next is the budget panel: cost 17, bank, available capital, occupancy G 2/2 · D 6/6 · F 9/9, balance of official transfers or “unknown”.

All three KHL views display a server refresh panel near the title: catalog publication date/time, last fully successful cycle, and the latest completed attempt with success/error/pending status. An active or interrupted cycle is separate. Dates use `Europe/Moscow` and an explicit `МСК` label; missing dates are unknown. Source failures name the affected sources and explain that saved data remain available. The lightweight panel refreshes once per minute while visible and preserves the last known state if its status request fails, with an explicit verification warning. Updating status does not claim that the visible player table was reloaded; the existing “Обновить статистику” control remains available.

Design adapts Football Squad: general contact sheet classes, name bar, metrics block, direct pin/delete and thematic tokens. Football rules are not transferred. If there is no photo, initials are used; unconnected data remains “—”.

Desktop ≥1280px adapts the desktop football SquadPitch: compact cards on the site on the left, a catalog on the right with internal scrolling and a fixed header. All 17 are active; groups G(2), D(6), F(9), compact rows without a football bench. Mobile/tablet adapts SquadTouchRoster: a separate vertical list by position with readable indicators and actions ≥44px. Empty spaces are available for position selection, details and rearrangements are accessible from the keyboard. There is no general horizontal page scrolling.

The order of slots can be changed via drag-and-drop and keyboard buttons; Rearrangement within one position is permissible. Does not change the squad, transfer counter and forecast. An incomplete draft shows empty slots and missing positions, COMPLETE requires exactly 17.

<a name="cards"></a>

## Cards {#cards}

General: name/photo with fallback, club and position, current price/delta, official FP separately from the expected EP, remaining games of the selected week, nearest opponent/home-away/start of Moscow time, injury/disqualification, provider lock with check time, “Save in selection” button with an icon different from provider lock.

Field: TOI/G and PP TOI/G (MM:SS), latest 5/10 matches with sample size, G/A, individual xG and definition, PP share/role (fact/estimate/unknown). Don't show football: xA from football model, per90, MID, yellow cards, 60-minute probability.

Goalkeeper: probability of starting **for each upcoming match**, status “confirmed/forecast/unknown”, source and date; expected time, SV/GA/SV%, expected saves and probability of a clean sheet given the model. “Played in the last match” is not the same as “starts today”. Do not consider both goalies of the selected club to start at the same time.

Detailed panel: “History”, “Match Forecast”, “Price”, “Sources” tabs. Show null as "-/no data" with reason. 0 - observation only. Mixed coverage is designated `PP TOI: 7 из 10 матчей`, do not take the average of ten followed by three zeros. Unknown should not be colored green.

<a name="table"></a>

## Table, filters and comparison {#table}

Each heading and cell has a hint: the meaning of the indicator, calculation method, selected period, actual value, coverage and source if available. The EP explains player specific components and beta limitations; the lack of xG is explained, not replaced by goals. The keyboard and touch have access to the general indicator help, hover - to the cell hint.

The “Excel · all players” button downloads the full catalog of the current tournament, regardless of the page, search, position and other filters. The server reads the negotiated snapshot; does not accept strings sent by the client and does not start updating external sources. XLSX includes current season totals, selected window averages, last season, FP/EP/ixG, coverage and sources, upcoming matches and help. Zeros are numbers, absence is an empty cell; numbers are displayed with a maximum of two decimal places, time is [m]:ss. Completeness is controlled by the number and uniqueness of IDs; exceeding the limit is explicitly rejected instead of truncated. The project's existing ExcelJS is used by the server without adding a client dependency.

Goals, assists, shots on target, penalty minutes and plus/minus are shown in separate sortable columns with coverage. Periods: current season, last matches, last season. Archive amounts are not mixed with current amounts; EP refers to the future regardless of the statistical period. Numbers in the table, cards, comparisons, and explanations have a maximum of two decimal digits; the accuracy of the calculations is maintained. The time is displayed MM:SS. No data - "—", known zero - 0.

TOI, PP, PK and time in attack - four independent columns with MM:SS values ​​and coverage. Clicking the title enables numeric sorting, repeating reverses the direction; null is the last one left. The same selection is available in the table settings and is saved for the user. The season/last matches are clearly signed.

| View | Default Columns |
|---|---|
| All | Player, position/club, price/delta, games left, EP of the week, EP/game, last window FP, availability/lock |
| D/F | Additional TOI/G, PP TOI/G, PP share/role, G/A, +/−, PIM, SOG, ixG and coverage |
| G | Additionally start probability of the nearest match, expected starts of the week, TOI/G, SV, GA, SV%, full-game shutout probability |

Extended columns: PK TOI, blocks, shifts, % ownership, matches/TOI samples, EP/1000 prices, forecast interval, source recency. Goalkeeper rates are calculated using the correct denominators: SV% = saves/(saves+GA) with a known non-zero denominator, taking into account shootouts. Do not mix total FP and average FP in the same column.

Filters: G/D/F, club, price range, available/locked/injured/suspended/unknown, number of future games, TOI/G and PP TOI/G, observed or estimated PP role, goalie start probability, xG coverage, freshness, selected/watchlist, history 5/10/20 matches/season. Inapplicable filters are hidden when changing position; active restrictions are visible on chips with a separate reset. An explicit choice to “include the unknown.” Null-last sorting in both directions, stable tie-break ID. Search with debounce and cancellation of stale query.

Filters limit candidates, but do not remove already selected/keep players. If restrictions make selection impossible, show specifically the position/money/club limit deficit. Separate `KhlUserViewPreference`: order, visibility, widths, sorting, filters and compare do not overwrite football settings.

Comparison of 2–4 players: one contest/season/historyWindow/horizon; the base lines are common, the goalie and skater sections are labeled as different. Main differences - remaining matches and EP, price, TOI/PP, role, injuries/start. Delta from unknown data = unknown. Switching the week recalculates all columns consistently. No direct “goalkeeper is better than forward in terms of xG”.

<a name="transfers"></a>

## Transfers and individual locks {#transfers}

1. The user selects out/in, sees the current and proposed lineup, sale/purchase amount, bank after, used/remaining transfers, EP delta and remaining matches of both sides.
2. The change is effective from the specified moment: preview directly shows which future matches are lost when sold today. Already played FPs remain history and are not added to the newcomer’s forecast.
3. Service lock Sports.ru blocks the transfer of both parties; “Save in selection” only limits the optimizer and can be unchecked by the user. Trauma is the third independent status.
4. 30 minutes before the match the candidate is considered unavailable even if the previous lock snapshot is still false. Late unlocking only from a fresh source. In case of transfer and time conflict, reconciliation is required.
5. If the baseline/remaining transfers/price/lock are unknown or outdated, you can save the conditional draft, but you cannot sign it “acceptable on Sports.ru”. The future step is marked "check before execution", the future sale price is not guaranteed.
6. The button is called “Save plan”, the answer is clearly `externalExecuted:false`. External sending is not implemented, the football browser extension is not reused as a hockey submitter. You cannot spend an external limit from local rearrangement or script editing.
7. The second tab/changed source gives 409 with a proposal to update the preview, saving unsaved user intents. No partial saving of the pair, no silent price substitution.

<a name="sports-import"></a>

### Import squad Sports {#sports-import}

The “Import Sports Roster” button loads the current hockey team from the public profile associated with the current user. The server finds the team link, checks the owner, tournament and 17 unique players (2/6/9), matches only provider IDs. The bank is taken from the published team page, the unknown balance of transfers remains unknown. A successful import atomically saves the selected local option or creates a new one. An error, incomplete answer, or version conflict leaves the option unchanged. Without linking, a link to the profile settings is shown. Saving does not send changes to Sports.

<a name="quality"></a>

## States, availability, performance {#quality}

Clicking or touching EP opens a card with the “Expected indicators” section: basic G/A/SOG/PIM/+− for the match played, the values of each upcoming match and the total selected period. Original mediums, coverages and formulas are available without hover. Excel of the entire catalog includes a separate waiting list and match adjustments, numeric values ​​remain numbers with a maximum of two decimal digits displayed. The absence of a stakeout/line/full horizon is clearly indicated.

The card reveals the general EP formula, the contribution of G/A/+/−/PIM and the throwing signal, the number of current and past matches, the source of the archive. Penalty minutes are not referred to as the number of deletions. An unloaded or missing archive is clearly indicated.

Loading skeleton preserves geometry. Empty season, partial catalog, stale odds, xG unavailable, incomplete calendar, no feasible squad, source error, canceled solve and version conflict have different messages. Last-good pool is available with dates and restrictions; the error does not turn into “no players”.

Semantic headings and tables, focus in the dialog with returning to the original button, Escape for closing, aria-live for the result of saving/selecting. The status color is accompanied by text. All basic actions are available using the keyboard and touch; target ≥44px on mobile.

The catalog is given in pages, detail is loaded upon opening. For the selector, one compact pool of up to 1000 players without raw and full history. One worker per screen, requestId+inputRevision, canceling the old solve, terminate to unmount; Old week's replies are ignored. There are no more than 3 pools in the cache; Clear comparison and personal state when changing user. Goals on the agreed staging profile: p95 local selection/filter ≤100 ms, warm API ≤500 ms, cold pool ≤2 s, solve ≤5 s with cancelability. These are future measurable requirements, not the results of this task.

<a name="acceptance"></a>

## Acceptance criteria {#acceptance}

- UI-01: all 17 are visible on 360/390/768/1024/1440px; G/D/F=2/6/9, no bench/captain, cards are readable, body has no horizontal overflow.
- UI-02: rearranging the card does not change the EP/FP/limit amount; The user keep and provider lock are independently displayed and checked.
- UI-03: G/D/F tables, filters, null-last and comparison 2–4 work on a common horizon; KHL settings do not affect FPL/Sports.ru football.
- UI-04: locked/stale/unknown transfer balance, sale before a match that has not yet been played, 409 and conditional future plan verified by e2e.
- UI-05: keyboard/touch script runs without drag/hover; source reference available; the canceled worker does not update the UI.
- UI-06: 50 transitions between the KHL/FPL and 50 repeated selections do not increase the number of workers/listeners, after warming up the memory does not grow >10% in comparable measurements.

<a name="relationships"></a>

## Related specifications {#relationships}

`spec://modules/khl/FEAT-001-khl-module-and-rules#weeks`, `spec://modules/khl/INFRA-002-khl-storage-and-api#api`, `spec://modules/khl/FEAT-003-khl-projections-and-optimizer#optimizer`.

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-09-28: WI-042 — shared KHL header shows real server refresh times, full-success and last-attempt outcomes, pending work and interruptions, with bounded status polling.

- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).

- 2026-09-07: during integration, the original anchors and requirements are preserved; added mandatory sections of the current standalone protocol and implementation trace. Draft gates have not been removed.

- 2026-09-07: a project has been created to completely rework Squad, without implementing components.

<a name="actors"></a>

## Participants and triggers {#actors}

The roster owner selects, compares and saves players; the provider reports independent blocking.

<a name="scenarios"></a>

## Scenarios {#scenarios}

Opening and layout: #scope/#layout; cards and filters: #cards/#table; purchases, sales and keep: #transfers.

<a name="data"></a>

## Data and state {#data}

Squad, selected players, filters, current prices and provider locks; local bank is not an official snapshot.

<a name="contracts"></a>

## Contracts {#contracts}

Saving requires the owner and the current version; server preview and apply for saved transfer plans are described in #transfers.

<a name="errors"></a>

## Errors and validation {#errors}

Expired quote, version conflict, unknown price or unavailable purchase are not silently applied; the state remains available for correction (#quality).

<a name="traceability"></a>

## Implementation traceability {#traceability}

src/components/khl/; src/server/khl/transfer-plans.ts; e2e/khl.spec.ts. Final acceptance is determined by #acceptance; implementation status - docs/guides/KHL_IMPLEMENTATION_STATUS.md.

When logging in without a squadId, the last modified custom version of the selected tournament opens. A new empty option opens explicitly via new=1; other people's lineups are never selected by default.

- 2026-09-07: Restore the last native variant on login and explicitly create a new one.

- 2026-09-07: adaptation of the contact sheet and squad of the football Squad for the KHL.

### Seasonal protocol amounts

By default, the time and goalkeeper indicators show the totals of matches played for the current season. The mode of the last 5/10/20 matches with the averages is preserved. FP remains the average of official estimates; EP refers to the selected future period. Attack time is displayed separately in the catalog, card and match history. On the card for each total is the number of matches with a known value / the number of downloaded matches played; missing values ​​do not become zeros. If the direct source is unavailable, the facts are preserved and the reason for pausing auto-update is clearly shown.

- 2026-09-11: season sums according to protocols, attack time coverage and EP calendar mode for 7 days.

- 2026-09-13: individual sortable indicators, adaptation of the desktop site and mobile list, import of the current Sports team.

- 2026-09-13: Sports Last Season Archive, Normalized Limited Storage, New Metrics and EP Explained; numeric display up to two decimal digits.
- 2026-09-14: tooltips all headers/cells and full server-side upload of the entire catalog to XLSX regardless of filters and page.
- 2026-09-14: actual expected performance, original calculation disclosure, match adjustments and Excel expectation sheet (WI-023).
