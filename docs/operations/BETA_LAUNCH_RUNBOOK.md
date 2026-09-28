# Runbook launch closed beta

This document is intended for the Product Owner and Lead Moderator. He
turns [user test log](../testing/BETA_USER_TEST_PROTOCOL.md) into
specific startup order. It does not replace the protocol or soften its thresholds.

## Launch decision

Assign one solution owner and one lead moderator. Until the first
invitations write down:

- production URL: `https://fantasy.tsyzhman.ru`;
- participant URL: `https://fantasy.tsyzhman.ru/login?next=/beta-test`;
- league/season: `47 / 2026/2027`;
- minimum duration of a real beta window: **1 440 minutes (24 hours)**;
- minimum: **10 different participants**, five telephone and five desktop runs;
- required physical runs: at least one Safari iOS and one Chrome Android;
- responsible for production, moderation and analysis of the blocker defect;
- emergency communication channel available to participants and moderators.

Plan the first and last real runs with an interval of at least 24 hours.
Synthetic traffic, production monitor and browser smoke do not increase the real
window and are not considered users.

## Accurate preflight

Perform a basic check just before opening server-window. After
exact start and rollout settings with beta env repeat it entirely; only the second
result is permission to invite people. Then repeat the check before
each group of sessions.

1. Open `https://fantasy.tsyzhman.ru/api/health`. Requires HTTP 200.
2. Open `https://fantasy.tsyzhman.ru/login?next=/beta-test`. HTTP required
   200, working login form and transition to `/beta-test` after logging in as a test USER.
3. Open `https://fantasy.tsyzhman.ru/api/health/client-errors`. Wanted
   HTTP 200, `healthy=true` and `total=0`.
4. Open `https://fantasy.tsyzhman.ru/api/health/data-quality` and find in
   `plannerDefaults` object with `leagueId="47"`. To run simultaneously
   required:

   - `healthy=true`;
   - `scope.season="2026/2027"`;
   - `configured=true`;
   - `readiness.ready=true` and empty `readiness.reasons`;
   - `readiness.activePlayers > 0` and `readiness.upcomingFixtures > 0`;
   - `readiness.audit.status="COMPLETED"`;
   - `readiness.audit.plannerGatePassed=true`;
   - `readiness.ingestion.status="completed"`;
   - audit and ingestion are not older than the specified `readiness.maximumAgeHours`.

   Before the first match played is acceptable
   `readiness.audit.mode="PRESEASON_FORECAST"`, zero
   `readiness.audit.finishedMatches`, `readiness.audit.gatePassed=false` and general
   HTTP 503 of this endpoint. This is a fair state: full match-data gate yet
   is not measurable, but planner is allowed only with fresh real fixtures,
   sufficient forecast coverage and `plannerGatePassed=true`.

   After the appearance of at least one finished match is required
   `readiness.audit.mode="FULL_DATA_QUALITY"`,
   `readiness.audit.gatePassed=true` and the overall data-quality should be green.
5. Open `/admin/beta-test`. There should be no unknowns before the first session
   open or pending real runs. An old unfinished run cannot be silently
   delete or accept as valid: find out the origin and close it only
   according to protocol rules.
6. Check the latest `Production Monitor`: critical failures must be
   are equal to zero. Warning is sorted by content; warning about pre-season full
   DQ is valid only when executing step 4.

Any requirement not met, other than the expressly described pre-season condition,
means **NO-GO**.

## Opening fixed server-window

Fixed-window must be opened **before** issuing the task to the first participant. Not
substitute backdated unknown time. New window breaks continuity
is old, so first archive the old start and snapshot.

On the server running `deploy` run:

