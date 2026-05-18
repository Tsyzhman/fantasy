# Codex Follow-up Prompt

Continue building Fantasy Scout from the existing MVP.

Focus on improving the Excel-first admin workflow:

1. Add detailed team import history page at `/admin/leagues/[leagueId]/teams/[teamId]`.
2. Show source files, import statuses, errors/warnings, rows count, columns count, and player preview.
3. Add a bulk upload modal to `/admin/leagues/[leagueId]` where admin can drop many Wyscout `.xlsx` files.
4. Match files to teams using `Team` column first, then filename fallback, then aliases.
5. Add admin controls to publish/unpublish imports.
6. Improve `/players` filters with min minutes, age, position group, team, fantasy score, value score.
7. Add CSV export for filtered players.

Keep the app Excel-first. Do not add API-Football or Wyscout API integrations yet.
