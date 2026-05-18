import { MacheteLeagueCard } from "@/components/machete/MacheteLeagueCard";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { MacheteSyncButton } from "@/components/machete/MacheteSyncButton";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MacheteLeaguesPage() {
  const [leagues, snapshots] = await Promise.all([
    prisma.macheteLeague.findMany({
      orderBy: { name: "asc" },
      include: {
        teams: {
          include: {
            players: true
          }
        },
        fixtures: true
      }
    }),
    prisma.machetePlayerSnapshot.findMany({
      select: {
        leagueId: true,
        fantasyScore: true
      }
    })
  ]);

  const expectedFantasyPointsByLeague = new Map<string, number | null>();
  for (const league of leagues) {
    const leagueSnapshots = snapshots.filter((snapshot) => snapshot.leagueId === league.id);
    expectedFantasyPointsByLeague.set(
      league.id,
      leagueSnapshots.length
        ? leagueSnapshots.reduce((total, snapshot) => total + (snapshot.fantasyScore ?? 0), 0) / leagueSnapshots.length
        : null
    );
  }

  return (
    <MacheteShell>
      <section className="mt-8 flex flex-col gap-3 rounded border border-slate-200 bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Full Machete refresh</h2>
          <p className="mt-1 text-sm text-slate-600">
            Runs every league one by one: teams, fixtures, then player stats.
          </p>
        </div>
        <MacheteSyncButton endpoint="/api/machete/sync-all" className="sm:items-end">
          Full sync all leagues
        </MacheteSyncButton>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {leagues.map((league) => {
          const fixturesSynced = league.fixtures.filter(isMatchFixture).length;

          return (
            <MacheteLeagueCard
              key={league.id}
              league={{
                id: league.id,
                name: league.name,
                country: league.country,
                season: league.season,
                status: league.status,
                lastSyncedAt: league.lastSyncedAt,
                teamsSynced: league.teams.length,
                playersSynced: league.teams.reduce((total, team) => total + team.players.length, 0),
                fixturesSynced,
                expectedFantasyPoints: expectedFantasyPointsByLeague.get(league.id) ?? null
              }}
            />
          );
        })}
      </section>
      {leagues.length === 0 ? (
        <div className="mt-8 rounded border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No Machete leagues yet. Run the seed script or create a FotMob-backed league through the API.
        </div>
      ) : null}
    </MacheteShell>
  );
}

function isMatchFixture(fixture: { status: string | null }) {
  return fixture.status !== "SEASON_AGGREGATE";
}
