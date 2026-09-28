# WI-039: English documentation and repository organization

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

A recruiter can understand the project from the default GitHub branch, browse English documentation by topic, and distinguish current contracts from historical plans.

## Specs

- Governing: `spec://common/main#purpose`
- Governing: `spec://common/structure#documentation`
- Affected: `spec://common/structure#documentation`
- Constraint: `spec://modules/machete/FEAT-001-global-ranking-strategy#root`

## Scope

- In: tracked Markdown documentation, an updated README and documentation index, document relocation with repaired references, Git ignore rules, generated-file accounting, and publication to GitHub.
- Out: application behavior, translations of the application UI, changes to provider fixtures or historical raw evidence, production deployment, and merging unrelated feature branches.

## Acceptance

- [x] The README provides an accurate English overview and links to setup, architecture, features, limitations, and the documentation index.
- [x] Tracked Markdown prose is English; command examples, identifiers, formulas, literal UI labels, and source evidence remain accurate.
- [x] Documentation is organized by topic, with historical planning and design references identified clearly.
- [x] Relative links, stable specification anchors, and references to relocated documents resolve.
- [x] Ignore rules cover local credentials, dependencies, caches, generated artifacts, test output, and local storage; intended source and templates remain trackable.
- [x] Duplicates, task-created caches, and process memory are checked during the work and at completion.
- [x] The spec-space snapshot has no new diagnostics, the diff is reviewed, and the documentation commit is present on the default GitHub branch.

## Result

English prose is available throughout 132 Markdown documents, including 90 files
that originally contained Russian. Forty-seven documents were relocated; current
guides and historical inputs have separate indexes. The project overview and
agent guide were rewritten around the existing application.

Local verification: 214 relative links resolve; all 425 original contract anchors
and 208 executable/literal code blocks are preserved. Private/generated paths are
ignored and intended source/templates remain trackable. The nine client workflow
files match between `.agents/` and `.claude/`; identical protocol copies are
intentional. No unintended duplicate Markdown documents were found.

The spec-space snapshot is `current` with no diagnostics. Release metadata is
0.3.98, satisfying the repository's version-bump check. Next.js `typegen` succeeded
and regenerated the ignored `next-env.d.ts`. Application code and raw source
evidence were preserved. Translation memory was observed at 38.1 MB; helper
processes exited and the temporary task cache is outside the repository.

Evidence: `specs/work/evidence/WI-039/documentation-checks.json`.
Published to the default GitHub branch in commit `17dc7a89f3df5073e2e658caf01287d0549796c5`. GitHub API readback confirmed that README and the documentation index match the published blobs. This completion record uses metadata version 0.3.99 to satisfy the repository rule for the follow-up commit.

Temporary translation files and generated type-check artifacts were removed.
The shared dependency junction remains available for worktree reuse and does not
duplicate the primary checkout's dependencies. No translation helpers remain running.

CI limitation: Check run 36398972115 failed at the production dependency audit
for pre-existing `baseline-browser-mapping` 2.10.30 and `sharp` 0.35.0 issues.
Both versions match the original main lockfile. The full application checks were
skipped; they are not reported as passed. The issue is recorded as TD-007.
