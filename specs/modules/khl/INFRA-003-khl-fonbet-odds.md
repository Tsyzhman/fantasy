---
status: draft
---

<a name="root"></a>

# INFRA-003: Fonbet hockey odds {#root}

<a name="plain-language"></a>

## Plain language {#plain-language}

Fonbet hockey odds are stored with their exact settlement conditions and history.

<a name="goal"></a>

## Goal {#goal}

Do not mix the outcome in 60 minutes with the outcome with overtime and shootouts.

<a name="governing-specs"></a>

## Governing specifications {#governing-specs}

Product boundaries: `specs/common/main.md`; mutual contracts and exact links are listed in #relationships. The document remains draft until the listed source/rules gates are closed.


<a name="scope"></a>

## Scope {#scope}

Get KHL odds from Fonbet. The current `src/providers/fonbet/odds.ts` uses football factor IDs and pairs of individual totals 0.5/1.5. The hockey adapter should not inherit their value by matching numeric ID. `src/machete/fixture-odds-sync.ts` and scheduler select football leagues and rounds: their behavior is preserved.

The transport available in the code uses `events/listBase?lang=ru&scopeMarket=1600`. The specific completeness of hockey markets, factor IDs, and stability of unloading have not been tested by this task. ODD-00 - mandatory probe on the current payload before implementing the parser. Base URL configurable; new domains are not guessed. This is analytical data: placing bets is not included.

<a name="markets"></a>

## Market semantics {#markets}

The implemented circuit WI-023 is limited to prematch 1/X/2 for 60 minutes. Probe 2026-09-14: 12 of real KHL events from the hockey tree (root 2, regular season 13283), Fonbet catalog `line/factorsCatalog/tables`, “Outcomes” table: 921=1, 922=X, 923=2. The “Final Victory” table is separate and not used. The conditions of regular time are confirmed by the Fonbet hockey rule 10.1. The dictionary is rechecked daily for names and positions; other markets remain untested. A compressed set of real examples is stored in src/providers/fonbet/fixtures/khl-line-20260914.json. The “Hosts/Guests” aggregate, child periods and live are excluded. eventBlocks.state=blocked immediately pauses the trio.

Required market key: `providerEventId + marketType + settlementScope + period + selection + line + marketVersion`. Values ​​of `settlementScope`: `REGULATION_60`, `INCLUDING_OT_SO`, `INCLUDING_OT_NO_SO`, `UNKNOWN`; period `FULL_GAME|P1|P2|P3|OT`. UNKNOWN is saved for diagnostic purposes and is not used in prognosis.

| Market | Acceptable interpretation |
|---|---|
| 1/X/2 for 60 minutes | Home win/draw/guest win in regular time; need a complete triplet of one photo |
| Winner with OT and shootouts | Two outcomes of the match; does not replace the probability of winning in regular time |
| General total / individual total | Save the number line, side, period and real calculation conditions; total 5.5 for 60 minutes and 5.5 with OT/shootouts - different markets |
| Handicap | Signed line from the point of view of the selected command, push conditions; do not output ready-made xG directly |
| Clean sheet / correct score / other | Only with a confirmed market dictionary. No line - null, no fictitious quotes |

The procedure for calculating a winning shootout goal in totals is part of the provider rules; it cannot automatically be considered a player's goal/goalkeeper's goal. The Odds model should take into account the probability of OT and model the distribution of team outcomes separately from G/A/GA and official FP.

From the complete mutually exclusive outcomes of one market/snapshot, approximate probabilities can be obtained by removing the proportional margin: `p_i = (1/odds_i) / sum(1/odds_j)`. This is a model, not a bookmaker fact. Incomplete pair/triple, odds ≤1, NaN, wrong side or incompatible conditions → probability=null. Integer/Asian totals with return cannot be interpreted as a simple binary pair without a push model.

Cannot `P(ОТ-победы) = P(победы с ОТ) − P(победы за 60)` without a consistent joint model: independently refined margins may produce inconsistent probabilities. Fit four outcomes W60/W_OTSO/L_OTSO/L60 with the sum 1, non-negativity and fit quality check. For a bad fit, use a proven hockey baseline with a warning, do not trim negative values, and declare the result accurate.

<a name="matching"></a>

## Event mapping {#matching}

1. Select hockey and a confirmed KHL competition for the current season from the sport tree; exclude NHL/MHL/friendlies, simulations and live from prematch calculations. The name "hockey" by itself is not enough.
2. Bring clubs through verified alias → internal KhlTeam IDs. Home/away save; do not guess the reverse orientation.
3. UTC start time with initial tolerance ±15 minutes, then exactly one candidate with both teams, competition and date. To transfer, use existing external event mapping and recheck, do not expand the window to several days.
4. Parent event of the match is separated from child events of periods/markets. Same names in multiple events do not create multiple matches.
5. Zero/multiple candidates → UNMATCHED/AMBIGUOUS, separate trial queue. Save source, reasons and matching version; do not match on the same team.