```bash
release_stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
sudo install -d -m 0750 /var/backups/fantasy-scout/beta-monitor
if sudo test -f /var/lib/fantasy-scout-monitor/beta-access-window-start; then
  sudo cp --preserve=mode,timestamps \
    /var/lib/fantasy-scout-monitor/beta-access-window-start \
    "/var/backups/fantasy-scout/beta-monitor/beta-access-window-start-${release_stamp}"
fi
if sudo test -f /var/lib/fantasy-scout-monitor/beta-access-audit.json; then
  sudo cp --preserve=mode,timestamps \
    /var/lib/fantasy-scout-monitor/beta-access-audit.json \
    "/var/backups/fantasy-scout/beta-monitor/beta-access-audit-${release_stamp}.json"
fi
beta_start="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
printf '%s\n' "$beta_start" | \
  sudo tee /var/lib/fantasy-scout-monitor/beta-access-window-start >/dev/null
sudo chown caddy:caddy /var/lib/fantasy-scout-monitor/beta-access-window-start
sudo chmod 0644 /var/lib/fantasy-scout-monitor/beta-access-window-start
printf 'BETA_WINDOW_START=%s\n' "$beta_start"
sudo systemctl start fantasy-access-audit.service
sudo systemctl is-active fantasy-access-audit.timer
```

Copy the printed value `BETA_WINDOW_START` without changes. Then in
GitHub repository variables set:

```text
MONITOR_FIXED_WINDOW_EXPECTED_START=<точное BETA_WINDOW_START>
MONITOR_FIXED_WINDOW_MIN_OBSERVED_SPAN_MINUTES=1440
```

Via GitHub CLI from the worker checkout this is equivalent to:

```bash
gh variable set MONITOR_FIXED_WINDOW_EXPECTED_START --body "<точное BETA_WINDOW_START>"
gh variable set MONITOR_FIXED_WINDOW_MIN_OBSERVED_SPAN_MINUTES --body "1440"
gh workflow run production-monitor.yml --ref main
```

The same exact start should go into the runtime of the application. Via installed
[immutable deployment-process](DEPLOYMENT.md) set all variables to the release:

```text
BETA_TEST_SERVER_AUDIT_URL=https://fantasy.tsyzhman.ru/_monitor/beta-access-audit.json
BETA_TEST_FIXED_WINDOW_EXPECTED_START=<точное BETA_WINDOW_START>
BETA_TEST_FIXED_WINDOW_MIN_SPAN_MINUTES=1440
BETA_TEST_SERVER_AUDIT_MAX_AGE_MINUTES=90
BETA_TEST_RUM_MIN_SPAN_HOURS=24
BETA_TEST_RUM_MAX_AGE_HOURS=24
```

This is a runtime env of a web application, and not a replacement for the monitor's repository variables. Not
print the entire production env and do not change the env already created
container. Do a normal immutable rollout with the rollback candidate, then
repeat full preflight. Missing, malformed or mismatched beta
variable should leave `/admin/beta-test` and its JSON-report in the state
FAIL; do not bypass fail-closed with a manual mark.

Check
`https://fantasy.tsyzhman.ru/_monitor/beta-access-audit.json`. Before accumulation
warning window/`insufficient_data` expected; are required
`windowMode="fixed_start"`, exact match `windowStart` with the recorded start and
`retentionCoversWindowStart=true`. Start mismatch or loss of log coverage -
NO-GO, not a warning that can be ignored.

## Sampling and scheduling

Each slot belongs to a separate person from the target audience and a separate
USER account. The participant must not have previously completed this scenario in the current
version. Fill out the table before sending out invitations; keep names and emails only
in the closed contact list, not in the beta report and not in moderator notes.

| Slot | Anonymous ID | Environment | Mandatory Configuration | Account Created | Date/Time | Moderator | Summary |
|---:|---|---|---|---|---|---|---|
| 01 | — | Phone | Physical Safari iOS | ☐ | — | — | — |
| 02 | — | Phone | Physical Chrome Android | ☐ | — | — | — |
| 03 | — | Phone | iOS or Android, physical | ☐ | — | — | — |
| 04 | — | Phone | iOS or Android, physical | ☐ | — | — | — |
| 05 | — | Phone | iOS or Android, physical | ☐ | — | — | — |
| 06 | — | Desktop | Chrome | ☐ | — | — | — |
| 07 | — | Desktop | Edge | ☐ | — | — | — |
| 08 | — | Desktop | Firefox | ☐ | — | — | — |
| 09 | — | Desktop | Safari macOS or Chrome | ☐ | — | — | — |
| 10 | — | Desktop | Any supported desktop browser | ☐ | — | — | — |

