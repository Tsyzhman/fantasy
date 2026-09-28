# Synchronization of probable starting lineups

The team downloads probable lineups from three public sources:

- Premier League: `https://www.fantasyfootballscout.co.uk/team-news/`
- Serie A: `https://www.gazzetta.it/Calcio/prob_form/`
- Bundesliga: `https://www.ligainsider.de/`

For the Bundesliga, the main page is used as a directory of current 18 clubs.
After this, each club page of the form `/<club>/<id>/` is loaded separately.
The list of URLs is not hardcoded, so promotion and relegation of commands do not require editing
script.

By default, only checking is performed without writing to the database:

```bash
npm run starters:sync-probable
```

After viewing the report, apply the fully recognized compounds:

```bash
npm run starters:sync-probable -- --apply
```

## Production schedule

Production web container performs a secure catch-up immediately after launch, and
then repeats the synchronization every day in `14:30 UTC` (`17:30` in Moscow).
Worker container starts with `PROBABLE_LINEUP_SYNC_ENABLED=false`, so
The same loop is not duplicated between two Next processes. All three are processed
source. Restart is idempotent: matching XIs are not overwritten.
Canary containers start with scheduler disabled and cannot change
production DB.

For an emergency shutdown without deleting the manual CLI command, set production
variable `PROBABLE_LINEUP_SYNC_ENABLED=false` and recreate the web container.

The administrator can also run the EPL, Serie A or Bundesliga independently on
page `/admin/ingestion` in the “Probable starting lineups” block. Buttons
calls the protected admin-only API and uses the same singleton/lock as
scheduled run: parallel rerun returns `409`, URL and parameters
leagues from the browser are not accepted.

Limit source or explicitly select season:

```bash
npm run starters:sync-probable -- --source epl --season 2026/2027 --apply
npm run starters:sync-probable -- --source serie-a --json
npm run starters:sync-probable -- --source bundesliga --json
```

## Data protection

- The source is accepted only if there are exactly 20 commands for EPL/Serie A or
  18 teams for the Bundesliga and 11 unique players for each team. Change
  markup or incomplete response stops processing of the entire source.
- The command in the database changes only when all 11 players are uniquely matched with
  by its active FotMob roster; the first player must be the goalkeeper, and in the entire XI
  There must be exactly one goalkeeper. Unrecognized team or player is skipped
  and are displayed in the report.
- For EPL, the exact official player/team code from the already
  of the saved map FPL ↔ FotMob. Names are used only as a fallback path.
  For Gazzetta, the mapping is limited to one command and uses the name plus
  jersey number when available. For LigaInsider, the full name is restored
  from player profile URL; Hidden position alternatives are not included in the XI.
- Each command is updated in a separate transaction under the same advisory lock,
  which use manual editing and import of the actual squad.
- Restarting with the same 11 players does not write to the database and does not invalidate the cache
  calculation of squads.
- The original HTML is not saved. Each answer is limited to 2 MiB, sources and 18
  LigaInsider pages are processed sequentially. Between club requests
  pause 500 ms; There is only one page's HTML in memory.

In `LeagueSeasonTeam.metadata.probableLineup` only compact
origin of the squad used: source, time, scheme, opponent, names,
player numbers/codes and SHA-256 fingerprint.

If the club has officially confirmed the transfer, but FotMob `squad` still shows
old club, the operator can temporarily mark the new active roster line
source `official-transfer` and deactivate the old one. Night FotMob-
synchronization will not return such a player to the old club; data in confirmed
new club can be updated, but the marker is retained until manually removed after
full fix provider roster.

## Completion codes

- `0`: all selected sources have been processed, there are no omissions or errors;
- `1`: The source or transaction failed;
- `2`: Pages are correct, but one or more teams/players failed
  is uniquely associated with the active roster.

All arguments are available via:

```bash
npm run starters:sync-probable -- --help
```
