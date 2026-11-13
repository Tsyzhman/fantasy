// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
import { Prisma } from "@prisma/client";
import { squadFivePlusHistoryQuery, squadFivePlusOddsQuery } from "../../src/machete/squad-research-five-plus-history";

const [start, end, season] = process.argv.slice(2);
if (!/^\d{4}\/\d{4}$/.test(season) || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) {
  throw new Error("Usage: tsx export-squad-five-plus-history.mts START_ISO END_ISO SEASON");
}
const teams = Prisma.sql`
  SELECT DISTINCT t.team_id AS id FROM league_season_teams t
  JOIN sports_ru_fantasy_contests c ON c.league_id=t.league_id AND c.season=t.season AND c.provider='SPORTS_RU'
  WHERE t.season=${season}
`;
const fixtures = Prisma.sql`
  SELECT DISTINCT f.match_id AS id FROM fantasy_provider_fixtures f
  JOIN sports_ru_fantasy_contests c ON c.id=f.contest_id AND c.season=${season} AND c.provider='SPORTS_RU'
  WHERE f.kickoff_at >= ${new Date(start)} AND f.kickoff_at < ${new Date(end)} AND f.match_id IS NOT NULL
`;
const escape = (value: unknown) => {
  const string = value instanceof Date ? value.toISOString() : String(value);
  return "'" + string.replaceAll("'", "''") + "'";
};
const queries = [squadFivePlusHistoryQuery(teams, new Date(start), new Date(end)), squadFivePlusOddsQuery(fixtures)];
const sql = queries.map((query) => query.strings.map((part, i) => part + (i < query.values.length ? escape(query.values[i]) : "")).join("")).join(";\n");
process.stdout.write("BEGIN READ ONLY;\nSET LOCAL TIME ZONE 'UTC';\nSET LOCAL statement_timeout='100s';\n" + sql + ";\nROLLBACK;\n");
