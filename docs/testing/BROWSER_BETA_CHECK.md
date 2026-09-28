# Browser Beta Check

Review date: 2026-07-17.

## Beta38 production acceptance 2026-07-17

Production works on the image
`fantasy-scout-web:beta38-20260717T093041Z`, image ID
`sha256:d0dbfd93e1055d7502cce16718698831595fd1340873398218fb3a22fb0eefc7`,
source commit `cfc1bc9d70e3d44b627cc3cffffe278de70e11c7`. Active container ID -
`815ae6085d78e7b4887b4c012a27f21bc57de31a8e639541b0e4fcfacd5064c8`;
state after production smoke - `running|healthy|0`.

GitHub Actions Playwright workflow `29573697960`, tied to the same exact
`headSha`, passed: 1 auth setup and 4 browser checks passed, 2 checks expected
skipped. Artifact `8404162521` (`production-browser-smoke-29573697960`) contains
sanitized screenshots/report. Write script loaded real EPL pool, built
is valid 15/15, saved the option, confirmed the server `squadId` and deleted the QA copy.
After cleanup: users 4, squads 2, squad players 30, beta runs 1, observations 20,
`E2E optimized …` squads 0.

Separate touch emulation exact beta38 canary checked portrait 390×844 and
landscape 844×390 with `pointer:coarse`: page overflow 0, mobile pool visible,
desktop table is hidden, 140 visible player actions have a minimum of 44×44 px. Instead of
several small row-controls, one button `Actions` is shown; bottom sheet
has focus trap, Tab/Shift+Tab wrap, Escape, focus restore, body scroll lock and
safe-area. All 6 focusable controls - minimum 44 px; console errors - 0.
Canary has been deleted, port 3418 has been released. This is Chromium/Edge touch emulation, not
physical Safari iOS or Chrome Android.

After the start of beta38, 206 Caddy requests, 0×5xx and 0 critical were checked separately
app/PostgreSQL/Caddy lines. Production Monitor `29573699815` has green
workflow only by availability (`criticalFailures=0`), but not pure monitor
PASS: `warnings=1`, `alertRequired=true`. Its access snapshot is
`insufficient_data`: 14 eligible requests and two `500 POST /` at 10:13 UTC, before
beta38 start at 10:29 UTC. Synthetic browser smoke is not used to close
real-user error-rate gate.

The first promotion attempt temporarily stopped production: generic
`docker inspect` allowed a free container name as an image of the same name, and
The defense refused to continue. Exact beta36 was restored; duration
break was not instrumented. After replacing all lookups with
`docker container inspect` and repeated independent audit of beta38 successfully
advanced, HTTP restored in 1,835 s.

## Current total

The technical main script is running in production, and the requested cleanup
`/machete/squad` confirmed on desktop/tablet/mobile and coarse portrait/
landscape. It was: landscape touch could return a wide desktop table, and rows
contained several minor actions. Now: touch always uses cards and one
44 px button `Actions` with bottom sheet available. Pending real-user run without
moderator review no longer passes the human gate.

This does not mean the readiness of a full-fledged beta: long real-user error rate and
RUM not assembled, physical iOS/Android not tested, test minimum on real 10
users has not been tested. Official prices temporarily excluded by owner
product and are not substituted for evaluation.

## Historical beta36 production acceptance 2026-07-17

Production works on the image
`fantasy-scout-web:beta36-20260717T070721Z`, image ID
`sha256:6590f96619d8b85ac9215d5a32a8e0b0e4046dea126f670dac108d7fed5141ca`,
source commit `c0d969bec6f558de61f2dbdd277528dc53a8d7e1`. Active container ID -
`16398e4b3103a2408b67414ced74e2df28d2ce72bb3f64d2b375afc5b90c6f94`;
status `running|healthy|0`.

