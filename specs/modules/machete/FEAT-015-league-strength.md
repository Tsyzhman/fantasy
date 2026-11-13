---
status: active
---

# FEAT-015: League strength by Massey {#root}

## In simple words {#plain-language}

Beating a strong team can move a club higher in the rating than winning by the same margin against a weak team.

## Goal {#goal}

Compare club strength, raw xG difference and the difficulty of the matches actually played in the selected league-season.

## Governing specifications {#governing-specs}

- `spec://common/main#purpose`
- `spec://common/PROP-002-editorial-sport-design#contracts`

## Scope {#scope}

Descriptive team ratings for Machete football leagues. Player forecasts, Squad calculations and match outcome predictions have separate contracts.

## Actors and trigger {#actors}

A league visitor opens the Massey link from the league screen for the selected season.

## Scenarios {#scenarios}

The visitor compares the sorted rating, raw xG rank and schedule rank. A club with no eligible match has no rating or schedule value. At the start of a season with no scores the view explains the empty state.

## Data {#data}

### Match selection {#input}

- Use the selected Machete league and season and its active team memberships. Include finished, non-cancelled FotMob matches with both teams in scope and both final scores present.
- Count fixtures by the canonical match ID. Use normalized team xG when both sides have valid xG. Zero is a valid value.
- Read scores and xG on demand from the normalized tables. The calculation has no persistent result cache or separate ratings table.

## Contracts {#contracts}

### Model {#model}

- Fit `home rating − away rating + home advantage` by least squares. The target gives equal weight to final goal difference and xG difference when paired xG exists. With missing xG, the target is the final goal difference.
- Add `2 × sum(team rating²)` to the objective to pull small samples toward the common mean. Fit the home-advantage intercept from the same matches. Teams without a match have no rating or schedule value.
- Schedule strength is the mean of the opponent ratings across played matches, subtracting home advantage when the rated team played at home and adding it when the team played away. Higher means more difficult.
- Raw xG difference per match is computed on the paired xG sample only. The initial weights are a product choice. This rating has no published predictive accuracy claim and does not feed forecasts.

### League view {#view}

The league page links to its rating for the selected season. The rating view lists the teams in rating order and shows match count, rating, xG difference per match with coverage and rank, and played schedule strength with rank. Missing ratings and xG have explicit empty values. Display the league-level paired xG coverage and explain the model near the table.

## Errors and validation {#errors}

The reader limits work to 128 teams and 4096 matches per league-season. The screen reports an unavailable scope if either limit is exceeded. Rows with no paired xG have an empty xG value and rank.

## Implementation trace {#traceability}

The bounded reader, rating model, league strength route and direct contract tests carry `@spec` markers.

## Readiness criteria {#acceptance}

Verify unequal opponents at equal raw performance, venue adjustment, duplicate fixtures, missing and zero xG, no matches, selected season, and bounded work on early and full-season samples.

## Related contracts {#relationships}

Fantasy player projections remain governed by `spec://modules/machete/FEAT-001-global-ranking-strategy#root`. The team rating follows the least-squares family described by Kenneth Massey. [Massey Ratings Description](https://masseyratings.com/theory/ls.htm)

## Change history {#changelog}

- 2026-11-13: Renumbered FEAT-009 to FEAT-015 to make the specification ID unique.

- 2026-11-05. Introduced the league-season rating and schedule comparison in WI-094.
