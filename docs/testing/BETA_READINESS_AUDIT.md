# Beta Readiness Audit

Review date: 2026-07-17.

Source of requirements: `C:/Users/Nik/Downloads/SMART план.md` and its Definition of
Done. At the request of the product owner, the availability of official fantasy prices is temporary
is excluded from the current volume: prices are not replaced and continue to be clearly indicated
as evaluative. This exception does not convert missing official prices into
completed fact.

Current production after beta43 promote:

- image `fantasy-scout-web:beta43-20260717T141402Z`;
- image ID
  `sha256:90cf7db97a46d701348580273e03e979859f00e142d53da5237734207e5d4814`;
- source commit `ecbb64360cf02f1ae9c0a3447ba20503d240c268`;
- release
  `/var/www/fantasy-scout-releases/20260717T141402Z-beta43-ecbb643-green-main`;
- active container ID
  `6a4fc05c42f72a59bee22d8e4efc41ec3d5f923f8f774a28f95e00502be3fa12`;
- status `running|healthy|0`, port `127.0.0.1:3000`, network
  `fantasy-scout_default`, upload volume RW, restart policy `unless-stopped`,
  logs `json-file` / `max-size=20m` / `max-file=5`;
- symlink `/var/www/fantasy-scout-current` atomically points to beta43 release;
- PostgreSQL container ID
  `325e03666369215bd5b68c527a4b9b70421237c1b8f78b0040df6d94e571230f`
  remained `running|healthy|0`; production DB contains 12 applied migrations,
  0 failed/rolled-back and 11 352 lines `matches`, including 380 EPL 2026/2027;
- immediate rollback — exact beta42 container
  `fantasy-scout-web-beta42-rollback-pre-beta43-20260717T141402Z`, container ID
  `3c42b4f3898fa047265f208d94d6e467e2528f6d907904a1bb2c7ca399bfbfa3`,
  state `exited`, restart count 0;
- exact beta41 rollback is also saved in state `exited`, restart count 0:
  `ccfac13ddff1db2364c8598d3242a201fc688245ce1bc69993588ecba6fb7614`;
- exact beta2 web
  `afc89df340968fbdc32f26f45b63fe12e298405b4143a2d59f0abd6c714a68e9`
  and DB `8d92d999627a1d74d3ae9dca218aec176ff7ae4f4663c1c81e7b1dfd937d3c96`
  remained `running` and was not changed by this rollout.

## Beta43 release acceptance

- CI `29586859628` on exact commit `ecbb643` completed migration drift,
  PostgreSQL integration and full check: locally 327 tests passed,
  1 expected skipped, lint/typecheck/build green;
- canary beta43 gave health/login/client-errors 200 and the expected data-quality 503;
- pre-beta43 custom-format backup checked via `pg_restore --list`:
  `/var/backups/fantasy-scout/pre-beta43-targeted-47-20260717T141402Z.dump`,
  49 760 868 bytes, SHA-256
  `33c8365c7c969b7a5d18a7fbf0db84404193362a5eeb5af034b6204fb3de3ad0`;
- first attempt to promote safely returned beta42 due to invalid check
  hostname `fantasy-scout.ru`; correct production hostname -
  `fantasy.tsyzhman.ru`. Repeated guarded promotion took place with HTTPS 200;
- targeted ingestion `cmrp11uo6000111vh1h62ct59` performed by the only
  in-process worker: `completed`, scopes 1/1, failed matches 0, canonical
  `47:2026/2027` contains 380/380 upcoming fixtures;
- exact audit `cmrp140pu0000s2hhltu9gjeu` completed after ingestion: forecast
  coverage 98,548% at threshold 98%, finished matches 0. Therefore overall
  data-quality remains 503, but planner default has `healthy=true`,
  `ready=true`, mode `PRESEASON_FORECAST`, 620 active players and 380 fixtures;
- Production Browser Smoke `29587891908` on exact revision gave 4 passed,
  2 expected skipped and artifact `8409808945`: auth, player forecast search,
  auto-pick 15/15, save by server `squadId`, exact cleanup and responsive checks;
- read-only production calculation on 620-player pool and 10 rounds built
  valid squad without violations and 6 transfer plans for intentionally weakened
  squad; the first plan gave +14,3 on the horizon 5 rounds;
