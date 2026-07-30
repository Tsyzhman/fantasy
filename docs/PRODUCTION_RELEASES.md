# Production release history

## Source-of-truth rules

Production has three synchronized identities:

1. a Git commit reachable from the GitHub repository;
2. an immutable directory under `/var/www/fantasy-scout-releases`;
3. a Docker image whose revision label and `/api/health` response contain that
   exact commit.

A release is valid only when all three identities match. A local working tree
is never a production source. `npm run release:verify-source` rejects dirty,
untracked, or unpushed source and verifies that the formula model and its
runtime files are tracked.

The manual GitHub workflow packages `git archive HEAD`, retains the archive as
a workflow artifact, and passes its SHA-256 to the guarded Docker promoter.
The candidate ref must contain current `main`; after the first manifested
release, it must also descend from the commit currently running in production.

Successful promotions append a tab-separated record to:

```text
/var/www/fantasy-scout-releases/PRODUCTION_HISTORY.tsv
```

Each immutable release also contains:

- `.release-version`
- `.release-commit`
- `.release-tree`
- `.release-archive-sha256`

Production tags use `production-v<version>-<UTC timestamp>`.

After the `current` symlink is atomically switched, the promoter treats the
release as committed. A later SSH/output failure preserves the active image and
release directory. A failure before that commit point restores both containers
and the prior symlink target.

## Reconciled 2026-07 production line

| Order | Commit/release | Meaning |
| --- | --- | --- |
| 1 | `54c7b9c` | Last commit shared by the old local `main` and later server work. |
| 2 | `4bf13c9` | Formula-based transfer-source support. |
| 3 | `96eb7ed` | RPL transfer recommendation improvements. |
| 4 | `0db9e57` | Foontasy synchronization relative to the active RPL round. |
| 5 | local overlay checkpoint `77f708a` | Formula models/UI, FotMob fixture protection, summer league policy, and retention safeguards that had not previously been committed. |
| 6 | consolidated 0.2.0 line | Merge of both histories plus immutable release enforcement. The production tag is the authoritative final commit. |

## 2026-07-29/30 regression

The formula columns disappeared because releases `96eb7ed` and `0db9e57` were
built from committed server branches that did not contain the uncommitted local
formula overlay. The database retained the version-2 column preference, but the
older runtime neither recognized that object nor contained the formula model.

The 0.2.x release line prevents the same failure mode in four ways:

- every formula runtime artifact and regression test is tracked;
- a release cannot be packaged from a dirty tree;
- the deployed commit is visible and machine-verifiable;
- a candidate that drops the canonical/main or current production history is
  rejected before the server swap.
