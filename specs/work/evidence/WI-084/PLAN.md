# Production audit and implementation plan — 2026-11-04

Work: WI-084. Baseline: production 0.3.147/e765ab4, then independently authorized Sorare release 0.3.148/ef9830d during this audit. The audit branch incorporates ef9830d. Original Documents/fantasy_export is a stale dirty checkout and is preserved.

Execution update: PR53 is merged; PR54/0.3.152 is deployed through canonical run 41855866227 and independent Check 41855846586 passed. A01–A09/A13/A15/A16/A20–A22 remediation within the tracked scope is verified (A10/A11/A12 are investigation/operator handling, not blanket data repairs). WI-085/086/087/088/089/090 are complete. Full controlled franchise collection/calculation/import succeeded in 36m37s; file/database/reader and live desktop/mobile show November 4 data. The approved one-XI/any-active-duel rule yields 42,572 eligible observations, while 68,973 unique historical observations remain. All 434 full-cycle public probes passed; release monitoring separately recorded one pre-promotion client URLError among 312 probes, followed by 20 successful new-revision/old-CSS checks. Export max-boundary reclaim events were 1,313, zero OOM; TD-010 remains open for growth headroom. Follow-up items below remain planned, not completed.

## Evidence and limits

Server inspected over configured SSH deploy: container identities, limits, health, resources, PostgreSQL aggregate statistics, timers, bounded journals, backup inventory and Caddy aggregates. Evidence: server-before.json, services-before.txt, access-before.txt. Code review targets the deployed tree, not the stale checkout. Read-only backend reproductions use real functions with fake database/sender; UI keyboard reproduction uses an isolated browser. No real Telegram message was sent.

Initial host: 11,876 MiB RAM, approximately 4,989 MiB available, no swap; disk 42/119 GB used. Web approximately 890 MiB/2 GiB, worker 1.656/4 GiB, PostgreSQL 605 MiB/2 GiB. No OOM or restart in baseline. DB approximately 4.02 GB, 30 idle connections. Exactly one active project web/worker/relay plus rollback containers; other host projects are outside scope.

24-hour access: 2,113 requests, 4 server errors (0.189%), p95 proxy duration 273 ms. One-hour window: 1/47 errors (2.128%), so access-audit failed by its configured threshold; this is an alert, not evidence that the auditor is broken. Browser LCP/INP are not inferred from proxy timing. Franchise timer repeatedly fails before starting because MemAvailable is below its 6 GiB guard. Data-quality and Sports price health return 503 for incomplete coverage; FPL and core health return 200. No threshold will be weakened to conceal these failures.

## Prioritized findings and concrete changes

