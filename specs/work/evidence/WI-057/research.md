# Deadline forecast investigation — 2026-10-09

Production was inspected read-only through SSH alias `deploy`; no credentials or personal report payloads are retained here.

## Findings

- All five morning campaigns ran DATA_REFRESH at 08:10–08:11 Moscow and BUILD_REPORTS at 08:15. DATA_REFRESH results contained Sports sync and ownership only, with no XI refresh. The implementation never called SorareInside in this stage.
- `build.ts` considered a missing `probableLineup.observedAt` stale, including a completely absent `probableLineup`. `unknownCause` checked this stale flag without checking forecast availability. That produced the misleading «прогноз основы устарел».
- At 10:03:38–10:05:34 Moscow, the latest observed SorareInside run completed PARTIAL: 223 UNCHANGED, 3 APPLIED, 11 PLAYERS_UNMAPPED, 5 NO_PREDICTION_FOR_NEAREST_MATCH, 19 NO_MATCH_OR_TEAM_MAPPING, 1 SOURCE_ERROR.
- Barcelona, FC Groningen and Dynamo Makhachkala have no accepted `probableLineup` in their current fantasy league. Their latest import was PLAYERS_UNMAPPED: Rodrigo (UNMAPPED), Jorg Schreuders (ID_NOT_IN_ACTIVE_ROSTER), Mahmudjon Maxamadjonov (UNMAPPED), respectively. The complete-XI guard correctly preserved existing flags instead of applying partial forecasts.
- Spartak Moscow, Fakel, Baltika, Watford and Académico Viseu had freshly checked future-match metadata. Source publication timestamps were older than check/application timestamps; the report uses the check/application time rather than treating an unchanged source publication as stale.
- Fixture coverage previously counted every target-round fixture close to the source kickoff, without filtering by the player's club. One source lineup could therefore count unrelated fixtures or imply complete double-round coverage.

## Corrections

- Missing/applicability failures become «прогноз основы недоступен». Old applicable evidence still reports staleness, and cannot assert OUT_OF_XI.
- The 08:10 stage awaits a shared, completed XI refresh started after its morning threshold. Its dataset result contains actual scope coverage and does not claim success for missing/partial scope data.
- A BUILD_REPORTS claim waits while the same campaign/input version's DATA_REFRESH is queued or running. Existing locks, bounded attempts, hourly schedule, XI completeness and mapping checks remain in use.
- Visible OUT_OF_XI becomes «вне основы по прогнозу» and omits only its missing-ALT detail. Other causes and unmodified diagnostic findings remain available.

## Initial resource snapshot

Web 150.2 MiB; worker 1.668 GiB; PostgreSQL 1.105 GiB; host available 6,022 MiB. Ten SENT records include the five explicitly requested earlier resends. No new send is part of this correction.

Forum research was consulted before implementation; production code, database and the provider's logged validation outcomes are the evidence for this diagnosis.
