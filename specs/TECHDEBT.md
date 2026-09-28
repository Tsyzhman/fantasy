# TECHDEBT

Register of current engineering trade-offs and risks.

## Open

No open entries.

## Resolved

### TD-007: Existing production dependencies block the CI audit

- Area: dependency maintenance and the `Check` workflow.
- Related specs: `spec://common/structure#root`.
- Introduced by: before WI-039; both locked versions are identical to commit `20a84cf19f96fbd5abe6c3b67870e75ef5af5e1e`.
- Current state: resolved on 2026-09-28 by WI-040. Patched dependencies are published in `1292dd57848f81da4a8a13cc733a62c124e9e72a`; production and full audits report zero known vulnerabilities. The lockfile includes the optional runtime entries required by CI's npm 10.8.2.
- Risk: the dependency vulnerabilities and production audit blocker have been removed. WI-041 also resolved the CI test-environment failures; the full [Check run 36406463394](https://github.com/Tsyzhman/fantasy/actions/runs/36406463394) passes.
- Trigger: `npm run audit:prod`; confirmed by [Check run 36398972115](https://github.com/Tsyzhman/fantasy/actions/runs/36398972115).
- Mitigation: sharp 0.35.4, baseline-browser-mapping 2.11.26, browserslist 4.29.2, and postcss-selector-parser 6.1.4; clean install, native image checks, local application validation, and a passing GitHub production audit. See [Check run 36404329686](https://github.com/Tsyzhman/fantasy/actions/runs/36404329686) and `specs/work/evidence/WI-040/dependency-checks.json`.
- Work: [WI-040](work/archive/2026/WI-040-dependency-security.md); completed CI environment follow-up: [WI-041](work/archive/2026/WI-041-ci-database-isolation.md).

<!--
### TD-001: Short name
- Area: `module` / subsystem
- Related specs: `spec://...#...`
- Introduced by: `WI-NNN` or commit
- Current state: what is left in the implementation
- Risk: what this can lead to
- Trigger: when the risk appears
- Mitigation: how to close or reduce the risk
- Work: —
-->