Slot 01 should be among the first sessions, slot 02 should be among the last or
is the opposite. Between the first and last eligible real request there should be no
is less than 1 440 minutes. If one of the runs is invalid, invite an additional one
unique member in the same device category: invalid not included
is the denominator of human-gate, but remains in RUM.

## Invitation text

Send URLs and temporary credentials via a secure private channel. Don't turn it on
password for general chat, calendar description or moderator notes.

> We invite you to a short moderated test of the Fantasy Scout service. Needed
> one independent scenario lasting up to five minutes and several more
> minutes for an introduction and one question. Please use the designated device
> and browser and do not open the service in advance. Open at the agreed time
> https://fantasy.tsyzhman.ru/login?next=/beta-test and log in with personally issued
> login and temporary password. The test page will contain a description of the collected
> technical data; collection will begin only after your explicit consent. We don't
> we write the search text, entered data, name or email into the beta report. If
> you want to revoke consent or request data deletion, please inform the moderator:
> There is currently no automatic deadline for deleting beta runs. If
> login or page is not working, do not reload anything repeatedly: report
> to the moderator via an agreed channel. Do not send your password in a reply message.

## Life cycle of credentials

1. In `/admin/users`, create ten separate active accounts with the USER role.
   Use a unique email/alias and a unique random password no shorter
   form requirements; store the match only in a password manager or other
   approved closed storage facility.
2. Do not use a common account, work ADMIN, or one password for several
   participants. Do not publish credentials in an issue, report, or artifact.
3. Before the session, check the input once, then sign out. Don't run
   `/beta-test` with this check: otherwise a real unfinished run will appear.
4. Transfer credentials only to a specific participant and only for their duration
   sessions. If you suspect disclosure, disable your account, create a new one and
   commit the replacement to the closed roster.
5. Immediately after server submission, moderator review and checking the appearance of the run
   in the admin report, disable the participant account in `/admin/users`. Shutdown
   ends its active sessions and saves the verified history for the final
   evidence.
6. Deletion of personal data upon request cannot be imitated by simple deletion
   lines from the report. Before starting, assign a data owner contact and
   procedure for processing such a request; keep your account until it is completed
   disabled and do not distribute the uploaded evidence.

## Moderator checklist on the day of the session

### Before consent

- [ ] Repeated preflight; production is not in the stop-line.
- [ ] Anonymous ID, individual USER and assigned device have been verified.
- [ ] For mobile, the device model, OS version,
  browser and orientation; this data is not added to the public JSON.
- [ ] Open only `https://fantasy.tsyzhman.ru/login?next=/beta-test`, without
  `?synthetic=1`.
- [ ] The participant entered and read the consent himself. The timer has not started yet.
- [ ] The moderator is ready to read the task from the protocol verbatim and not show it
  arrangement of elements.

### During five minutes

- [ ] The participant himself clicked “Agree and start the timer.”
- [ ] There was no prompt for the next action. Any such hint is recorded
  as help; This run cannot be considered successful.
- [ ] Only observed problem, time and screen, without name, are recorded,
  email, search text and credentials.
- [ ] After the recommendations, a precise question was asked about the predicted gain and risk.
- [ ] After saving, a real reload was performed and the recovery was checked.
- [ ] An eight-character participant code has been recorded.
- [ ] The participant clicked “Complete and Submit” and the interface confirmed the submission.

### Immediately after

- [ ] In `/admin/beta-test` the same code was found and `deviceClass`, milestones,
  duration, Web Vitals and client errors.