| ID | Priority | Before | Intended result and verification | Work |
|---|---|---|---|---|
| A01 | P1 | Node 24.21.0 predates October security patches | Digest-pinned supported Node 24.22.2, CI and runtime version verification | WI-087 |
| A02 | P1 | Delivery ignores cancelled campaign and current tournament subscription | Check consent/status before send; revoke pending deliveries; mocked send and DB regressions | WI-085 |
| A03 | P2 | 08:50 cutoff computed as 16:50 | Correct Moscow cutoff and boundary tests | WI-085 |
| A04 | P2 | Abandoned SENDING becomes misleading EXPIRED; publication not lease-fenced | Unknown delivery preserved without resend; transaction ownership/version guard | WI-085 |
| A05 | P2 | SortableTable cancels Enter/Space on nested native controls | Native activation preserved, header sorting and resizing retained | WI-086 |
| A06 | P2 | Touch actions modal lacks focus containment/return | Keyboard-safe dialog, Escape and focus restoration with regression checks | WI-086 |
| A07 | P1 | Franchise refresh repeatedly refuses host memory budget | Measure computation, reduce working set or bounded allocation safely; preserve host headroom and full output; verify refresh and new snapshot | WI-088 |
| A08 | P2 | Deploy dispatch can bypass audit/DB/migration checks present in Check workflow | Exact revision must pass full required validation before packaging/promotion | WI-087 |
| A09 | P2 | Deployment trusts fresh ssh-keyscan without pinned identity | Pin verified host key through trusted configuration; test fail-closed mismatch | WI-087 investigation; implement only with concrete trusted provisioning |
| A10 | P2 | Incomplete source/player coverage causes real 503 | Identify missing records/source limitations; verify mappings before repair, retain explicit gaps | WI-084 investigation and follow-up plan |
| A11 | P2 | Only full local backup dated Oct23 found | Explain recovery loss; user questioned schedule, so no new schedule/offsite destination configured | Operator decision, not release blocker |
| A12 | P3 | Work tracking differs across historical local checkouts | Use origin/current release as audit source; preserve unrelated work; track new fixes once | WI-084 |
| A13 | P2 | Telegram first-bucket limiter race and failed inbox dedupe candidate | Reproduce and address if confirmed inside bounded Telegram work; never send real messages | WI-085 investigation |
| A14 | P2 | Ownership and delta publication may be non-atomic | Follow-up fault-injection verification before changing behavior | Backlog |
| A15 | P2 | Mobile player cards lack column sorting controls | Column/direction controls, whole-pool sorting before pagination, null-last/stable ties and live mobile verification | WI-089 |
| A16 | P1 | Runner SCP cannot deliver images within the release budget | Current-run artifact provenance/digests, bounded HTTPS or operator prestaging, canonical promotion and actual transfer evidence | WI-090 |
| A17 | P1 | Effective SSH policy permits root password authentication; root has an unlocked password | Verify independent recovery access and all administrator key users; disable root/password SSH without losing a second fresh key session; validate sshd config and reload only SSH | Host access follow-up |
| A18 | P2 | Host reports reboot required; cached APT metadata lists 16 upgrades | Review exact package/security changes and all hosted applications, arrange maintenance/recovery, verify services after controlled update/reboot | Shared-host maintenance follow-up |
| A19 | P2 | Full development audit has 18 affected package entries from three advisories, including high-severity zod | Compatible tooling updates, no forced ESLint downgrade or unchecked major override; full audit, lint, types, CSS and browser regression verification | TD-009 follow-up |
| A20 | P1 | Fresh franchise trial fails because duplicate calendar fixture scopes are overwritten; board verification also mixes distinct source duels | Preserve scope candidates, resolve only unique consistent evidence, isolate source-board verification, cached-source regression and renewed bounded publication trial | WI-088 continuation after 0.3.149 |
| A21 | P1 | Legitimate roles differ across distinct H2H duels of one football round; the aggregate rejects them and the reporting scope ignores active participation | User confirmed one XI with one weight, active if it starts in any duel; retain per-duel freezes, reject same-source contradictions, align ordinary-franchise rankings/purchases/examples while preserving all personal history | WI-088 continuation for 0.3.151 |
| A22 | P1 | A valid current personal round uses `тур 4` without the legacy comma, stopping acquisition | Accept the exact short title alongside the legacy comma prefix; preserve identity/calendar guards; 50 Python tests, complete 820-profile rehearsal, then full production publication | WI-088 / 0.3.152 |
| A23 | P2 | Current complete export succeeds but reaches the fixed memory boundary (1,313 reclaim events); growth headroom is unproven | Profile and reduce export/serialization working set, test full-season growth and snapshot size bounds, preserve exact histories and rerun complete publication under unchanged limits | TD-010 follow-up |

Existing WI-066 fixes verified present: atomic login limit, safe redirects, one-time bootstrap, FPL mapping replay, no-op deadline planning, bounded KHL retention/catalog writes, ownership serialization, faster franchise ranking, mobile analytical columns, keyboard resizers, receipt freshness, Node24/non-root/resource limits, CI image build and project-only cleanup. The in-flight WI-083 fixes minimatch and Sorare scope; it is incorporated rather than reimplemented.

## Execution order and acceptance

Implementation chats (all `gpt-6.1-sol`, reasoning `max`): WI-085 `01a1a5ca-b107-70f2-8329-48fa8c9b07df`; WI-086 `01a1a5ca-b6f9-7c63-9543-f26fb5d443a3`; WI-087 `01a1a5ca-bbc0-7203-b0cc-541938841e57`; WI-088 `01a1a5ca-c00f-7bd3-9a5f-d38a111c6f77`.

User addition during CI: WI-089 exposes mobile player-column sorting and direction in the existing UI chat. Deploy run 41809561461 was cancelled before packaging/promotion; the revised 0.3.149 will rerun exact-SHA validation. Existing PR #53 retains the integrated audit work.

1. Record evidence and publish this plan before implementation chats.
2. Four Sol 6.1 Max chats own disjoint changes: Telegram correctness, UI keyboard/dialogs, runtime/release checks, franchise memory. Root alone edits shared BOARD, integrates commits and deploys. No competing production deployments.
3. Review diffs and meaningful regressions. Full test/lint/typecheck/build runs serially in one checkout; database tests and migration drift run in isolated CI PostgreSQL. Browser checks cover desktop/tablet/mobile without changing real user squads.
4. Update release/version metadata once, push exact source, run full CI and canonical Deploy Production. Preserve ef9830d ancestry. Candidate runs on alternate loopback port, exact SHA health before graceful Caddy reload; retain old web for drain/rollback. Migrations require online compatibility and rehearsal.
5. Verify public/internal/image/manifests agree, one worker, old assets accessible, source health separately, browser smoke, logs/resources. Inspect cleanup dry-run, remove only confirmed project release artifacts; preserve one rollback and verified full backup, persistent volumes, user caches and other applications.
6. Report every actual change as before/after, successful checks, remaining gaps, and actual cleanup measurements. Do not claim entire data quality healthy from core liveness.

