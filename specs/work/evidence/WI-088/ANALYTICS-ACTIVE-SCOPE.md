# WI-088 — TypeScript franchise eligibility

2026-11-04. Checkout: `C:/Users/Nik/.codex/worktrees/audit-20261104/fantasy_export`; branch `codex/franchise-source-identity-20261104`; baseline `1c9264f07f6b508a074232811f69b1d9aae87eb4`. This is a separate Result supplement to avoid concurrent WI edits with the Python implementation chat.

## Before → after

- Ordinary franchises previously included every non-personal squad, including reserves and unknown active states. They now use only `active === true` non-personal XI. An XI with both `active=true` and `frozen=true` participates once; the frozen flag does not exclude it.
- Manager summaries continue to use all date/league-selected squad observations, including reserves, freezes, personal-only and missing lineups. Virtual «шизы» retains all its unique personal observations without requiring active status.
- Purchases and xFO examples previously used only date/league/personal scope. They now join the eligible XI set on the exact `(franchise, slug, round, team)` tuple. Child rows do not need an active flag. A renamed manager still joins the right XI; another team with the same manager name does not. Ordinary and virtual orphan records cannot enter the selected population.
- Franchise totals, by-league and timeline groups, purchase explanations and hypothesis targets/controls now share this selected population. Incomplete eligible XI still contributes to xFO coverage denominators and missing-lineup counts. The original metric/ranking arithmetic remains.
- Per-board freeze events and denominator calculations are unchanged. UI now calls the denominator «H2H-дуэлей» and explains that distinct duels of the same football round count separately. The method text distinguishes the single-weight XI rating from full personal history.

## Verification

- [Before tests](analytics-active-scope/before-tests.txt): six intended eligibility regressions failed on the original analytics implementation.
- [After tests](analytics-active-scope/after-tests.txt): 24/24 passed (17 analytics, six label/layout, one exact historical rank-equivalence test). Cases cover reserves retained only for managers, strict active flags, active+frozen once, every identity-join dimension, manager aliases, virtual observations, hypothesis/control denominators, incomplete-XI coverage and the same date/league/completion filters across all outputs.
- The dual-duel regression explicitly has one XI, two H2H basis entries and one freeze event: rating count 1, duel denominator 2, frequency 50%. Event source identity remains separate.
- [Lint](analytics-active-scope/lint.txt): zero errors. [Baseline comparison](analytics-active-scope/lint-comparison.json): the RU-only UI has 74 existing localization warnings; the added Russian explanation produces one additional warning (75 total). No warning was suppressed.
- Addressed `git diff --check` passed. Full CI/typecheck/build and the canonical production refresh remain coordinator checks. No full build, collector, import or deployment was run here.

## Integration and resources

The Python chat owns the OR reduction of legitimate duel roles, unique raw XI observations, precomputed franchise summaries, and selecting eligible xFO examples before export limits. This TS change consumes that contract; it does not change or replace those stages. No shared canon/BOARD/WAL/version/WI was edited by this subtask.

[Resource inventory](analytics-active-scope/resources-after.json): no addressed test process remains; no server/browser was started; no dependency, persistent cache mechanism or cleanup deletion was introduced. The identity Set is local to each aggregate call and is neither returned nor stored globally. Existing shared build/cache, Python fixtures and production data remain untouched. These process observations are not a production-memory benchmark.

Internet precedents were checked before implementation: [Stack Overflow composite-key joins](https://stackoverflow.com/questions/55832412/join-arrays-of-objects-on-a-mutiple-key-in-javascript), [Reddit boolean filtering](https://www.reddit.com/r/learnpython/comments/kz9s43/). Technical membership behavior follows the primary [MDN Set reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set). Installed Next `use client` documentation was read before the minimal UI text edit.
