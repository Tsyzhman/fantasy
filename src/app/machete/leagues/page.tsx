import { MacheteLeagueCard } from "@/components/machete/MacheteLeagueCard";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { I18nText } from "@/components/i18n-text";
import { prisma } from "@/lib/db";
import { loadRosterCoverage, summarizeRosterCoverage } from "@/machete/roster-coverage";
import { loadSharedLeagueOptions } from "@/machete/shared_read_model";

export const dynamic = "force-dynamic";

export default async function MacheteLeaguesPage() {
  const sortedLeagues = await loadSharedLeagueCards();

  return (
    <MacheteShell>
      <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortedLeagues.map((league) => (
          <MacheteLeagueCard key={league.id} league={league} />
        ))}
      </section>
      {sortedLeagues.length === 0 ? (
        <div className="mt-8 rounded border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          <I18nText
            en="No Machete leagues yet. Ask an administrator to run the shared FotMob ingestion."
            ru="Лиг Machete пока нет. Попросите администратора запустить общую загрузку FotMob."
          />
        </div>
      ) : null}
    </MacheteShell>
  );
}

async function loadSharedLeagueCards() {
  const leagues = await loadSharedLeagueOptions(prisma);
  return Promise.all(
    leagues.map(async (league) => {
      const [teamsSynced, playersSynced, fixturesSynced, fantasyAggregate, coverageRows] = await Promise.all([
        prisma.leagueSeasonTeam.count({
          where: {
            leagueId: league.leagueId,
            season: league.season,
            active: true
          }
        }),
        prisma.teamPlayerSeason.count({
          where: {
            leagueId: league.leagueId,
            season: league.season,
            active: true
          }
        }),
        prisma.coreMatch.count({
          where: {
            leagueId: league.leagueId,
            season: league.season
          }
        }),
        prisma.fantasyPoint.aggregate({
          where: {
            match: {
              leagueId: league.leagueId,
              season: league.season
            }
          },
          _avg: {
            points: true
          }
        }),
        loadRosterCoverage(prisma, league.leagueId, league.season)
      ]);

      return {
        id: String(league.leagueId),
        providerLeagueId: league.providerLeagueId,
        name: league.name,
        country: league.country,
        season: league.season,
        status: teamsSynced > 0 ? "SYNCED" : "NOT_CONFIGURED",
        lastSyncedAt: league.updatedAt,
        teamsSynced,
        playersSynced,
        fixturesSynced,
        expectedFantasyPoints: fantasyAggregate._avg.points ?? null,
        rosterCoverage: summarizeRosterCoverage(coverageRows)
      };
    })
  );
}
