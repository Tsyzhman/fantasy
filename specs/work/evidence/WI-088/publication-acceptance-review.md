# Independent publication acceptance review — 0.3.152

Reviewer: Sol 6.1 Max chat `01a1a5ca-b107-70f2-8329-48fa8c9b07df`, 2026-11-04. Static review only: no server operations or additional test execution.

The original post-run verifier compared complete personal-history count and generation time, but did not bind the production reader to the verified file hash or check the eligible franchise population. Both gaps were corrected before executing acceptance:

- `verify-fresh-output.py` independently builds the unique eligible four-part keys: all virtual-group observations; ordinary groups only when not personal-only and active in at least one duel.
- Reader revision must equal the verified compressed snapshot SHA-256 plus the database-backed `:0` suffix.
- Reader `squads` must equal the eligible-key count; `managerSquads` must still equal the entire unique observation population.

The reviewer confirmed both corrections and found no remaining blocker in that delta. Raw history completeness against the source manifest, uniqueness, OR role projection and exact preservation of freeze events/basis were also reviewed. Actual production execution and UI checks remain separate evidence; static approval alone does not prove publication.

## Memory-event interpretation

The successful export reported `memory.events.max=1313`, with `oom=0` and `oom_kill=0`. The reviewer independently checked the [Linux 5.15 cgroup documentation](https://www.kernel.org/doc/html/v5.15/admin-guide/cgroup-v2.html): `max` records attempts to cross the hard boundary and associated reclaim; it is distinct from OOM. The prepared summary's additional `max == 0` assertion was not a WI-088 requirement and was corrected to retain the measured count and flag memory pressure. Zero OOM, successful exit, host reserve, protected-process checks, fixed 3.5 GiB cap and full publication verification remain mandatory and unchanged.

This run does not prove spare capacity inside the job container. Export working-set reduction is a follow-up; the observed sampled maximum must not be described as the exact kernel peak because this host has no `memory.peak` file.