- bounded public health load: 1472 requests in 30 seconds, 0 failures,
  error rate 0%, p75 69 ms with limit 500 ms; Production Monitor
  `29588072708` completed successfully.

## Historical beta42 release acceptance

- clean archive SHA-256
  `95a07e406859130ad7b5f9476131b97078d2999f3905b369e681664b15f6591f`;
- pre-migration custom-format backup checked via `pg_restore --list`:
  `/var/backups/fantasy-scout/pre-beta42-index-rename-20260717T131746Z.dump`,
  49 760 773 bytes, SHA-256
  `e1e1be36faf96df2b364dfd5837738365827fe20d8f280dcf4e067b95d1530e2`;
- forward-only migration `000012_client_critical_error_index_name` applied
  separately setup-image; total 12 applied, 0 failed, 10 972 matches, and index
  exists under the exact name expected by Prisma;
- loopback canary gave 200 for app health, login and client-error health. Data-quality
  gave the expected 503: audit EPL 2025/2026 remains passing with 98,938% forecast
  coverage, but forecast-ready default season is missing;
- guarded swap restored HTTP in 6,537 s, beta41 saved immediate rollback;
  active after promote — `running|healthy|0`;
- GitHub Actions run `29582985539` completed migration drift, clean PostgreSQL
  integration and full check. Both access audit JSON are available, but their current
  status is `insufficient_data`, so this is not evidence of long RUM;
- planner/catalog automatically selects only exact ready season. At zero
  ready-seasons auto selection, auto-XI and transfers are blocked instead of calculation by
  null fixtures;
- server save requires exact 15/15, blocks authoritative roster via
  `FOR SHARE`, re-checks team/position rules within the same transaction and
  only then replaces parent/players;
- client crash reporter stores only minute coarse aggregates without raw error,
  stack, path/query, user/session, IP and UA. Public recording is limited to the database,
  uses a non-blocking lock and is considered a warning, not a trusted critical
  availability signal.

## Historical beta38 release acceptance

- clean archive SHA-256
  `adcdfedda301307200e10cc00e08abc4884e3dfd46c0e38510cea2e10363dd52`;
- loopback canary used exact beta38 image/revision, port
  `127.0.0.1:3418`, 1 CPU / 1 GiB / 256 PID and disabled ingestion/schedulers;
  canary ID `6863525f00aefe9db76224564b3c2953747501d9bcf2f00da57bd8b55c4a3997`
  after acceptance and exact QA cleanup is deleted, port 3418 is released;
- Edge touch emulation tested 390×844 and 844×390 with `pointer:coarse`: mobile
  cards are visible, desktop table is hidden, page overflow 0, 140 player actions have
  minimum 44×44 px. Single button `Actions` opens bottom sheet with focus trap,
  Escape, return focus, scroll lock and safe-area; console errors - 0. This is not
  physical Safari iOS/Chrome Android evidence;
- pending real-user run can now not pass human gate without moderator review;
- candidate before swap matched active by env and normalized full
  `HostConfig`; runtime fingerprint SHA-256
  `d6ea93f3f0f9336b236e6f00cc55be51655934a688a7473863a85aed5476baf4`;
- first attempt at beta38 swap temporarily stopped production: generic
  `docker inspect` with a free container name allowed the image of the same name and
  protective rollback refused to accept it as a container. Exact beta36 was
  restored manually; the duration of this break was not instrumented.
  All container lookups replaced with `docker container inspect`, re-audit
  did not find P0–P2;
- successful guarded swap restored HTTP in 1,835 s. Exact digest 13 critical
  tables before/after matched; this is not a bitwise equality statement for the entire DB.
  App/PostgreSQL/Caddy critical logs - 0, Caddy 5xx during swap - 0;
- CI `29570144902` to `cfc1bc9` green. Production browser workflow
  `29573697960` gave 5 passed and 2 expected skipped; artifact `8404162521`.
  After it, `running|healthy|0` remains active, and the window from the start contains beta38
  206 Caddy requests, 0×5xx and 0 critical app/PostgreSQL/Caddy lines;
- Production Monitor `29573699815` green only on critical availability:
  `criticalFailures=0`, but `warnings=1`, `alertRequired=true`. Access snapshot
  contains 14 eligible requests and two `500 POST /` in 10:13 UTC, before the start
  beta38 in 10:29 UTC, so status is `insufficient_data`. No warning
  is hidden and the long real-user error-rate gate remains open.