Post-rotation GitHub Actions Playwright workflow `29566426370` passed: 1 auth
setup and 4 browser checks passed, 2 checks expected skipped. Artifact
`8401309300` contains only 6 desktop/tablet/mobile screenshots, report index
and 3 report images: no
`auth.setup`, password selector, QA env or auth-state. Individual password
Production Beta QA user after removing old unsafe artifact
rotated.

Before promoting, the same exact image/revision went through a separate Edge canary on
`127.0.0.1:3416`: search `Mbeumo` → planner → blank → Web Worker auto-pick
15/15 → valid squad → applying a real transfer recommendation → save → server
`squadId` → reload → restore. All 8 milestones are written in the correct order,
LCP `/machete/players` present, `JOURNEY_ABORTED` and client errors
are missing. Server time up to `SQUAD_RESTORED` - 39 375 ms, full local
session - 83 p. Exact cleanup removed QA user, 2 synthetic runs, 40 observations and
2 QA squads; canary has been deleted, port 3416 has been released.

Caddy excludes dedicated browser-smoke User-Agent from real-user error-rate.
Monitor `29566962197` after credential rotation gave 0 critical/0 warnings;
latest snapshot excluded 399 tagged synthetic queries, included 234
eligible, 0×5xx, p75/p95 22,767/50,482 ms and window 51,834 minutes. This is release
evidence, not evidence of RUM of real users or a long window.

Removed stale world-readable rendered before this recheck
compose-config and rotated production DB password, `DATABASE_URL` and
`CRON_SECRET`. Old web/rollback containers with the same values ​​have been removed;
new active remained at the same exact beta36 image/revision, public health —
HTTP 200.

## Historical total beta36

Technical main script worked in production beta36 and again
confirmed the search for a real player with a forecast, going to the scheduler, loading
pool, valid auto-pick 15/15, real transfer recommendation,
save/reload/restore and no browser client errors. Desktop, tablet and mobile
projects passed smoke; clean-UI beta33 remains in runtime.

This does not mean the readiness of a full beta: long beta error rate and RUM
not assembled, physical iOS/Android not tested, test minimum on real 10
users has not been tested. Sports.ru official prices are temporarily excluded from
volumes by the owner of the product and are not replaced by estimates.

## Historical browser check beta33

Historical browser check completed GitHub Actions Playwright Test workflow
`29517734343` vs production `https://fantasy.tsyzhman.ru` on the image
`fantasy-scout-web:beta33-20260716T162012Z` with image ID
`sha256:1632280efe40aac35139e56840fbc5d9be660471303839c0cc1cac63f6deeff4`
and source commit `c4019cae678638390a0bdc749ab1c5c6f8be7bec`.

Workflow gave 5 passed, 2 expected skipped in 54,8 test seconds and 1 minute
54 whole seconds. Evidence loaded into artifact
`production-browser-smoke-29517734343` (`8383413207`, SHA-256 archive
`1fe999d83c8d65b4a200c4c56398f99137a9836529ae8b71b02db30bf1dbd824`). Used
separate production QA user; The password is stored only in GitHub Secrets.
Write script creates a unique `E2E optimized …` variant, checks
server-returned `squadId` and deletes the QA copy; working user data not
are changing.

This smoke confirms the functionality of the script and the absence of measurable
viewport overflow. Additional production HTTPS session in Edge checked
1440×1000 and 390×844, saving and reload, separate Web Worker, access to
JSON report and visual density beta33. One-time QA user/session/squad and
credentials deleted; The original DB counters have been restored. Understandability for
does not prove this to the audience - it remains part of the test on real 10
users.

Additionally, one-time acceptance was performed on public production HTTPS in
Playwright CLI `0.1.17`, browser engine WebKit `26.5`, with iPhone 13 UA and viewport
390×664 with DPR 3. A regular user logged in, opened `/machete/squad`,
loaded a real player pool, found Bryan Mbeumo, switched Squad/Pool/Tips and
opened the global Menu. In accepted HTTPS session console errors/warnings – 0, all
observed API/RSC requests - 200, login POST - 303, root/body scroll width -
390 px. The tool reported `maxTouchPoints=0`, so this is a WebKit check and
mobile geometry, and not full-fledged touch emulation and not physical Safari iOS.

