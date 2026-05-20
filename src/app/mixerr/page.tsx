import { ShotMapExplorer } from "@/components/mixerr/ShotMapExplorer";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { prisma } from "@/lib/db";
import {
  loadSharedLeagueOptions,
  loadSharedLeagueTeams,
  loadSharedTeamCompetitionOptions,
  loadSharedTeamPlayers,
  type SharedTeamCompetitionOption
} from "@/machete/shared_read_model";
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
    leagueId?: string;
    attackingTeamId?: string;
    defendingTeamId?: string;
    attackingCompetitionKey?: string;
    defendingCompetitionKey?: string;
    playerId?: string;
    matchWindow?: string;
    defendingMatchWindow?: string;
  }>;
};

export default async function MixerrPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const leagueOptions = await loadSharedLeagueOptions(prisma);
  const selectedLeague = leagueOptions.find((league) => String(league.leagueId) === resolvedSearchParams.leagueId) ?? leagueOptions[0] ?? null;
  const teams = selectedLeague ? await loadSharedLeagueTeams(prisma, selectedLeague.leagueId, selectedLeague.season) : [];
  const attackingTeam = teams.find((team) => String(team.id) === resolvedSearchParams.attackingTeamId) ?? teams[0] ?? null;
  const defendingTeam = teams.find((team) => String(team.id) === resolvedSearchParams.defendingTeamId) ?? teams.find((team) => team.id !== attackingTeam?.id) ?? attackingTeam;
  const attackingTeamId = attackingTeam ? String(attackingTeam.id) : "";
  const defendingTeamId = defendingTeam ? String(defendingTeam.id) : "";
  const matchWindow = parseMacheteMatchWindow({ mode: resolvedSearchParams.matchWindow });
  const defendingMatchWindow = parseMacheteMatchWindow({ mode: resolvedSearchParams.defendingMatchWindow ?? resolvedSearchParams.matchWindow });
  const attackingCompetitionOptions = attackingTeam ? await loadSharedTeamCompetitionOptions(prisma, attackingTeam.id) : [];
  const defendingCompetitionOptions = defendingTeam ? await loadSharedTeamCompetitionOptions(prisma, defendingTeam.id) : [];
  const selectedAttackingCompetition = selectedTeamCompetitionOption(resolvedSearchParams.attackingCompetitionKey, attackingCompetitionOptions);
  const selectedDefendingCompetition = selectedTeamCompetitionOption(resolvedSearchParams.defendingCompetitionKey, defendingCompetitionOptions);
  const playerScope = selectedAttackingCompetition ?? selectedLeague;
  const players = playerScope && attackingTeam ? await loadSharedTeamPlayers(prisma, playerScope.leagueId, playerScope.season, attackingTeam.id) : [];
  const player = players.find((candidate) => String(candidate.id) === resolvedSearchParams.playerId) ?? players[0] ?? null;
  const playerId = player ? String(player.id) : "";
  const attackingShotContext = selectedAttackingCompetition
    ? { leagueId: selectedAttackingCompetition.leagueId, season: selectedAttackingCompetition.season }
    : selectedLeague
      ? { leagueId: selectedLeague.leagueId, season: selectedLeague.season }
      : {};
  const defendingShotContext = selectedDefendingCompetition
    ? { leagueId: selectedDefendingCompetition.leagueId, season: selectedDefendingCompetition.season }
    : selectedLeague
      ? { leagueId: selectedLeague.leagueId, season: selectedLeague.season }
      : {};

  const [teamShots, concededShots, playerShots, comparison] = attackingTeamId
    ? await Promise.all([
        get_team_shots_for_window(prisma, attackingTeamId, matchWindow, attackingShotContext),
        get_team_conceded_shots_for_window(prisma, attackingTeamId, matchWindow, attackingShotContext),
        playerId ? get_player_shots_for_team_window(prisma, playerId, attackingTeamId, matchWindow, attackingShotContext) : Promise.resolve([]),
        defendingTeamId
          ? get_shot_map_comparison_for_windows(prisma, attackingTeamId, defendingTeamId, matchWindow, defendingMatchWindow, attackingShotContext, defendingShotContext)
          : Promise.resolve(emptyComparison(attackingTeamId, defendingTeamId))
      ])
    : [[], [], [], emptyComparison(attackingTeamId, defendingTeamId)];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">MiXerr / FotMob</p>
        <h1 className="mt-2 text-3xl font-bold text-ink">MiXerr shot maps</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Compare attacking shot locations, conceded shot locations and player shot maps from stored FotMob match payloads.
        </p>
      </section>

      <AutoSubmitForm className="mt-6 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-4 shadow-soft md:grid-cols-2 xl:grid-cols-8">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">League</span>
          <select name="leagueId" defaultValue={selectedLeague ? String(selectedLeague.leagueId) : ""} className="w-full rounded border border-slate-200 px-3 py-2">
            {leagueOptions.map((league) => (
              <option key={`${league.leagueId}:${league.season}`} value={String(league.leagueId)}>
                {league.displayName} - {league.season}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Team A</span>
          <select name="attackingTeamId" defaultValue={attackingTeamId} disabled={!selectedLeague} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            {teams.map((team) => (
              <option key={String(team.id)} value={String(team.id)}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Team A comp</span>
          <select
            name="attackingCompetitionKey"
            defaultValue={selectedAttackingCompetition?.key ?? ""}
            disabled={!attackingTeam || attackingCompetitionOptions.length === 0}
            className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100"
          >
            <option value="">Selected league</option>
            {attackingCompetitionOptions.map((competition) => (
              <option key={competition.key} value={competition.key}>
                {competition.displayName} - {competition.season} ({competition.matchesCount})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Team B</span>
          <select name="defendingTeamId" defaultValue={defendingTeamId} disabled={!selectedLeague} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            {teams.map((team) => (
              <option key={String(team.id)} value={String(team.id)}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Team B comp</span>
          <select
            name="defendingCompetitionKey"
            defaultValue={selectedDefendingCompetition?.key ?? ""}
            disabled={!defendingTeam || defendingCompetitionOptions.length === 0}
            className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100"
          >
            <option value="">Selected league</option>
            {defendingCompetitionOptions.map((competition) => (
              <option key={competition.key} value={competition.key}>
                {competition.displayName} - {competition.season} ({competition.matchesCount})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-600">Player</span>
          <select name="playerId" defaultValue={playerId} disabled={!attackingTeam} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            {players.map((player) => (
              <option key={String(player.id)} value={String(player.id)}>
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
          <select name="defendingMatchWindow" defaultValue={matchWindowModeValue(defendingMatchWindow)} className="w-full rounded border border-slate-200 px-3 py-2">
            <MatchWindowOptions />
          </select>
        </label>
      </AutoSubmitForm>

      {leagueOptions.length === 0 || teams.length === 0 ? (
        <section className="mt-6 rounded border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-soft">
          No shared FotMob league rosters are synced yet. Run the safe DB update, then let the 03:00 incremental ingestion populate league seasons, teams and players.
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

function selectedTeamCompetitionOption(value: string | undefined, options: SharedTeamCompetitionOption[]) {
  if (!value) return null;
  return options.find((option) => option.key === value) ?? null;
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