## Historical beta36 acceptance

Before promoting beta36, the image was tested separately on the loopback canary:

- clean archive SHA-256
  `1661d4096e0749a71835309029b6187cd60d30caac1a8bff0a209ac0cb5900df`;
- canary used the same exact image/revision, port `127.0.0.1:3416`,
  read-only upload volume and disabled ingestion/schedulers;
- `/api/health` returned 200, unauthorized JSON-report - 401, runtime contained
  optimizer worker, `pagehide` and `pageshow`; critical log lines - 0;
- Edge went the way `Mbeumo` → planner → blank → auto-pick 15/15 → valid squad →
  applying a real transfer recommendation → save → server `squadId` → reload →
  restore. All 8 milestones are recorded in the correct order, LCP `/machete/players`
  is present, `JOURNEY_ABORTED` and client errors are absent; server time until
  `SQUAD_RESTORED` - 39 375 ms, local session cleared in 83 s;
- exact cleanup removed 1 QA user, 2 synthetic runs, 40 observations and 2 QA squads;
  DB signature before/after remains `8|0|10972`, canary ID
  `101881b3e44abf0dc3d5d521a43e9afe2cc3f1a57b00613fdfa80b1288040d69`
  has been deleted, port 3416 has been released;
- stopped candidate received exact env/network/RW upload volume/port/restart
  policy/healthcheck/log config; guarded swap restored HTTP in 2,153 seconds
  and saved beta33 as immediate rollback;
- locally passed 274/274 test, lint, typecheck and production build; C.I.
  `29561609805` on commit `c0d969b` green;
- post-rotation workflow `29566426370` gave 5 passed and 2 expected skipped,
  artifact `8401309300`. Inside the report ZIP there is only
  desktop/tablet/mobile projects, no
  `auth.setup`, password selector, QA env or auth-state. Old unsafe
  artifact has been removed, the Production Beta QA password has been rotated;
- stale rendered compose-config with mode 0664 contained the current production DB/cron
  credentials. Exact file deleted, DB password, `DATABASE_URL` and `CRON_SECRET`
  rotated; old active/rollback containers with previous values ​​have been removed.
  New active retained the same exact beta36 image/revision, HTTP restored for
  6,742 with, `.env` remained 0600;
- monitor `29566962197` green: 0 critical, 0 warnings. Its fresh access
  snapshot excluded 399 tagged synthetic queries, included 234 eligible
  request, 0×5xx, p75/p95 22,767/50,482 ms and window 51,834 minutes. Historical
  the first snapshot `insufficient_data` is not hidden, but the new short window is gone
  does not yet replace long-term real-user evidence.

## Summary

A full beta has not yet been proven, but the technical current-season loop is closed.
Beta43 confirms the path from searching for a player to saving a valid auto lineup in
production default EPL 2026/2027, forecasts 98,548%, auto-selection and transfer plans
on 620-player real pool, 380 future fixtures and short performance thresholds.
Responsive browser workflow closes technical and visual UI-gate, but not
replaces interface clarity testing by real users or physical
phones.
Caddy access log rotation, 15- minute aggregated audit are enabled on the server
5xx/latency, public anonymous health snapshot and secure GET retry Caddy
for short upstream EOF. Synthetic monitor/browser traffic now has explicit
User-Agent and is excluded from the real-user error-rate.
Historical full data-quality gate EPL 2025/2026 is passing. For pre-season
EPL 2026/2027 full gate honestly does not pass due to 0 matches played, while
a separate planner preseason gate passes and does not mask this difference.

Remaining blockers:

1. no minimum 10 real participants and proven completion rate ≥80%;
2. no check on physical Safari iOS and Chrome Android;
3. there is no long RUM/Web Vitals and server error rate for the real beta period;

## Summary of Definition of Done

