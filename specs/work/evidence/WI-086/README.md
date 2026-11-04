# WI-086 verification — 2026-11-04

Checkout: `C:/Users/Nik/.codex/worktrees/audit-20261104/fantasy_export`, branch `codex/project-audit-20261104`. Baseline source revision: `158556f99c8cc9ba6ba929ddd69d776c61c88c04` (four client files loaded read-only with `git show`). No database or real message sender participates in these checks.

## Before → after

| Scenario | Original behavior, reproduced in actual Edge DOM | Final behavior, verified with real key events |
|---|---|---|
| Table body Add | Enter + Space: `add:0`; pointer click: `add:1` | Enter + Space: `add:2`; Remove, checkbox, text-space, implicit form submit and link Enter also work |
| Sort header | Enter/Space canceled throughout the table | Only genuine sortable-header activation cancels the default; nested button and resize never sort; DOM/managed/server sort still work |
| Touch dialog | Tab and Shift+Tab escape; closing does not restore trigger | Initial Close focus, bidirectional wrap, Escape from arbitrary child, trigger return; removing the trigger returns to the next roster action |
| Find replacement | No focus transfer to the next step | Exact named player search receives focus in EN/RU; closed/open secondary filters cannot select Fits; loading pool receives visible section focus |
| XI/bench replacement | No deliberate next-step focus | Replacement panel receives focus, then Tab reaches Cancel and candidate actions |
| CommandPalette component | Escape on Close button leaves it open | Escape anywhere closes; dynamic/no-result Tab order wraps; returns to mouse or Ctrl+K trigger; command navigation remains functional |
| Nested component shortcut | Palette below touch actions could receive hidden focus | Palette overlays touch actions; Escape returns to the underlying dialog, then its trigger |
| Primary tooltip `[null,4,8]` | `Round 1: 4`, `Round 2: 8` | `Round 1: unavailable`, `Round 2: 4`, `Round 3: 8` |
| Russian alternative T3 title | Says “пять туров” | Uses selected horizon (3 or 5); EN/RU, missing and nonfinite values and zero covered |

CommandPalette has no production mount in the audited source. It remains dormant: this change covers its existing component without connecting new navigation UI. The touch roster and SortableTable are active product UI.

## Evidence and limits

- [before.json](before.json): asserted original behavior with zero runtime errors. [probe-before.cjs](probe-before.cjs) repeats it from an immutable Git revision without modifying the checkout.
- [unit-tests.txt](unit-tests.txt): 82/82 tests (62 existing table/planner contracts, 20 new tooltip regressions).
- [browser-after.txt](browser-after.txt): 42 passed / 18 intentional skips, Edge, one worker. Widths 320/390/1024/1440/1920. Touch tests skip desktop because production uses its existing pitch; loading/lifecycle measurements run once at 390px.
- [browser-visual.txt](browser-visual.txt): 5/5 final responsive captures. `browser/*-layout.json` records equal light/dark geometry, resolved font stack and absent Onest embedding. Actual repository CSS is compiled in isolation; Next's server/font pipeline, auth and database-backed page loading remain integration/release checks.
- `browser/*-{light,dark}-{actions,palette}.png`: screenshots at CSS-pixel scale. Mobile/tablet actions and palette images, and desktop palette images were visually inspected. Dialogs stay inside the viewport; touch-action buttons remain at least 44px. No page-level horizontal overflow or browser runtime errors was observed.
- [modal-lifecycle.json](browser/modal-lifecycle.json): after 30 open/close cycles and explicit GC, dialog document listeners are 0 → 0 (`keydown`, `focusin`), heap 7,229,776 → 8,196,864 bytes, delta 967,088 bytes (0.92 MiB). This is bounded retained growth, not a claim of zero allocation.
- [lint.txt](lint.txt): 0 errors; one pre-existing dependency warning in the untouched captain-persistence effect (`FantasySquadPlanner.tsx:1236`). New focus/test code introduces no lint warnings.
- [default-suite-routing.json](default-suite-routing.json): ordinary authenticated/production config lists 49 tests; isolated fixture matches = 0. `bfcacheId` in the fixture router follows the installed Next 16.4.2 declaration.
- [resources-after.json](resources-after.json): cleanup/process/cache inventory. Only this task's intermediate duplicate logs were removed. Persistent application data, dependencies and other agents' output are retained.

## Repeat the mandatory isolated check

From the audit checkout, with installed workspace dependencies:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:UI_KEYBOARD_EVIDENCE_DIR = 'specs/work/evidence/WI-086/browser'
node ./node_modules/@playwright/test/cli.js test --config e2e/ui-keyboard.config.ts
node ./node_modules/tsx/dist/cli.mjs --test src/components/sortable-table.test.ts src/components/machete/fantasy-squad-ui.test.ts src/components/machete/planner-explanations.test.ts
```

The fixture serves only its browser bundle, repository CSS and local API stubs. It binds `127.0.0.1:0` (OS-selected free loopback port), rejects non-fixture browser requests, closes after every project, and does not use the standard auth state. The separate config is a required UI regression check, not part of production smoke. CI can omit `PLAYWRIGHT_CHANNEL` to use its installed Chromium.

Baseline command:

```powershell
node specs/work/evidence/WI-086/probe-before.cjs 158556f99c8cc9ba6ba929ddd69d776c61c88c04
```

## Design basis

Precedents were searched before implementation, including [Stack Overflow event propagation](https://stackoverflow.com/questions/68070572/stop-keyboard-event-bubbling-to-parent) and [Reddit modal focus discussion](https://www.reddit.com/r/learnreactjs/comments/qq4ngd/). Technical behavior follows primary sources: [React event propagation/default actions](https://react.dev/learn/responding-to-events) and [W3C modal keyboard interaction and focus return](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). No new UI library or runtime dependency was added. Installed Next documentation for `use client` and accessibility, and the local `AppRouterInstance` declaration, were read.