## Follow-up work supported by the audit

- Sports identity coverage: 137 unmatched players and two explicitly excluded records remain. The four failing active leagues have coverage RPL 498/515, EPL 666/688, UCL 1157/1192 and UEL 1134/1161 (source-quality-readonly.json). Review provider ID, club and birthdate together before writing identity mappings; never force a match from name similarity alone. Acceptance: each changed mapping has identity evidence, no duplicate provider identity, and recalculated source health at the unchanged threshold.
- Forecast availability: 293 missing forecasts across active leagues have no qualifying finished per-match player-stat records in the database. Some have seasonal archive totals, which are not equivalent inputs. Classify true newcomers, absent source history and ingestion gaps, then backfill only available real records. Acceptance: explain remaining missing forecasts explicitly; do not synthesize zero-valued history or shrink the denominator of active players.
- UCL historical player data: ten July qualification matches have no player statistics. A bounded probe of match 1000022632 confirmed that the provider's current payload has null playerStats despite available team/lineup data. Inspect the other nine individually before deciding whether backfill can restore anything.
- UI consistency: representative desktop and 390px mobile checks found the analytical pool columns already present and no document overflow. Mixed Russian/English labels and inconsistent absent-value presentation are candidates for a separate, inventoried consistency pass; they do not justify removing functionality or a wholesale redesign. CommandPalette is currently unmounted; its regression checks cover the component, not an active production workflow.
- Runtime errors: four Caddy 502s in the preceding 24 hours include upstream EOF and invalid chunk length. No OOM/restart correlated in the collected baseline. Correlate future request IDs with bounded application diagnostics before choosing a cause or changing proxy timeouts.
- Static hygiene: the integration lint pass has zero errors and 237 warnings in final 0.3.152 CI (236 in the initial audit release), predominantly untranslated visible text in Betting/KHL plus specific hook-dependency and image warnings. Inventory and fix these by owning module with RU/EN visual checks and hook-behavior tests where necessary; do not hide them with broad rule suppression. A passing lint exit code is not a claim that these warnings were resolved.

The external-backup schedule remains unconfigured following the user's question about its purpose. Existing verified pre-migration recovery behavior is preserved.

Host security was checked at 12:09 UTC: Ubuntu 22.04.5, kernel 5.15.0-187, Docker 29.5.2, Caddy 2.11.3. Effective SSH policy for the current client's address permits password authentication and root login; root password status is P, deploy is locked L. This confirms the configuration risk, not a successful password login or compromise. No password/hash was read, login attempted, or global access policy changed. Recovery-console availability and other administrator dependencies remain unverified. UFW is active; observed host TCP listeners expose 22/80/443, while project web 3000 and PostgreSQL 5433 bind only 127.0.0.1. Provider ACLs and a full external port scan are outside this measurement. TLS hostname verification passed, TLS 1.3, certificate expires December 29. Automatic APT timers are enabled; cached upgrade count 16 used metadata newest 07:15 UTC without refreshing/installing packages. No security-origin entries in this cached list is not proof that the host has no advisories. Evidence: host-security-readonly.json and ssh-effective-policy.json.

## Sources and references

Execution addition WI-090: two otherwise successful release candidates stalled during runner-to-server SCP at approximately 20–28 and 90 KiB/s. Both were cancelled before promotion; 898 public probes had zero errors and only 0.3.148, and 31,595,520 bytes of partial transport files were removed after writer checks. The same Sol 6.1 Max runtime chat implements current-run HTTPS artifact delivery within Deploy Production, with full provenance/digest checks, bounded private extraction and the unchanged promoter. This is required to complete delivery within the job budget, not permission for manual promotion or server builds.

Internet precedents were checked before solutions. Technical decisions use primary documentation:
- https://nextjs.org/docs/app/guides/production-checklist
- https://nextjs.org/docs/app/guides/memory-usage
- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- https://nodejs.org/en/blog/release/v24.22.2
- https://www.postgresql.org/docs/17/explicit-locking.html
- https://core.telegram.org/bots/api#getupdates
- https://man.openbsd.org/ssh-keyscan
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- https://docs.github.com/en/rest/actions/artifacts#download-an-artifact
- https://man.openbsd.org/sshd_config.5
- https://docs.docker.com/engine/network/packet-filtering-firewalls/
- https://docs.docker.com/engine/network/port-publishing/

