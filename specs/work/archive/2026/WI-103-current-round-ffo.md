# WI-103: Keep Squad FFO current

- Kind: change
- Canon action: direct-edit

## Outcome

Sports.ru Squad shows the latest imported Foontasy forecast for the exact tour on screen and updates it independently of the full player-pool calculation.

## Specs

- Governing: spec://modules/machete/FEAT-001-global-ranking-strategy#ffo-current-round
- Constraint: spec://common/INFRA-006-continuous-deployment#root

## Scope

- In: Sports.ru Squad saved roster, player pool and background FFO refresh.
- Out: Foontasy collection cadence, historical samples, and the other projection models.

## Acceptance

- [x] A missing current-tour forecast is unavailable. Zero survives and older tours, phases, and source variants cannot fill the cell.
- [x] A new import is visible on the next load using the same saved player-pool snapshot, and in an open default pool via its existing status poll.
- [x] Production checks verify Sven Mijnans and a tour with no matching Foontasy import.

## Result

167 focused unit tests, two PostgreSQL contract tests on all canonical migrations, and typecheck pass. The regression test reuses the same retained rows across imports, verifies zero and the withdrawn player, rejects other source scopes, and checks that an unchanged status revision has no delta.

Production 0.3.159 serves 3e176300ec867ba42113a4f548653a1d0c154932. Before promotion, the Champions League fifth-tour table showed Mijnans at 6.46 from the fourth tour. After promotion, the same table shows an unavailable value even though the retained snapshot still contains 6.46. The Eredivisie twelfth-tour table shows 7.40 from the 15:01:20 Moscow import. The preceding eleventh-tour source value was 9.62.

Playwright served 9.62 once in the test browser's initial player-pool response, then observed the real status poll update the cell to 7.40 on the same snapshot, with no navigation or additional detail requests. The current update was 7,887 bytes of JSON. A repeat using the current revision returned 193 bytes with no forecast rows. Both ephemeral sessions were removed.

All 12 current Sports.ru snapshots contain 8,464 rows and zero duplicate players. The previous CSS asset matched byte-for-byte. Caddy and PostgreSQL retained their process identity. After verification the web process used 179 MiB of its 2 GiB cap, and the worker used 1.60 GiB of its 4 GiB cap. The Foontasy collection schedule keeps its existing RPL automatic scope. [Dry run](https://github.com/Tsyzhman/fantasy/actions/runs/42217802538) · [Production release](https://github.com/Tsyzhman/fantasy/actions/runs/42219121484)
