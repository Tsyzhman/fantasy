# TECHDEBT

Register of current engineering trade-offs and risks.

## Open

### TD-007: Existing production dependencies block the CI audit

- Area: dependency maintenance and the `Check` workflow.
- Related specs: `spec://common/structure#root`.
- Introduced by: before WI-039; both locked versions are identical to commit `20a84cf19f96fbd5abe6c3b67870e75ef5af5e1e`.
- Current state: WI-040 updates the vulnerable dependencies; local production and full audits report zero known vulnerabilities and the application check passes. Publication and the GitHub Check workflow still need confirmation before this entry is resolved.
- Risk: known dependency security issues remain and the full CI pipeline cannot reach its tests.
- Trigger: `npm run audit:prod`; confirmed by [Check run 36398972115](https://github.com/Tsyzhman/fantasy/actions/runs/36398972115).
- Mitigation: update the affected dependencies to patched compatible releases, regenerate the lockfile, and run the production audit and full validation. Review the [baseline-browser-mapping advisory](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) and [sharp advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c).
- Work: `WI-040`; discovered during WI-039 and now scheduled for dependency remediation.

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

## Resolved