## Historical summary beta33

Technical main script running in production: player search returns
real player and forecast, switch to planner available, full pool
is being loaded, the allowable squad 15/11/4 is within the budget 100/100,
is saved and restored after reload, and transfer recommendations
are working. Automatic selection has been moved to a separate Web Worker; production selection took
2,463 seconds, synthetic interaction event — 128 ms. Desktop and mobile
viewport does not expand the document horizontally. The protected JSON report returns
403 regular USER and 200 ADMIN with `private, no-store`, attachment and without PII.

This does not mean the readiness of a full beta: long beta error rate and RUM
not assembled, physical iOS/Android not tested, test minimum on real 10
users has not been tested. Sports.ru official prices are temporarily excluded from
volumes by the product owner and are not replaced by estimates.

## Beta33 UI-density, worker and report acceptance 2026-07-16

Was:

- the same squad restrictions were repeated by the top chips, status line and
  with separate starting lineup and bench cards;
- player pool was both wide and deep: full team names,
  multi-line lines and five vertical fixture-pills;
- synchronous auto-selection held main thread; synthetic INP one previous
  acceptance reached 2 744 ms;
- production runtime did not have a separate verified download endpoint for
  anonymized beta report.

Now:

- left one general constructor status and the only useful counters
  GK/DEF/MID/FWD within the starting lineup; repeated `Поле/GK/DEF/MID/FWD` and
  `Запас/GK/Поле` checks deleted;
- desktop player table has actual width 744 px, header 35 px and first
  line 45 px; the command is shown as DB short name (`Man United`) with full
  `Manchester United` to `title`, fixtures are reduced to three pills and an accessible `+N`;
- the total document width at 1440 px is equal to 1440, at 390 px - 390; mobile uses
  cards, and the hidden desktop table does not expand the page;
- worker chunk `fantasy-squad-optimizer.0c23200f3f451f13.js` returned HTTP 200;
  continuous measurement gave 2 463 ms to 15/15 and event duration 128 ms. Maximum
  long task when drawing the result was 483 ms, so this is technical
  synthetic evidence, not a replacement for real-user RUM;
- USER received the expected 403 on `/api/admin/beta-test/report`; ADMIN received 200,
  `Cache-Control: private, no-store`, attachment
  `beta-user-test-2026-07-16.json`, `application/json`. Downloaded report - 2 574
  bytes, SHA-256 `52d00fd16c8790dea6843dddd934f2ea649bb5804a9d13b8a3b3e66b08f86fe8`,
  without email, QA-name and `userId`;
- screenshots saved in
  `output/playwright/beta33-production-c4019ca/`; restored after cleanup
  users 4, sessions 9, squads 2, squad players 30, runs 1, observations 20,
  real runs 0 and synthetic runs 1.

Full beta is not proven: physical devices, long real-user
RUM and a sample of ≥10 participants are still missing.

## Beta32 physical-environment evidence acceptance 2026-07-16

Before beta32, the moderator could only mention the device in free text, so
even the actual physical Safari iOS / Chrome Android test was impossible
can be reliably proven with a machine report. After beta32 valid review requires one thing
structured value from allowlist; the base additionally applies CHECK, and
gate requires at least one primary physical Safari iOS and one physical Chrome
Android run. A discrepancy between the physical environment and the desktop viewport is rejected.

