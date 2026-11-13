# WI-095 — Passing networks for the starting lineups

- Kind: `change`
- Canon action: `new-spec`

## Outcome

MiXerr builds two directed passing networks for a completed match from a StatsBomb event file, using the starting lineup interval for each team.

## Specs

- Governing: `spec://modules/mixerr/FEAT-014-passing-networks#root`
- Constraint: `spec://common/PROP-002-editorial-sport-design#contracts`
- Affected: `spec://modules/mixerr/FEAT-014-passing-networks#root`

## Scope

- In: browser-local event import, individual cutoffs, graph and player labels.
- Out: automated ingestion from a new event provider, provider subscriptions and production rollout.

## Acceptance

- [x] Verify precise separate substitution and dismissal cutoffs, stoppage time and a team with no lineup change.
- [x] Verify real event data, malformed inputs, duplicate events and mobile graph rendering.
- [x] Verify bounded input and retention of only the derived networks.

## Result

MiXerr builds the two passing networks in the browser from a single StatsBomb event JSON. It cuts each side at the first change to the starting XI from a substitution or dismissal. Event index preserves ordering through stoppage time and same-second incidents.

The browser opened the view through MiXerr and processed 3762 unique events in Barcelona vs Deportivo Alavés. Barcelona's cutoff was 45:00 with 393 counted passes, and Alavés's cutoff was 67:48 with 115. Both maps had 11 players and showed 46 and 14 directed links at the three-pass threshold. The two maps appeared side by side at 1280 px and stacked at 360 px. The light and dark palettes, Russian labels, invalid-file error and zero file upload requests were checked. [StatsBomb sample](https://github.com/statsbomb/open-data/blob/master/data/events/15946.json)

Direct tests cover dismissal, same-second order, stoppage time, incomplete games, duplicate keys and the input limit. Type checking and the production build passed. Fifty local parses of the real sample averaged 13.97 ms including JSON decoding. The combined replay retained 13.23 MiB of JS heap after GC, from 13.09 MiB after warm-up. Current-match automation needs a per-pass source with sender, recipient, time and positions.
