# Live UI observations — 2026-11-04

Authenticated existing browser session; production 0.3.148. Read-only navigation of home, football Squad, Franchises and KHL. No squads, preferences, imports or subscriptions saved. One temporary tab was closed and viewport override reset.

- Home rendered without visible overlap at default desktop width; meaningful source-specific freshness is present.
- Football Squad desktop rendered full controls and analytical table. At 390x844 the Squad/Pool/Tips switch and analytical mobile cards are present, selected columns retained; document scrollWidth375 <= viewport390, no whole-page horizontal overflow. No automated mobile interaction mutation was performed.
- Forecast cards show missing alternative forecasts as zero in some places while table explanations explicitly use unavailable; investigate semantic consistency separately before changing domain values.
- Franchises at1024x900 visibly reports sources through21Oct and calculation21Oct2026 13:36:02, 87 rounds and50,873 squads. This confirms the impact of repeated memory-gate failures. No console error was returned during the observed view.
- KHL at1024x900 reports full successful update04Nov11:22:47 Moscow, explicit partial-source status, and unavailable values marked with a dash. No observed top-level layout overlap.
- Mixed Russian/English labels remain across provider data and module UI. This is a consistency improvement candidate, not proof that data is wrong.

Independent code/DOM audit reproduced SortableTable keyboard cancellation, modal focus lifecycle gaps, shifted forecast round numbering and fixed Russian five-round wording. WI-086 owns fixes and real DOM regression validation.

Limits: representative routes and widths, not every screen/state; no production load test, no inferred Core Web Vitals from proxy timings. Existing scheduled browser smoke last completed successfully03Nov run41623372470. Post-release checks must target the actual new revision.
