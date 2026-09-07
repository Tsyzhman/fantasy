/** @spec spec://modules/betting/FEAT-001-virtual-league#opportunities */
import { Prisma } from "@prisma/client";
import { bettingLeagueIds } from "./leagues";
import { OPPORTUNITY_VERSION, type EventSort } from "./opportunities";

export function eventListQuery(league: string | null, search: string, offset: number, sort: EventSort, now: Date) {
  const pattern = `%${search}%`;
  const textFilter = search ? Prisma.sql`AND (home ILIKE ${pattern} OR away ILIKE ${pattern})` : Prisma.empty;
  return Prisma.sql`WITH candidates AS (
    SELECT id, league_id AS "leagueId", home, away, kickoff, fetched_at AS "fetchedAt", match_id AS "matchId",
      CASE WHEN model->'_opportunities'->>'version' = ${OPPORTUNITY_VERSION}
        AND fetched_at BETWEEN ${new Date(now.getTime()-300000)} AND ${now}
        AND (model->'_opportunities'->>'fetchedAt')::timestamptz = fetched_at
        AND (model->'_opportunities'->>'kickoff')::timestamptz = kickoff
      THEN model->'_opportunities' ELSE NULL END AS opportunity
    FROM betting_events WHERE NOT closed AND kickoff > ${now}
      AND league_id IN (${Prisma.join(bettingLeagueIds)})
      ${league ? Prisma.sql`AND league_id = ${BigInt(league)}` : Prisma.empty} ${textFilter}
  ) SELECT * FROM candidates
    ORDER BY ${sort === "value" ? Prisma.sql`(opportunity->>'bestEv')::double precision DESC NULLS LAST,` : Prisma.empty}
      kickoff ASC, id ASC LIMIT 30 OFFSET ${offset}`;
}
