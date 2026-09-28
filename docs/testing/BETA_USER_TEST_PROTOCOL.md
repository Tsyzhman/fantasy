# Closed beta test protocol

Status: **not carried out**. This document specifies a procedure, but is not
proof of reaching the threshold 80% without completed real results
participants.

Operational order of invitations, preflight, opening fixed server-window,
moderation and final sign-off set in
[closed beta launch runbook](../operations/BETA_LAUNCH_RUNBOOK.md).

## What the application measures

Collection is not enabled for regular users. It starts only after an explicit
consent on the special page `/beta-test` and is valid in the current tab until
stopping or closing a tab. Used for technical QA
`/beta-test?synthetic=1`; such runs are permanently excluded from the user
gate.

The server stores the internal account ID only for counting unique
members, opaque run ID, device class, viewport width, paths
pages, allowed script stages, Web Vitals and rough client categories
errors. The search query, entered text, name and email are not recorded in
observations are not displayed in the report.

Only verifiable technical facts are automatically recorded:

1. found a player with an available forecast after a non-empty search;
2. scheduler open;
3. full valid auto-selection was successfully completed;
4. the participant actually saw the budget and forecast block;
5. the participant actually saw or applied the transfer recommendations;
6. squad saved by server;
7. saved full valid squad was restored after the current reload;
8. duration, page views, Web Vitals and allowed error categories.

RUM-unit is built according to **all** real runs, including pending, invalid and
unsuccessful. Moderator filtering cannot remove slow or erroneous
run from performance sample. Synthetic QA is excluded from the RUM gate.

The application does not guess human facts. Run validity, lack
help, understanding the reason for the transfer, assessing the convenience and critical/blocker problem
must be separately confirmed by the moderator. It really captures in a structured way
observed environment: desktop browser, physical Safari iOS, physical Chrome
Android or other mobile/emulator. User-Agent is not automatically saved and
is not considered evidence of a physical device. End button or
normal stop first sends a separate command to the server `finish`; server
fixes `submittedAt`, and after that does not accept new observations. To
server submission the run is shown separately as open, after submission -
as pending review. Before review, the run is not included in the denominator.

## Sample and conditions

- At least 10 participants from the target audience of fantasy football.
- If possible, at least five runs on the phone and five on the computer.
- In the primary sample, at least one moderated run on a physical
  Safari iOS and at least one on physical Chrome Android.
- The participant has not previously completed the scenario in the current version of the product.
- Each participant has a separate account: uniqueness is considered according to
  internal user ID, and not by the number of repeated launches of one account.
- A production-like environment with applied migrations is used
  `000006_beta_test_telemetry` and
  `000008_beta_test_moderated_environment`,
  `000009_beta_test_submission`,
  `000010_beta_test_submission_contract`, real league/season data and
  with a separate member account.