| # | Criteria | Status | Verified evidence | What else is required |
|---|---|---|---|---|
| 1 | The path from searching for a player to saving the optimized squad | Technically completed | Beta43 workflow `29587891908` on current default EPL 2026/2027: forecast search player, auto-pick 15/15, save, exact cleanup; 4 passed, 2 expected skipped | Human completion is checked separately by criterion 9 |
| 2 | The squad optimizer does not violate the rules and budget | Done for the EPL circuit | The server reloads the authoritative pool and checks the size, positions, starting scheme, bench, club limit, budget, captain and transfer limit. UI-save is accepted only after `Valid squad`; unit tests reject invalid payloads | A separate rule-matrix will be required when adding other fantasy tournaments |
| 3 | Forecasts available to all major players | Done for current EPL scope | Audit `cmrp140pu0000s2hhltu9gjeu`: 98,548% at threshold 98%; planner pool 620/620 with numeric forecast, mode `PRESEASON_FORECAST` | Full match-data gate will become verifiable after the first matches played |
| 4 | Automatic selection and transfers work on real data | Made for current EPL scope | Browser auto-pick/save green; read-only real-pool check built 6 transfer plans, first +14,3 for 5 rounds | Official prices by owner's decision remain outside the scope |
| 5 | Full work on a computer and phone | Partially | Beta43 workflow `29587891908`: current default desktop/tablet/mobile 4 passed, 2 expected skipped, artifact `8409808945`, 0 runtime/5xx/overflow failures | Real runs on physical Safari iOS and Chrome Android are needed; clarity is checked by criterion 9 |
| 6 | Speed indicators met | Partially only due to real-user sample | Unit gates auto-pick <5 with and transfers <10 with pass. Beta43 public health load: 1472/1472 HTTP 200, 0% errors, p75 69 ms with limit 500 ms | Real RUM participants 0; need LCP p75 ≤2,5 with minimum for 10 people |
| 7 | No critical errors | Partial | Beta43 `running|healthy|0`, HTTPS health/login/client-errors 200, browser smoke and monitor `29588072708` green, full check and independent P0/P1 audit green | Short acceptance does not prove long-term beta without critical/blocker |
| 8 | Historical testing of model | completed | Production run `cmrm6rgwx0000106radpcmtco`: `COMPLETED`, 380/380 EPL 2025/2026, `gate_passed=true`; five-round RMSE improved for GK/DEF/MID/FWD by 16,569/10,759/13,403/11,116% | Single-game horizon separately did not reach 10%; the conclusion applies to five-round planning |
| 9 | At least 80% test users complete the scenario without assistance | Not completed | `/beta-test`, consent, bounded telemetry and `/admin/beta-test` ready. Production DB: users 4, synthetic runs 1, real runs 0, reviewed real runs 0. Synthetic evidence is excluded from human/RUM gates | Need ≥10 real participants, completion ≥80%, forecast found ≥80%, transfer understanding ≥70%, UI ≥4/5, physical iOS ≥1 and Android ≥1 |
| 10 | Monitoring, logs and data update control | Technically completed | Caddy/systemd audit active; logs 5×20 MiB; DB 12/0; targeted ingestion 1/1, 0 failed, 380 fixtures; planner default healthy. Overall data-quality 503 honestly reflects 0 finished current-season matches | Long-term real-user monitoring window is needed; synthetic/anonymous signals do not close human gate |
| 11 | Clean UI without overlays, cut-off navigation and unnecessary repetitive noise | Done technically and visually | Compact fixture chips, short team names, mobile cards and Worker for transfers are preserved; beta43 workflow `29587891908` did not find overflow, overlap, runtime or 5xx errors on desktop/tablet/mobile | Subjective understandability and assessment ≥4/5 still must be confirmed by real participants in the criteria 9 |

## Clean-UI gate `/machete/squad` - closed technically and visually

Edits beta29–beta31 eliminated specific intersections, breakpoint defects and
visual noise. Automatic geometry complemented by manual viewing production
screenshots; user understandability remains a separate human gate.

Before editing:

- page repeated the global header with a separate Machete hero, breadcrumbs and intro-card;
- import/export/admin tools constantly competed with the main script;
- metrics were a set of equivalent cards, and transfer tips went to the workbench;
- on the mobile pool remained a wide 760 px table;
- empty squad showed `Valid squad`, allowed Save and mixed EN/RU in option;
- with 360 px the service signature moved the active `Squad` beyond the edge of the subnav.

After editing:

- compact workspace nav and title replaced three repeating intro blocks;
- data tools are collapsed, metrics are collected in one strip, workbench is located before tips;
- main hierarchy - `Auto-pick squad`, `Save squad`, then `More actions`;
- mobile pool uses readable cards, desktop saves the table;
- empty squad honestly shows `15 players needed`, Save blocked until
  full valid content, option is displayed in one language;