- [ ] Filled in valid/invalid, without help, transfer understanding, usability
  1–5, critical/blocker and actually observed environment.
- [ ] Physical iOS/Android selected only after personal verification of the device.
- [ ] Pending/open run is not left without a solution. The missing LCP is not made up:
  is a RUM space that requires an additional unique member.
- [ ] The defect received a severity, a link to issue, owner, and a decision to continue.

## Stop-line

Stop new sessions immediately if at least one condition is true:

- `/api/health` or login does not return 200;
- current planner default has ceased to be `healthy=true`/`ready=true`, audit or
  ingestion are outdated or appeared for readiness reasons;
- client-errors health red or new crash/error boundary found;
- member cannot find a player, get a valid auto-match, save or
  restore the squad due to a system error;
- there is a violation of the budget, positions, club limit, start or bench;
- there was a loss/confusion of accounts, someone else's squad or observations;
- detected critical/blocker, repeated mobile overflow or unavailable
  main action;
- fixed snapshot lost exact start or `retentionCoversWindowStart=true`;
- rolling or fixed audit shows server 5xx breach.

Open run, mark valid/invalid only for facts. Technical glitch Record
as a user failure. Correct the reason, repeat the full
preflight and invite a new member; repeating the same person does not replace it
first valid primary run.

## Closing the window and evidence

Do not close the window until all conditions are met:

- reviewed primary runs from different valid participants no less than 10;
- physical iOS and Android verified by moderator;
- LCP is obtained from at least 10 different real participants;
- at least 24 hours passed between the first and last real beta observation;
- fixed server snapshot has a minimum of 20 eligible requests and
  `observedSpanMinutes >= 1440`.

After the last review, force update the snapshot:

```bash
sudo systemctl start fantasy-access-audit.service
sudo systemctl status fantasy-access-audit.service --no-pager
```

Download `/api/admin/beta-test/report` via the button on `/admin/beta-test` and
`https://fantasy.tsyzhman.ru/_monitor/beta-access-audit.json`. Meaning
`generatedAt` of the fresh fixed snapshot is the exact UTC end of this saved one
server evidence window; do not replace it with download time. Lock
is also the latest Production Monitor, anonymized device matrix and list
defects. Device matrix contains only anonymous ID, environment, model,
OS/browser version and the fact of personal verification by the moderator. For each file
save date, size and SHA-256.

Final evidence manifest:

```text
Release/revision:
Decision owner:
Lead moderator:
Beta window start UTC:
Beta window end UTC:
Minimum span: 1440 minutes
Human report: filename / generatedAt / bytes / SHA-256
Human gate: PASS|FAIL
Participants / independently completed / completion rate:
LCP participants / LCP p75 / RUM observation span:
Physical Safari iOS / Chrome Android:
Device matrix: filename / bytes / SHA-256
Fixed server report: filename / generatedAt / bytes / SHA-256
Fixed start exact match: yes|no
Retention covers start: yes|no
Eligible requests / observed span minutes / server 5xx / rate:
Production Monitor run / critical failures / warnings:
Open critical or blocker issues:
Excluded invalid runs and reasons:
Final composite decision: PASS|FAIL
Sign-off name / UTC timestamp:
```

`Final composite decision=PASS` is allowed only when executing simultaneously:

1. human JSON `gate.passed=true`;
2. fixed server report: `status="ok"`, exact `windowStart`,
   `retentionCoversWindowStart=true`, `requests >= 20`,
   `observedSpanMinutes >= 1440` and `serverErrorRatePercent < 1`;
3. Production Monitor does not have critical failure;
4. there is no open critical/blocker and all required evidence fields are filled in.

The current admin/JSON gate is required to download fixed server evidence and enable it
into a composite solution. Missing or stale snapshot, mismatched start,
short span and 5xx breach should give FAIL. Signed manifest regardless
captures both source reports; UI PASS without saved sources is not considered
is sufficient proof. Do not reset `beta-access-window-start` or
change GitHub variables or beta runtime env before saving and checking
evidence.
