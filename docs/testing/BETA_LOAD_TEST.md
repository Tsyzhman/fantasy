# Beta Load Test

Date of last reconciliation production: 2026-07-16.

Current production - beta32
(`sha256:bc3560ea302dabc5b28e3acf48062f08f30749a0052a6e4f5a013351f538f75c`).
Below the actual beta22 load metrics are saved without renaming them into results
beta32: after beta22 the comparable long authenticated load was not executed
profile. Beta32 went through browser workflow `29507456004` and the final one separately
monitor `29508147332`.

Verifier simulates real authorized scheduler loading: each
the virtual user consistently receives the squad SSR page and
private full pool API. Read-only queries (`GET`), redirect disabled,
therefore the transition to login cannot be mistakenly considered successful HTTP 200.

## Final production-smoke beta22

Active image: `fantasy-scout-web:beta22-20260715T194832Z`, image ID
`sha256:0b26738919f6638772749634f07d3acdf69c70baeb2ee1fb6cd322ef26ba18d5`.

After applying 000006 and production swap, a short authorized
mixed-smoke: 40 GET requests, five simultaneous requests in each batch, 20 each
SSR pages and full-pool API. Redirect is disabled, responses have been fully read.

| Circuit | SSR page | Full pool API | Errors |
|---|---|---|---:|
| Canary beta22 | p75 405 ms; p95 670 ms; max 671 ms | p75 238 ms; p95 3 091 ms; max 3 099 ms | 0/40, 0% |
| Production beta22 | p75 369 ms; p95 678 ms; max 679 ms | p75 238 ms; p95 3 102 ms; max 3 135 ms | 0/40, 0% |

Production remained `running|healthy`, restart count 0; browser console - 0
errors/0 warnings, there are no new application error logs. After removing the canary
PostgreSQL 24 active connections from 100.

Before beta22-promotion, functional smoke once received HTTP 500 due to
`too many clients`: four obsolete canaries were left at the same time
beta18–beta21. Production did not switch and was not affected. Only these four
of accurately identified canaries were removed, connections dropped from 100 to 38, and
repeated canary/production runs passed without errors. Runbook now requires
keep no more than one canary and delete it after acceptance.

Short beta22 sample confirms new runtime but does not replace longer one
60-beta17 second profile is below and especially does not prove beta-period error
rate.

## Reference 60-second production result beta17

Historical image: `fantasy-scout-web:beta17-20260715T174112Z`, image ID
`sha256:cbb542f32e6705199fd48559dd8efd26f37eb3805c4aa0a3ff9eb66dde146323`.

| Circuit | Profile | SSR page | Full pool API | Errors |
|---|---|---|---|---:|
| Canary cold | First sequential mixed loop | 3 858 ms | 2 918 ms | 0/2, 0% |
| Canary | 5 concurrent, 60 s, 1 112 requests | p50 311 ms; p75 363 ms; p95 443 ms; p99 537 ms; max 620 ms | p50 169 ms; p75 208 ms; p95 313 ms; p99 2 675 ms; max 2 863 ms | 0/1 112, 0% |
| Production | 5 concurrent, 60 s, 1 362 request | p50 318 ms; p75 352 ms; p95 439 ms; p99 583 ms; max 761 ms | p50 64 ms; p75 85 ms; p95 178 ms; p99 2 446 ms; max 2 937 ms | 0/1 362, 0% |

Production after the run remained `running|healthy`, restart count 0;
public `/api/health` replied to 200 in 85 ms. No new application error logs
appeared. The only structured warning refers to a known external
status Sports.ru `currentSeason: null`; official prices have not been changed.

Starting from beta17, including beta22, the shared league/season player pool is cached in-process for 30 seconds
with a maximum of 20 keys, and simultaneous cache misses are combined into one Promise.
Custom squads are not cached, ownership of the transferred `squadId` is verified
is a separate request, the HTTP response remains `private, no-store`. Therefore the result
measures actual production behavior with this limited cache, including rare
cold misses p99/max.

Compared to the same production profile beta16 SSR p75 decreased from
2 308 to 352 ms, and full pool p75 - from 5 461 to 85 ms. SMART-gate SSR p75 ≤2,5 with
passed with a large margin; error rate 0%.

## Baseline beta16 before optimization

Image: `fantasy-scout-web:beta16-20260715T165800Z`.

| Level | Profile | SSR page | Full pool API | Errors |
|---|---|---|---|---:|
| 1 | 3 concurrent, 30 s, 46 queries | p50 773 ms; p75 1 391 ms; p95 1 486 ms; max 1 586 ms | p50 3 475 ms; p75 4 075 ms; p95 4 298 ms; max 4 368 ms | 0/46, 0% |
| 2 | 5 concurrent, 60 with, 106 requests | p50 1 504 ms; p75 2 308 ms; p95 3 075 ms; max 3 214 ms | p50 4 415 ms; p75 5 461 ms; p95 5 992 ms; max 6 297 ms | 0/106, 0% |
| CLI replay | 2 concurrent, 10 s, 14 queries | p75 498 ms | p75 3 214 ms | 0/14, 0% |

After each stage beta16 remained `running|healthy`, restart count 0,
`/api/health` answered 200. Full pool p75 5 461 ms was a real bottleneck, not
hidden or excluded from the result; this is the baseline used for
comparisons with beta17.

Observed error rate in all correct main runs beta16, beta17 and beta22 -
0%. This closes the reproducible load-smoke, but doesn't prove the error rate per
real beta testing period: this still requires a test group and
long-term collection of production metrics.

## Repeatable command

Public health profile without authorization:

```powershell
npm run beta:load -- `
  --base-url=https://fantasy.tsyzhman.ru `
  --target=health=/api/health `
  --duration-seconds=30 `
  --concurrency=3 `
  --max-primary-p75-ms=500
```

The authorized mixed profile uses a temporary Cookie header for the QA session.
The value cannot be saved to `.env`, shell history, documentation or Git:

```powershell
$env:BETA_LOAD_COOKIE = '<temporary name=value Cookie header>'
try {
  node node_modules/tsx/dist/cli.mjs scripts/beta-load-test.ts `
    --base-url=https://fantasy.tsyzhman.ru `
    '--target=page=/machete/squad?leagueId=47&season=2026%2F2027&squadId=QA_SQUAD_ID' `
    '--target=pool=/api/machete/squads?leagueId=47&season=2026%2F2027&squadId=QA_SQUAD_ID' `
    --primary-target=page `
    --duration-seconds=60 `
    --concurrency=5 `
    --timeout-ms=20000 `
    --max-error-rate=0.01 `
    --max-primary-p75-ms=2500
} finally {
  Remove-Item Env:BETA_LOAD_COOKIE -ErrorAction SilentlyContinue
}
```

Direct run `node` is required for this PowerShell example: Windows
`npm.cmd` re-parses the `&` characters inside the query string and may trim
target. On Linux/macOS the same profile can be launched via
`npm run beta:load -- ...`.

## Safety and pass/fail

- The external target must use HTTPS; HTTP is only allowed for loopback.
- URL with embedded credentials is rejected.
- Concurrency is limited to the range 1–20.
- Duration is limited to the range 1–300 seconds.
- Timeout is limited to the range 100–60 000 ms.
- No more than five target routes are allowed.
- For each request, a unique `_beta_load` is added to exclude
  HTTP/CDN cache. Limited internal beta17+ player-pool cache is intentionally not
  is bypassed: it is part of the measured production runtime.
- Redirect is used in `manual` mode; unauthorized 3xx is considered
  error.
- Gate crashes if the error rate is not strictly less than the specified limit or p75
  main target exceeds the limit.
