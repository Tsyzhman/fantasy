import { ArrowRight, Crosshair } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ShotMapExplorer } from "@/components/mixerr/ShotMapExplorer";
import { prisma } from "@/lib/db";
import {
  get_player_shots_for_team_window,
  get_shot_map_comparison_for_windows,
  get_team_conceded_shots_for_window,
  get_team_shots_for_window
} from "@/lib/shot-maps";
import { matchWindowLabel, matchWindowModeValue, parseMacheteMatchWindow } from "@/scoring/machete/match-window";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    attackingTeamId?: string;
    defendingTeamId?: string;
    playerId?: string;
    matchWindow?: string;
    defendingMatchWindow?: string;
  }>;
};

export default async function MixerrPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const teams = await prisma.macheteTeam.findMany({
    where: { provider: "FOTMOB" },
    include: { league: true },
    orderBy: [{ league: { name: "asc" } }, { name: "asc" }]
  });

  const attackingTeamId = resolvedSearchParams.attackingTeamId ?? teams[0]?.id ?? "";
  const defendingTeamId = resolvedSearchParams.defendingTeamId ?? teams.find((team) => team.id !== attackingTeamId)?.id ?? attackingTeamId;
  const matchWindow = parseMacheteMatchWindow({ mode: resolvedSearchParams.matchWindow });
  const defendingMatchWindow = parseMacheteMatchWindow({ mode: resolvedSearchParams.defendingMatchWindow ?? resolvedSearchParams.matchWindow });
  const players = attackingTeamId
    ? await prisma.machetePlayer.findMany({
        where: { teamId: attackingTeamId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, position: true }
      })
    : [];
  const playerId = resolvedSearchParams.playerId ?? players[0]?.id ?? "";

  const [teamShots, concededShots, playerShots, comparison] = attackingTeamId
    ? await Promise.all([
        get_team_shots_for_window(prisma, attackingTeamId, matchWindow),
        get_team_conceded_shots_for_window(prisma, attackingTeamId, matchWindow),
        playerId ? get_player_shots_for_team_window(prisma, playerId, attackingTeamId, matchWindow) : Promise.resolve([]),
        defendingTeamId
          ? get_shot_map_comparison_for_windows(prisma, attackingTeamId, defendingTeamId, matchWindow, defendingMatchWindow)
          : Promise.resolve(emptyComparison(attackingTeamId, defendingTeamId))
      ])
    : [[], [], [], emptyComparison(attackingTeamId, defendingTeamId)];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-6 border-b border-slate-200 pb-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">MiXerr / FotMob</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-ink">MiXerr shot maps</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Compare attacking shot locations, conceded shot locations and player shot maps from stored FotMob match payloads.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link className="inline-flex items-center gap-2 rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700" href="/machete/leagues">
                Machete
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href="/baltika/leagues">
                Baltika
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Crosshair className="h-9 w-9 text-slate-400" />
            </div>
          </div>
        </div>
        <div className="grid min-h-44 place-items-center rounded border border-slate-200 bg-white p-6 shadow-soft sm:min-h-56 lg:min-h-64">
          <Image
            src="/mode-logos/mixerr-mode.svg"
            alt="MiXerr logo"
            width={168}
            height={168}
            className="h-36 w-36 object-contain sm:h-40 sm:w-40"
            priority
          />
        </div>
      </section>

      <form className="mt-6 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-4 shadow-soft md:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Team A</span>
          <select name="attackingTeamId" defaultValue={attackingTeamId} className="w-full rounded border border-slate-200 px-3 py-2">
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} - {team.league.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Team B</span>
          <select name="defendingTeamId" defaultValue={defendingTeamId} className="w-full rounded border border-slate-200 px-3 py-2">
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} - {team.league.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Player</span>
          <select name="playerId" defaultValue={playerId} className="w-full rounded border border-slate-200 px-3 py-2">
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}{player.position ? ` - ${player.position}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Team A matches</span>
          <select name="matchWindow" defaultValue={matchWindowModeValue(matchWindow)} className="w-full rounded border border-slate-200 px-3 py-2">
            <MatchWindowOptions />
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Team B matches</span>
          <div className="flex gap-2">
            <select name="defendingMatchWindow" defaultValue={matchWindowModeValue(defendingMatchWindow)} className="min-w-0 flex-1 rounded border border-slate-200 px-3 py-2">
              <MatchWindowOptions />
            </select>
            <button type="submit" className="rounded bg-ink px-3 py-2 font-semibold text-white hover:bg-slate-700">
              Apply
            </button>
          </div>
        </label>
      </form>

      {teams.length === 0 ? (
        <section className="mt-6 rounded border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-soft">
          No FotMob teams are synced yet. Ask an administrator to run the shared FotMob ingestion.
        </section>
      ) : (
        <ShotMapExplorer
          teamShots={teamShots}
          concededShots={concededShots}
          playerShots={playerShots}
          overlayShots={{
            attacking: comparison.attacking_shots,
            conceded: comparison.defending_conceded_shots
          }}
          zoneSummary={comparison.summary.zones}
          windowLabel={matchWindowLabel(matchWindow)}
          defendingWindowLabel={matchWindowLabel(defendingMatchWindow)}
        />
      )}
    </main>
  );
}

function MatchWindowOptions() {
  return (
    <>
      <option value="last5">Last 5 team matches</option>
      <option value="last10">Last 10 team matches</option>
      <option value="last15">Last 15 team matches</option>
      <option value="current">Current season</option>
      <option value="previous">Previous season</option>
      <option value="all">All loaded matches</option>
    </>
  );
}

function emptyComparison(attackingTeamId: string, defendingTeamId: string) {
  return {
    attacking_team_id: attackingTeamId,
    defending_team_id: defendingTeamId,
    attacking_shots: [],
    defending_conceded_shots: [],
    summary: {
      attacking_shots_count: 0,
      attacking_xg: 0,
      attacking_goals: 0,
      conceded_shots_count: 0,
      conceded_xg: 0,
      conceded_goals: 0,
      zones: {
        attacking: { left_shots: 0, center_shots: 0, right_shots: 0, left_xg: 0, center_xg: 0, right_xg: 0 },
        conceded: { left_shots: 0, center_shots: 0, right_shots: 0, left_xg: 0, center_xg: 0, right_xg: 0 }
      }
    }
  };
}
