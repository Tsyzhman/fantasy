---
status: active
---

# FEAT-001: MiXerr passing networks {#root}

## In simple words {#plain-language}

See who passed to whom while each team's starting XI was on the field.

## Goal {#goal}

Compare passing connections for both teams in a completed match with an independent cutoff for each lineup.

## Governing specifications {#governing-specs}

- `spec://common/main#purpose`
- `spec://common/PROP-002-editorial-sport-design#contracts`

## Scope {#scope}

Local processing of a single match event file. Automatic collection of event feeds is a separate capability.

## Actors and trigger {#actors}

A MiXerr visitor opens Passing Networks and selects a match event file in the browser.

## Scenarios {#scenarios}

The view renders the two team networks from one file. Choosing another file replaces the displayed networks. A team with no observed positions in the interval has a visible empty state.

## Data {#data}

### Event file {#input}

Use one StatsBomb `data/events/<match_id>.json` file for a completed match with two starting XIs. The browser retains only the two derived graphs in page state. The current FotMob collector provides incidents and aggregate passing statistics. Per-pass data comes from the selected file.

## Contracts {#contracts}

### Cutoff and aggregation {#aggregation}

- The first substitution for each team or the first red card or second yellow shown to one of its starters, whichever comes first, ends that team's interval. The other team's cutoff is independent. With no change, use the end of played time. Order by provider event index across halves and stoppage time, and exclude the cutoff event and later events for that team. The shootout is outside played time.
- Use successful passes between distinct players in that team's starting XI. Require the sender, recipient and both coordinates. Use the provider's attack-oriented coordinate system. A player's position is the mean of their observed pass origins and reception endpoints within the interval.
- Aggregate each directed pair once, count its passes and use one width scale across the two maps. Display arrows with at least three passes, the shirt numbers and player names, the cutoff clock, the reason and the number of completed passes used.

### View {#view}

The existing MiXerr screen links to the passing network view. Show the maps side by side at wider widths and stacked on mobile.

## Errors and validation {#errors}

The browser accepts at most 5 MiB and 12,000 event rows. Malformed input, duplicate IDs or indexes, and incomplete matches have visible errors.

## Implementation trace {#traceability}

The event parser, graph, MiXerr route and direct contract tests carry `@spec` markers.

## Readiness criteria {#acceptance}

Verify actual event files, different cutoffs, same-minute event ordering, dismissal, no changes, duplicate input and the existing theme styles.

## Related contracts {#relationships}

The data format is defined by Hudl StatsBomb. [StatsBomb Open Data](https://github.com/statsbomb/open-data)

## Change history {#changelog}

- 2026-11-05. Introduced the StatsBomb-file passing network in WI-095.