- Before the start, the exact planner scope is checked for fresh readiness. Until the first
  of the match played, the general data-quality endpoint can honestly return 503,
  only if the current default simultaneously has `healthy=true`, `ready=true`,
  empty readiness reasons and `audit.mode=PRESEASON_FORECAST` with
  `plannerGatePassed=true`. After the finished match appears, it is required
  `FULL_DATA_QUALITY` and a complete successful gate. The exact checks are listed in
  [launch runbook](../operations/BETA_LAUNCH_RUNBOOK.md#accurate-preflight). Broken environment
  does not turn into a "user error": such a run is marked as
  is technically invalid and will be repeated after correction.

## Assignment to participant

> Find the player you are interested in, open the lineup planner, get
> optimized squad, open transfer recommendations, save option
> and make sure after refreshing the page that it is saved. If pure improvement
> no, mark this result as viewed recommendations.

The moderator does not explain the location of the elements and does not suggest the next step.
Allowed only to repeat the text of the task. The main scenario limit is five minutes.

After the participant has opened the recommendations, the moderator asks without prompting:
“Why can the proposed transfer improve the squad and what is its risk?” Field
`transfer-understood=true` is given only if the answer is meaningful and related
with the predicted gain/risk shown, not when guessing.

## Conditions for successful completion

A run is considered successful only if all conditions are met simultaneously:

1. The participant himself found the player in the catalog.
2. I went to the scheduler and launched full auto-selection.
3. Received a squad that the interface considers acceptable in terms of budget, positions,
   club limit, start and bench.
4. Saved a named option without the help of a moderator.
5. Opened the transfer recommendations block and understood the proposed gain/risk or
   saw a completed status of “net improvement not found.”
6. I refreshed the page and saw the same saved version.
7. Clicked “Complete and Submit” after confirmation of sending the data.
8. Finished within five minutes and did not encounter a critical/blocker defect.

Any hint about the next action, inability to save/restore
squad, time exceeding or critical/blocker means failure.

## Results log

Do not write down your name, email or other unnecessary personal information. Use
anonymous ID.

| ID | Date | Device/browser | Time, s | Success | Help | Critical/blocker | Short reason |
|---|---|---|---:|---|---|---|---|
| - | - | - | - | - | - | - | Test not yet completed |

Detected defects are saved separately with a link to the task, severity and
solution. Once a defect is corrected, the original failure is not removed; repeated
run is recorded separately. Basically, only the first gate is involved
moderator-confirmed valid run of each unique user:
a second successful attempt does not erase the first valid failure.

## Step-by-step instructions for the moderator

1. Before inviting a participant, complete
   [accurate production preflight](../operations/BETA_LAUNCH_RUNBOOK.md#accurate-preflight),
   check the desired league/season and the absence of an open blocker. Red
   the technical circuit cannot be attributed to the user.
2. Create a separate account for the participant and log in to their device.
3. Open `/beta-test`. Do not use `?synthetic=1` for a real person.
4. Let me read the description of the collection. After explicit consent, the participant himself clicks
   “Agree and start the timer”; only then does five minutes begin.
5. Read the task verbatim and do not name the location of the elements.
6. After saving, ask the participant to refresh the page and make sure that
   option has been restored. Write down the eight-character code from the indicator, then
   The participant clicks “Complete and Submit.” If there is a sending error, do not close
   tab: restore the network and repeat. A normal interrupt should also
   receive server acknowledgement before clearing the local session. If
   member forcibly dropped a local session without a network, the run will remain in
   section “Open, not sent” and will block the gate. The moderator can
   close such a truly abandoned run only as invalid, with
   mandatory specific reason; valid-review before participant submission
   is prohibited.
7. Record help, answer about the reason/risk of the transfer, assessment of the convenience of 1–5,
   critical/blocker and actually observed environment. Choose physical Safari
   iOS / physical Chrome Android only when the moderator actually saw
   physical device; The emulator belongs to `OTHER_MOBILE`. If the environment
   made the run technically unfair, mark it invalid and indicate the specific
   reason.
   Before clicking “Agree and start timer”, you can hold the phone and
   vertically and horizontally: the client assigns the landscape phone to `mobile` by
   combination of touch capability, telephone viewport geometry (long side
   no more than 960 px, short - no more than 500 px) and local mobile-browser
   hint. First, `userAgentData.mobile` is used, and in its absence -
   narrow fallback for iPhone/iPod or Android UA with marker `Mobile`. UA not
   is saved, not sent and does not prove the physical device: such
   proof still only provides the moderator's review. Touch laptop 1024×600 and
   a simple low desktop window without touch remains `desktop`. After the start, check the recorded
   `deviceClass` in the review card with the actual device; if there is a discrepancy, no
   confirm the physical environment, and mark the run invalid with a specific
   cause and report the defect.
8. Open the protected page `/admin/beta-test`, find the card by
   eight-character indicator code and fill out the human-only review. The page is not
   shows email, name or internal user ID; synthetic runs are not possible on it
   confirm as real. For automation or emergency fallback the same
   review is available via CLI:

```bash
npm run beta:user-test -- review --run-id=<uuid> --valid=true --without-help=true --transfer-understood=true --rating=4 --critical=false --environment=DESKTOP_BROWSER --notes="краткая заметка"
```

   For a technically invalid run:

```bash
npm run beta:user-test -- review --run-id=<uuid> --valid=false --environment=DESKTOP_BROWSER --invalid-reason="конкретная техническая причина" --notes="краткая заметка"
```

9. After each session and based on the results of the sample, generate a machine-readable report:

   In production, open `/admin/beta-test` and click `Download JSON report`.
   Protected endpoint `/api/admin/beta-test/report` forms the same 30- daily
   an impersonal report directly in the runtime application and sends it with
   `Cache-Control: private, no-store`.

   Historical production beta33 acceptance 2026-07-16 confirmed this contract
   actually:
   USER received 403/`FORBIDDEN`, ADMIN - 200, `application/json`,
   `Cache-Control: private, no-store` and
   `Content-Disposition: attachment; filename="beta-user-test-2026-07-16.json"`.
   Link `Скачать JSON-отчёт` to `/admin/beta-test` created download 2 574 bytes
   with SHA-256 `52d00fd16c8790dea6843dddd934f2ea649bb5804a9d13b8a3b3e66b08f86fe8`.
   Check did not find email, QA-name or field `userId`; one-time QA-user and that's it
   associated session/squad records were deleted after verification. The report is still
   shows 0 real participants and FAIL, so acceptance does not fill in
   human-only summary below.

   CLI version is intended for a working checkout, where `npm install` is executed:

```bash
npm run beta:user-test -- report --since-days=30
```

   Minimal production Docker image intentionally does not contain `tsx`, sources
   `scripts/` and devDependencies; run this CLI command inside live web
   container is not allowed. For production, use download on the admin page.

   For CI/final solution use `--require-pass=true`; with FAIL command
   returns exit code 2. The report does not contain email, name or internal user
   ID. Fields `pendingReviews[].runId` and `primaryRuns[].runId` are needed by the moderator
   for review and tracing; the internal user ID is not displayed in them.

## Beta-gate calculation

```text
completion_rate = independently_completed_primary_runs / distinct_valid_participants * 100
forecast_found_rate = primary_runs_with_forecast / distinct_valid_participants * 100
transfer_understanding_rate = understood_primary_runs / distinct_valid_participants * 100
```

Gate passes only if:

- valid participants no less than 10;
- each valid/primary run has a real server acknowledgement from the participant
  submission; `reviewedAt` never replaces `submittedAt`;
- no open real runs without server submission;
- no real runs awaiting moderator review;
- `completion_rate >= 80%`;
- `forecast_found_rate >= 80%`;
- `transfer_understanding_rate >= 70%`;
- average convenience rating is not lower than 4/5;
- there is no critical/blocker in the primary selection and no critical mobile run;
- there is at least one moderator-confirmed `IOS_SAFARI_PHYSICAL` and one
  `ANDROID_CHROME_PHYSICAL` primary run;
- for each successful run, no help and no more time are confirmed
  five minutes.
- LCP was received at least from 10 different real participants, and its RUM p75 is not
  exceeds 2,5 seconds.
- for an explicitly specified real beta window share of server 5xx among eligible
  user requests are less than 1%; the report indicates the beginning, end,
  actual duration and number of requests. Dedicated monitor and
  browser-smoke User-Agent are excluded, normal user requests are
  no. Status `insufficient_data` does not close the gate.

Human JSON and fixed server report are two independent sources.
The final beta-gate passes only as composite AND: human JSON has
`gate.passed=true`, and the fixed report has an exact start saved by log coverage,
status `ok`, minimum 20 eligible requests, observed span not less than 1 440
minutes and server 5xx rate is strictly less than 1%. The exact manifest and sign-off are specified in
[launch runbook](../operations/BETA_LAUNCH_RUNBOOK.md#closing-the-window-and-evidence); PASS one
admin report without fixed server evidence does not confirm a full beta.

Technically invalid runs are listed separately with the reason and not
is neither in the numerator nor in the denominator. Their share is also published so that
it was impossible to hide the instability of the environment except for awkward attempts.
At the same time, they remain in `rum`: this unit separately shows the observation window,
number of real runs and participants, page views, client errors, share of runs with
client error, p75 and distribution of ratings of each Web Vital. Repeat one
and the same HTTP telemetry request are idempotent and do not increment these counters.
Observations are immutable after server submission; repeated `finish` is idempotent.

## Final report

After the test, fill in:

- valid runs: **not measured**;
- unique valid participants: **not measured**;
- successful runs: **not measured**;
- completion rate: **not measured**;
- forecast found rate: **not measured**;
- transfer understanding rate: **not measured**;
- average comfort rating: **not measured**;
- Web Vitals p75: **not measured**;
- server 5xx rate / window / eligible requests: **not measured**;
- physical Safari iOS / Chrome Android: **not measured / not measured**;
- open critical/blocker: **not measured**;
- beta-gate solution: **FAIL / test failed**.
