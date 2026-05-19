import { MacheteLeagueCard } from "@/components/machete/MacheteLeagueCard";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { I18nText } from "@/components/i18n-text";
import { prisma } from "@/lib/db";
import { compareMacheteLeagues } from "@/lib/leagues/display";

export const dynamic = "force-dynamic";

export default async function MacheteLeaguesPage() {
  const [leagues, snapshots] = await Promise.all([
    prisma.macheteLeague.findMany({
      orderBy: { name: "asc" },
      include: {
        teams: {
          include: {
            _count: {
              select: {
                players: true
              }
            }
          }
        },
        fixtures: {
          select: {
            status: true
          }
        }
      }
    }),
    prisma.machetePlayerSnapshot.groupBy({
      by: ["leagueId"],
      where: {
        leagueId: {
          not: null
        }
      },
      _avg: {
        fantasyScore: true
      }
    })
  ]);

  const expectedFantasyPointsByLeague = new Map<string, number | null>();
  for (const snapshot of snapshots) {
    if (snapshot.leagueId) expectedFantasyPointsByLeague.set(snapshot.leagueId, snapshot._avg.fantasyScore ?? null);
  }
  const sortedLeagues = [...leagues].sort(compareMacheteLeagues);

  return (
    <MacheteShell>
      <section className="mt-8 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-ink">Machete</h2>
        <p className="mt-1 text-sm text-slate-600">
          <I18nText
            en="FotMob data is refreshed automatically every day at 03:00 Moscow time. Manual ingestion controls live in the admin panel."
            ru="Данные FotMob автоматически обновляются каждый день в 03:00 МСК. Ручное управление загрузкой находится в админ-панели."
          />
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortedLeagues.map((league) => {
          const fixturesSynced = league.fixtures.filter(isMatchFixture).length;

          return (
            <MacheteLeagueCard
              key={league.id}
              league={{
                id: league.id,
                providerLeagueId: league.providerLeagueId,
                name: league.name,
                country: league.country,
                season: league.season,
                status: league.status,
                lastSyncedAt: league.lastSyncedAt,
                teamsSynced: league.teams.length,
                playersSynced: league.teams.reduce((total, team) => total + team._count.players, 0),
                fixturesSynced,
                expectedFantasyPoints: expectedFantasyPointsByLeague.get(league.id) ?? null
              }}
            />
          );
        })}
      </section>
      {leagues.length === 0 ? (
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

function isMatchFixture(fixture: { status: string | null }) {
  return fixture.status !== "SEASON_AGGREGATE";
}