Canary `/admin/beta-test` verified by Playwright CLI on desktop and 390 px. Field
`Observed device/browser` has `required=true`, an empty value is not sent
valid review, and allowlist contains exactly `DESKTOP_BROWSER`,
`IOS_SAFARI_PHYSICAL`, `ANDROID_CHROME_PHYSICAL`, `OTHER_MOBILE`. At 390 px
`documentElement.scrollWidth = innerWidth = 390`; console errors/warnings — 0.
One-time QA-user/run/session and credentials removed after cleanup in production
remains 0 real, 0 valid real and 0 pending real runs. This proves readiness
collects evidence, but does not replace the physical tests themselves: iOS/Android counters everything
also 0/1 and 0/1.

## Beta32 WebKit/iPhone-profile acceptance 2026-07-16

Check performed directly on `https://fantasy.tsyzhman.ru` because
production session cookie has `Secure`: loopback `http://` is not
valid evidence authenticated client API. The first loopback session gave
expected 401 precisely because of the missing Secure-cookie and as a result not
counted. In a new pure HTTPS session:

- WebKit `26.5`, iPhone 13 UA, viewport 390×664, DPR 3;
- `/machete/squad` and player pool loaded under the role `USER`; API squads and
  sync-status returned 200;
- search `Bryan Mbeumo` left one readable mobile-card with forecast and fixtures;
- Squad, Pool, Tips and global Menu available; Menu contains Players and Sign out;
- `documentElement.scrollWidth = body.scrollWidth = innerWidth = 390`,
  page-level horizontal overflow missing;
- console errors/warnings - 0; among the observed HTTPS requests there are no 4xx/5xx;
- four viewed images are saved locally in
  `output/playwright/beta32-webkit-iphone-{squad,pool,menu,tips}.png`.

The check was read-only: auto-pick/save/delete did not run. Disposable
QA user and created login session were deleted cascade; counters before and after
matched: users 4, sessions 9, squads 2, real runs 0, synthetic runs 1;
QA-users after cleanup 0. Profile reported `maxTouchPoints=0` and platform `Win32`,
so physical Safari iOS and physical Chrome Android are still not closed.

## Beta31 clean-UI acceptance 2026-07-16

Before editing, `/machete/squad` repeated Machete hero, breadcrumbs and a large intro-card;
import/export/admin tools constantly competed with the main scenario, metrics
occupied separate cards, transfer tips went to the working staff, and the mobile pool
remained a wide table. An empty squad was called valid and allowed Save; option
mixed EN/RU. After the first production check, it was additionally discovered that
360 px active tab `Squad` was cut off by the workspace service signature.

After editing, the page uses compact nav/title, data tools are collapsed, metrics
are collected in strip, workbench is raised above tips, and mobile pool is displayed with cards.
Empty squad shows `15 players needed`, Save is blocked until complete
valid squad, monolingual option. On 360 px the redundant signature is hidden,
therefore `Leagues`, `Players` and active `Squad` are visible in their entirety.

Loopback beta31 canary gave 4/4 responsive passed; production workflow
`29503570431` gave 5 passed and 2 expected skipped. All three have no viewport
document-level overflow and runtime 5xx/page errors. One-time canary QA-user
deleted, canary deleted after production acceptance.

## Previous UI-cleanup canary 2026-07-16

New UI candidate `fantasy-scout-web:ui-canary-v4-20260716T090327Z`
(`sha256:d268da9f88cf3c25e2ef0d3db4871462abab975e5cb86462530143fa04763b5d`)
has been tested through the permanent Playwright Test suite added to the repository.
Canary worked with ingestion worker and read-only upload volume disabled.

Result of the full run: 5 passed, 2 expected skipped. Full script with recording
runs only in desktop project; tablet/mobile projects do not change the data.
Script:

1. is logged in as a separate QA user;
2. received the production player pool and selected the player with the forecast;
3. found this player in `/machete/players`;
4. opened `/machete/squad`, created an empty variant and ran auto-pick;
5. received `Valid squad`, saved the named option and checked the selected one
   server-returned `squadId`;
6. removed the QA option via authenticated browser fetch.

