import { MacheteLeagueCard } from "@/components/machete/MacheteLeagueCard";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { MacheteSyncButton } from "@/components/machete/MacheteSyncButton";
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
      <section className="mt-8 flex flex-col gap-3 rounded border border-slate-200 bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            <I18nText en="Full Machete refresh" ru="Полное обновление Machete" />
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            <I18nText
              en="Runs every league one by one: teams, fixtures, then player stats."
              ru="Запускает все лиги по очереди: команды, календарь, затем статистику игроков."
            />
          </p>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <MacheteSyncButton
            endpoint="/api/machete/sync-all"
            className="sm:items-end"
            runningMessage={<I18nText en="Updating all Machete leagues..." ru="Обновляю все лиги Machete..." />}
          >
            <I18nText en="Sync all leagues" ru="Синхронизировать все лиги" />
          </MacheteSyncButton>
          <p className="max-w-64 text-xs text-slate-500 sm:text-right">
            <I18nText
              en="This also refreshes automatically every day at 03:00 Moscow time."
              ru={"\u0412\u0441\u0435 \u0442\u0430\u043a\u0436\u0435 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u043e\u0431\u043d\u043e\u0432\u043b\u044f\u0435\u0442\u0441\u044f \u043a\u0430\u0436\u0434\u044b\u0439 \u0434\u0435\u043d\u044c \u0432 03:00 \u041c\u0421\u041a."}
            />
          </p>
        </div>
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
            en="No Machete leagues yet. Run the seed script or create a FotMob-backed league through the API."
            ru="Лиг Machete пока нет. Запустите seed-скрипт или создайте лигу FotMob через API."
          />
        </div>
      ) : null}
    </MacheteShell>
  );
}

function isMatchFixture(fixture: { status: string | null }) {
  return fixture.status !== "SEASON_AGGREGATE";
}
