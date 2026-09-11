# Production acceptance — WI-018

Date: 2026-09-11. Version: 0.3.68. Runtime commit: `ec5d6f20bdf4b26831ebec30d3b6e98053e2c62d`.
[Deploy workflow](https://github.com/Tsyzhman/fantasy/actions/runs/34600220468): success, including canary and exact revision verification. Active web and worker healthy.

Before: no hourly SorareInside importer or persistent SorareInside identity bindings.
After: worker startup catch-up and every hour at minute 05; nearest future club fixture across competitions; permanent source UUID → canonical player/team identity; atomic complete XI only. Existing UI and saved user squads are unchanged.

- First application: 150 APPLIED, 60 UNCHANGED, 16 preserved team scopes.
- Actual scheduled start: 13:05:00.005 UTC / 16:05 Moscow. Completed 13:08:21.378 UTC.
- Scheduled result: 3 APPLIED, 207 UNCHANGED, 9 PLAYERS_UNMAPPED, 5 NO_MATCH_OR_TEAM_MAPPING, 2 SOURCE_ERROR. Next run: 14:05 UTC.
- 210 team scopes verified directly in the database: exactly 11 active starters each; every flag matches the source UUID through its saved map.
- Persistent mappings: 2027 players, 184 clubs; no reverse duplicates. Shared database lock also verified with a competing invocation.
- Refresh queue: 0. CURRENT_XI snapshots: 33 READY.
- Tests: 1107 passed, 1 skipped; lint, typecheck and build passed. Spec snapshot current, no diagnostics.

## Preserved scopes

No matching fixture/club: AEK Athens, Slavia Prague, Slovan Bratislava, Shakhtar Donetsk, Sabah FK (Champions League scopes).

Incomplete source XI (only 5 starters): Viking, Bodø/Glimt.

Unmapped or inactive roster player: PSV Eindhoven / Noah Fernandez; West Ham United / Mohamadou Kanté; Genoa / Stephan El Shaarawy; Rayo Vallecano / Gnangoro; Málaga / Ángel Recio; Vitória de Guimarães / Thiago Balieiro; Lokomotiv Moscow / Aleksandr Siljanov; FC Groningen / Jorg Schreuders; AZ Alkmaar / Ro-Zangelo Daal. Detailed UUIDs and fixture provenance are in `production-runs.json`. This is intentionally partial coverage: none of these cases justifies guessing an ID or clearing a team.

## Resources and secrets

Standalone CLI dry-run RSS: 136 MiB. Shared worker after both runs: 1.293 GiB, including unrelated existing workers; this observation is not a long-term leak assessment. Web: 356.9 MiB; PostgreSQL: 1.041 GiB. Docker build cache: 661.6 MB, below the existing 1 GB retention threshold. One normal stopped rollback release retained; no temporary audit containers.

Removed 18 local investigation files (including session cookies and source response bodies) and 3 server audit files. Bounded evidence contains no credential. Credential config is mode 0600 under a mode 0700 directory, injected only into worker. Private before-image retained at `/home/deploy/.config/fantasy-scout/sorareinside-before-20260911.json` (226 teams, 10036 flags). Image rollback alone does not restore imported flags.