- on 360 px only the redundant workspace signature is hidden, so `Leagues`,
  `Players` and active `Squad` are visible in their entirety;
- production workflow `29507456004` saved 0 document overflow and full path
  search → auto-pick → valid → save → cleanup.
- separate production HTTPS WebKit session 26.5 from iPhone 13 UA to 390×664
  confirmed USER-login, real pool/search, Squad/Pool/Tips/Menu, 0 overflow and
  0 console errors/warnings. `maxTouchPoints=0`, so this is not a physical gate.

Second beta33 cleaning:

- was: the same position/starter/bench restrictions were repeated by several
  layers of chips and cards; the table was wide and deep, the team occupied
  full name, and five fixtures grew vertically;
- became: one common status + the only GK/DEF/MID/FWD counters within the squad,
  without repeated `Поле/GK/DEF/MID/FWD` and `Запас/GK/Поле` checks;
- became: production desktop table 744 px, header 35 px, first row 45 px; DB short
  name `Man United` saves full `Manchester United` in title, shown
  three fixture-pills and available `+N`;
- was before beta38: on coarse pointer with landscape ≥768 px it was turned on again
  desktop table, and several small actions competed in each line;
- became beta38: coarse pointer always receives mobile cards; one button
  `Actions` height 44 px opens the bottom sheet. All focusable controls have
  minimum 44 px, focus looped inside, Escape closes sheet and returns focus;
- now: auto-pick works in Web Worker; 15/15 received in 2 463 ms,
  synthetic event duration 128 ms. Manual Edge session and workflow `29517734343`
  confirmed 1440/390 geometry; it is not a substitute for human evaluation of the UI.

## Monitoring and logs

- Caddy `v2.11.3` writes `/var/log/caddy/fantasy-access.log` from `caddy:caddy`,
  mode 0640, rotation 50 MiB/24 h, keep 10/30 days. For short upstream EOF
  reverse proxy uses a secure GET retry window: `2s` with interval
  `100ms`.
- `fantasy-access-audit.timer` active+enabled, period 15 minutes.
- Live beta38 app and PostgreSQL containers use `json-file` 5×20 MiB.
  PostgreSQL kept the same exact container/image/env/network/volume;
  confirmed migrations 8, 0 failed and 10 972 lines `matches`.
- The first verified access audit after post-deploy smoke excluded 393 tagged
  synthetic request, left 2 eligible request, 0 responses 5xx and returned
  `insufficient_data`. Later fixed snapshot run
  `29566962197` excluded 399 tagged synthetic queries, included 234 eligible,
  0×5xx, p75/p95 22,767/50,482 ms and window 51,834 minutes. None of these short
  images do not prove long-term beta error-rate or real participants.
- `/_monitor/*`, warning-only data-quality/price health endpoints, dedicated
  monitor User-Agent and `fantasy-production-browser-smoke/*` are excluded from
  real-user metrics; report does not contain URL, IP, cookies, headers or user
  identifiers.
- Workflow `Production Monitor` checks liveness/login as critical and
  data-quality/access audit as warning; state is synchronized with one
  GitHub Issue without updating on every identical run.
- Tested post-rotation run `29566962197`: critical failures 0, warnings 0,
  data-quality PASS, access audit `ok`.
- Current beta38 run `29573699815`: critical failures 0, warning 1,
  `alertRequired=true`. Snapshot `insufficient_data`: 14 eligible requests and
  2×5xx (`POST /`) at 10:13 UTC, before the start of beta38. Separate window from start
  beta38 contains 206 requests, 0×5xx and 0 critical app/PostgreSQL/Caddy lines,
  but synthetic browser smoke is not considered real-user evidence.
- Official prices are deliberately not included in monitor until the source appears.

## Remaining required beta-gates

1. Carry out the protocol on at least 10 real users and complete all UX
   SMART plan thresholds.
2. Collect long RUM/Web Vitals and server error rate <1% on a real group.
3. Check physical Safari iOS and Chrome Android.

Operational monitor continues to observe 5xx/latency; current warning is not possible
close with artificial traffic. After the appearance of official prices price gate
should be returned to the required scope, but has now been excluded by the product owner.