Responsive acceptance checked 1440×1000, 1024×900 and Pixel 5. In all projects
document-level horizontal overflow is equal to 0. On 1024 the Pool tab is visible and
opens player search; on tablet/mobile global Menu contains Players and Sign
out; desktop primary controls do not overlap in bounding boxes. Screenshots
are attached to CI artifacts. Desktop check additionally opens
`Ctrl+K` and confirms that exactly one command palette dialog is mounted.

## Historical verified production/canary volume beta33

| Script | Viewport / sample | Result |
|---|---:|---|
| Geometry `/machete/squad` | Production beta33, 1440×1000 | There are no repeated validation checks; player table 744 px, header 35 px, row 45 px; DB short names and 3 fixtures + `+N`; document 1440/1440; squad and pool are visible nearby |
| Tablet gap | Production beta33 workflow, 1024×900 | Pool tab available, player search opens; global Menu is not cut off; document overflow 0 |
| Mobile geometry | Production beta33 workflow Pixel 5 + Edge 390×844 | Pool uses cards instead of desktop table; Squad/Pool/Tips and global Menu available; document width 390/390; saved 15/11/4 valid squad restored |
| WebKit mobile geometry | Production beta32, WebKit 26.5, iPhone 13 UA, 390×664 | USER-login and authenticated pool API 200; player search, Squad/Pool/Tips and Menu work; root/body width 390; console errors/warnings 0; There are no observed 4xx/5xx. `maxTouchPoints=0`, so the physical/touch gate is not closed |
| Full automated journey | Production beta33, desktop | Real forecast pool loaded; worker auto-pick gave valid 15/11/4 and budget 100/100; option saved, restored according to `squadId`, QA-copy deleted in cascade |
| Search for player `Mbeumo` | Production beta33, 1440×1000 | Bryan Mbeumo visible with FP 5.59, short team `Man United`, full name and compact fixtures available; document width 1440 |
| Saved squad | Production beta33, desktop/mobile | `My squad · 15/15` restored after reload: 15/15, 11/11, 4/4, valid, budget 100/100, no changes to saved |
| Automatic selection | Production beta33, Edge 1440×1000 | Worker chunk HTTP 200; 15/15 for 2 463 ms with limit 5 s; synthetic event duration 128 ms, max result-render long task 483 ms; this is not real-user RUM |
| Full pool | Production beta33, desktop/mobile | Real EPL 2026/2027 pool loaded; desktop table compact, mobile cards; no loading errors, page-level overflow 0 |
| Transfer recommendations | Production beta33 | After automatic selection, 6 plans with projected winnings, reasons and risks on the real pool are shown; official prices not announced |
| Desktop scheduler | Production beta33, 1440×1000 | The squad and compact pool are placed side by side; short names are taken from DB; document overflow 0; intentional USER 403 tested separately |
| Mobile scheduler | Production beta33, 390×844 | The main control stack, saved valid squad and admin report page are placed in 390 px; document overflow 0; physical/touch gate is not closed |
| Route `/machete/squad` | 10 authorized downloads | All answers 200; sample 343–2 439 ms, p75 480 ms, p95 2 439 ms; SMART threshold p75 ≤2,5 with fulfilled |
| Horizon recalculation | 10 browser-switching | Summary p75/p95 552/585 ms with limit 1 s; transfer recommendations p75/p95 581/603 ms with limit 10 s; 6 plans returned each time; console errors 0 |
| Mixed load | beta22, 5 concurrent, 40 requests | 40/40 GET 200; SSR p75/p95 369/678 ms, pool p75/p95 238/3 102 ms; production saved `healthy`, 0 restarts and did not create new error logs |
| Long mixed load | beta17, 5 concurrent, 60 with | 1 362 GET request, errors 0%; SSR p75 352 ms, pool API p75 85 ms; historical reference for a longer sample |
| Beta telemetry and JSON-report | synthetic QA + production beta33 | Historical synthetic run remains 1, real - 0; USER 403, ADMIN 200/no-store/attachment/no PII; admin UI honestly shows FAIL, 0/10 and physical 0/1 + 0/1 |
| `/api/health` | 20 HTTPS requests | All answers 200; p75 121,9 ms, p95 203,6 ms, maximum 203,7 ms, errors 0 |