<a name="snapshots"></a>

## Pictures and freshness {#snapshots}

Store immutable revisions of the normalized set of markets (INFRA-002), fetchedAt, sourcePublishedAt if available, completeFeed flag, payloadHash, parserVersion, status. Matching the last hash only updates lastSeenAt; a new price, line or status creates a revision. Returning A→B→A creates a third revision, even if the raw bytes are already in the cache. The time series must distinguish between the moment of observation and the moment of change, and the forecast refers to an accurate revision.

Statuses: `AVAILABLE`, `SUSPENDED`, `WITHDRAWN`, `STALE`, `UNMATCHED`. In case of obvious stopping/removal, apply immediately. Absence on one request means WITHDRAWN only if a complete successful snapshot of the specified scope is proven; for delta-feed - only explicit tombstone. Timeout/error/truncated page means stale, not mass withdrawal. Old values ​​are visible with the date, but do not become the current line after disappearance.

Initial polling: once every 15 minutes for the next 7 days, once every 60 s for matches in the next 6 hours, with allowed limits. Freshness for recommendations: ≤5 min within 6 hours before the match, ≤30 min further; after prematch starts, the line is unusable regardless of TTL. The distant week may be without coefficients, the UI shows the absence and the source of the baseline. No-vig calculations only within one snapshot, no “over yesterday + under now” pairs.

Retention: raw answers are included in the general KHL raw budget from INFRA-001; compact line changes - season +90 days with permitted storage. Indexes match/market/observedAt; historical reading is limited by spacing and pagination. Statuses and disappeared markets are involved in hash/invalidation.

<a name="acceptance"></a>

## Acceptance criteria {#acceptance}

- ODD-00: current Fonbet samples of at least 10 KHL events, all necessary types of markets and a factor/period/settlement dictionary with proven human-readable names; HTTP and stability tested with staging. If the required market does not exist, the forecast is unavailable and limited.
- ODD-01: separate 1X2 for 60 and winner with OT/shootout are saved and displayed separately; identical line in different scopes does not merge.
- ODD-02: ambiguous clubs, two events on the same day, team reshuffle, transfer and child period do not lead to false mapping.
- ODD-03: the complete triple gives the sum of the probabilities 1 with the tolerance 1e-6; an incomplete/invalid line gives null; removed and stale lines are excluded from the current calculation.
- ODD-04: replay payload does not create a new revision; explicit withdrawal and outage are different; data as of the backtest date does not contain later quotes.
- ODD-05: existing football odds tests and scheduler tests pass without changing expectations; hockey syncs do not write FixtureOddsSnapshot.

<a name="relationships"></a>

## Related specifications {#relationships}

`spec://modules/khl/INFRA-001-khl-data-ingestion#operations`, `spec://modules/khl/INFRA-002-khl-storage-and-api#schema`, `spec://modules/khl/FEAT-003-khl-projections-and-optimizer#forecast`.

<a name="changelog"></a>

## Changelog {#changelog}

- 2026-09-28: English documentation, repaired document references, and GitHub navigation anchors (WI-039).

- 2026-09-14: checked 12 current KHL events and dictionary 1/X/2 for 60 minutes; separate parser/sync, strict aliases, freshness and beta correction of the opponent (WI-023). Gates of other markets have not been withdrawn.

- 2026-09-07: during integration, the original anchors and requirements are preserved; added mandatory sections of the current standalone protocol and implementation trace. Draft gates have not been removed.

- 2026-09-07: new contract recorded; factor IDs and line delivery remain subject to ODD-00.

<a name="environments"></a>

## Environments and dependencies {#environments}

Fixtures and normalized adapter are checked locally; production dictionary/transport require separate confirmation.

<a name="decisions"></a>

## Canonical decisions {#decisions}

Own hockey dictionary; football factor IDs are not reused (#markets).

<a name="runtime"></a>

## Runtime and operations {#runtime}

Obtaining and validating the full image precedes publication; outage does not mean withdrawal (#snapshots).

<a name="data"></a>

## Data and state {#data}

Event mappings, period/scope/line, raw odds, normalized probabilities, timestamps and immutable revisions (#markets/#matching/#snapshots).

<a name="contracts"></a>

## Contracts {#contracts}

Mapping requires precise commands/timing and a proven dictionary; incompatible markets do not merge.

<a name="recovery"></a>

## Rollout, rollback, and recovery {#recovery}

After outage, the saved snapshot becomes stale; the fix creates a revision, the replay is not duplicated (#snapshots).

<a name="observability"></a>

## Observability {#observability}

Unmatched events, coverage, stale/withdrawn, dictionary version and source health are controlled.

<a name="traceability"></a>

## Implementation traceability {#traceability}

src/providers/fonbet/hockey-markets.ts, hockey-markets.test.ts; src/server/khl/odds-storage.ts. Final acceptance is determined by #acceptance; implementation status - docs/guides/KHL_IMPLEMENTATION_STATUS.md.