Load-smoke is played by the command `npm run beta:load`; the exact profile is described in
`docs/testing/BETA_LOAD_TEST.md`. Short run with five competitive users
does not prove the error rate for the period of real beta testing.

Final production workflow beta33 `29517734343` gave 5 passed and 2 expected
skipped; evidence is saved in artifact `8383413207`. Separate monitor
`29517734277` ended with 0 critical and 0 warning: 227 user-traffic requests,
0 answers 5xx, p75 37,322 ms, p95 218,53 ms. This short window does not replace
long error-rate and RUM real beta.
The old warning about the preload logo was eliminated by removing the unnecessary `priority`.

Beta33 saves beta27 fixes: does not re-register Web Vitals observers
at each timer tick, makes the POST telemetry repeat idempotent and builds RUM for all
real runs, including pending/invalid/failed. After synthetic smoke in
production for 30 days remains `1` synthetic and `0` real runs: QA is not counted as
person and the RUM gate remains FAIL.

## Exact saved result

- Custom option: `My squad`.
- ID: `cmrm8rrsd0001me4e8okeccii`.
- League and season: EPL `47`, `2026/2027`.
- squad: 15/15; start 11/11; bench 4/4.
- Budget: 100/100; bank 0.
- Starting XI for rounds 1–10: 48,4 / 51,6 / 49,1 / 51,2 / 49,6 / 49,9 /
  50,0 / 49,8 / 50,5 / 49,3 FP.
- Official Sports.ru-prices: 0; estimated prices: 629. The interface marks them
  as evaluative and does not disguise itself as official.

## Evolution of mobile Pool

Before the final edit with viewport 360 px, the Squad and Tips tabs had a width
of the document 360 px, but the wide Pool table expanded `documentElement` to 765 px.
Inner `overflow-auto` had the correct width 300 px, however without a separate
positioned containing block Chromium included a table with width 760 px in the root
scroll width.

After adding `position: relative` to the Pool internal scroll container:

- `documentElement.scrollWidth = 360`;
- `body.scrollWidth = 360`;
- the table remained 760 px wide and scrolled only inside the container;
- the result was the same on canary, production beta16, beta17 and beta22.

In beta31, Mobile Pool no longer uses a wide table: until breakpoint `md`
it displays individual player cards, and desktop/tablet saves the table. Therefore
on Pixel 5 there is neither a page-level nor an internal table horizontal scroll.

## What this test does not prove

- Permanent desktop/tablet/mobile browser-smoke is now available; he checks
  viewport geometry, Pool/Menu availability, runtime 5xx/page errors and full
  main scenario. Pixel-diff baseline is intentionally not used between
  Windows and Linux due to differences in font rendering; screenshots are saved as
  CI evidence.
- Automated ax-audit of the same UI on beta21 desktop/mobile gave 0
  violations, and production beta22 keyboard-check passed in Edge. This doesn't replace
  tests on real Safari iOS and Chrome Android. Beyond Chromium/Edge
  viewport is now verified by WebKit 26.5 from iPhone UA to 390×664, but
  `maxTouchPoints=0`, platform `Win32`, there was no physical device.
- There is a reproducible mixed load-smoke; no long lasting RUM/Web Vitals and
  confirmed error rate for the period of real beta testing.
- No minimum 10 independent participants and completion rate ≥80% according to the protocol
  `docs/testing/BETA_USER_TEST_PROTOCOL.md`.
- No real Sports.ru prices: official GraphQL returns
  `currentSeason: null`, so the planner uses estimated prices fairly.
