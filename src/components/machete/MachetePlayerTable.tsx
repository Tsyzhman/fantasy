import { formatNumber } from "@/lib/format";
import { PlayerCompareDraggable, PlayerComparePickButton, type ComparePlayer } from "@/components/compare/player-compare";
import { I18nText } from "@/components/i18n-text";
import { MacheteStarterCheckbox } from "@/components/machete/MacheteStarterCheckbox";
import { PlayerWatchlistButton } from "@/components/players/player-watchlist";
import { SortableTable } from "@/components/sortable-table";
import { PlayerHoverCard, type PlayerHoverCardData } from "@/components/ui/player-hover-card";
import { ScoreHeatCell, computeRanks } from "@/components/ui/score-heat-cell";
import { SparkLine } from "@/components/ui/spark-line";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import { compactTeamDisplayName } from "@/lib/teams/display";

export type MachetePlayerRow = {
  id: string;
  name: string;
  teamName?: string | null;
  teamShortName?: string | null;
  leagueName?: string | null;
  position: string | null;
  age: number | null;
  nationality: string | null;
  isStarter?: boolean | null;
  matchesPlayed: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shotsOnTarget: number;
  keyPasses: number;
  tackles: number;
  averageRating: number | null;
  fantasyScore: number | null;
  scoringScore?: number | null;
  alternativeScore?: number | null;
  recentFp?: number[] | null;
};

export function MachetePlayerTable({
  players,
  showContext = false,
  serverSortParam,
  defaultSort,
  showStarterStatus = false,
  starterControls
}: {
  players: MachetePlayerRow[];
  showContext?: boolean;
  serverSortParam?: string;
  defaultSort?: string;
  showStarterStatus?: boolean;
  starterControls?: {
    leagueId: string;
    season: string;
    teamId: string;
    canEdit?: boolean;
  };
}) {
  const hasStarterColumn = showStarterStatus || Boolean(starterControls);
  const columnsCount = (showContext ? 16 : 15) + (hasStarterColumn ? 1 : 0);
  const sortProps = { serverSortParam, defaultSort };

  const xRanks = computeRanks(players.map((p) => p.fantasyScore));
  const fpRanks = computeRanks(players.map((p) => p.scoringScore ?? null));
  const altRanks = computeRanks(players.map((p) => p.alternativeScore ?? null));

  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
      <div className="sm:hidden">
        <SortableTable {...sortProps} className="min-w-full table-fixed divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-left font-semibold uppercase text-slate-500">
            <tr>
              <th className="w-[42%] px-3 py-3" data-sort-key="playerName"><I18nText en="Player" ru="Игрок" /></th>
              <th className="w-[29%] bg-emerald-50 px-3 py-3 text-right text-emerald-700" data-sort-key="fantasyScore">xFP</th>
              <th className="w-[29%] bg-sky-50 px-3 py-3 text-right text-sky-700" data-sort-key="scoringScore">FP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((player, idx) => (
              <tr key={player.id} className="hover:bg-slate-50">
                <td className="max-w-[42vw] px-3 py-3 font-medium text-ink">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <PlayerComparePickButton player={macheteComparePlayer(player)} />
                    <PlayerWatchlistButton source="machete" player={macheteWatchlistPlayer(player)} />
                    <PlayerCompareDraggable player={macheteComparePlayer(player)} className="min-w-0 flex-1">
                      <span className="block truncate" title={player.name}>{compactPlayerDisplayName(player.name)}</span>
                    </PlayerCompareDraggable>
                  </div>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] font-normal text-slate-500">
                    {hasStarterColumn ? <StarterCell player={player} controls={starterControls} compact /> : null}
                    <span className="min-w-0 truncate" title={showContext ? player.teamName ?? undefined : undefined}>
                      {player.position ?? "—"}{showContext && player.teamName ? ` · ${machetePlayerTeamDisplayName(player)}` : ""}
                    </span>
                    <SparkLine values={player.recentFp ?? []} width={44} height={16} className="shrink-0" />
                  </span>
                </td>
                <td className="px-1 py-2 text-right">
                  <ScoreHeatCell value={player.fantasyScore} rank={xRanks[idx]} tone="emerald" />
                </td>
                <td className="px-1 py-2 text-right">
                  <ScoreHeatCell value={player.scoringScore ?? null} rank={fpRanks[idx]} tone="sky" />
                </td>
              </tr>
            ))}
            {players.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                  <I18nText en="No Machete player rows yet." ru="Пока нет строк игроков Machete." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </SortableTable>
      </div>

      <div className="hidden overflow-x-auto sm:block xl:hidden">
        <SortableTable {...sortProps} className="sticky-first-col min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3" data-sort-key="playerName"><I18nText en="Player" ru="Игрок" /></th>
              {showContext ? <th className="px-4 py-3" data-sort-key="teamName"><I18nText en="Team" ru="Команда" /></th> : null}
              <th className="px-4 py-3" data-sort-key="position"><I18nText en="Pos" ru="Поз." /></th>
              {hasStarterColumn ? <th className="px-4 py-3" data-sort-key="isStarter"><I18nText en="Start" ru="В старте" /></th> : null}
              <th className="px-4 py-3 text-right num-tabular" data-sort-key="matchesPlayed">Apps</th>
              <th className="px-4 py-3 text-right num-tabular" data-sort-key="minutesPlayed">Min</th>
              <th className="hidden px-4 py-3 text-right num-tabular lg:table-cell" data-sort-key="goals">G</th>
              <th className="hidden px-4 py-3 text-right num-tabular lg:table-cell" data-sort-key="assists">A</th>
              <th className="bg-emerald-50 px-2 py-3 text-right text-emerald-700" data-sort-key="fantasyScore">xFP</th>
              <th className="bg-sky-50 px-2 py-3 text-right text-sky-700" data-sort-key="scoringScore">FP</th>
              <th className="bg-amber-50 px-2 py-3 text-right text-amber-700" data-sort-key="alternativeScore">vFP</th>
              <th className="px-3 py-3 text-center" data-sort-disabled="true"><I18nText en="Form" ru="Форма" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((player, idx) => (
              <tr key={player.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                  <PlayerNameCell player={player} />
                </td>
                {showContext ? <TeamNameCell player={player} /> : null}
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.position ?? "—"}</td>
                {hasStarterColumn ? <td className="whitespace-nowrap px-4 py-3"><StarterCell player={player} controls={starterControls} /></td> : null}
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.matchesPlayed)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.minutesPlayed)}</td>
                <td className="hidden whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular lg:table-cell">{formatNumber(player.goals)}</td>
                <td className="hidden whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular lg:table-cell">{formatNumber(player.assists)}</td>
                <td className="px-1 py-2 text-right">
                  <ScoreHeatCell value={player.fantasyScore} rank={xRanks[idx]} tone="emerald" />
                </td>
                <td className="px-1 py-2 text-right">
                  <ScoreHeatCell value={player.scoringScore ?? null} rank={fpRanks[idx]} tone="sky" />
                </td>
                <td className="px-1 py-2 text-right">
                  <ScoreHeatCell value={player.alternativeScore ?? null} rank={altRanks[idx]} tone="amber" />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-center">
                  <SparkLine values={player.recentFp ?? []} width={64} height={20} />
                </td>
              </tr>
            ))}
            {players.length === 0 ? (
              <tr>
                <td colSpan={(showContext ? 11 : 10) + (hasStarterColumn ? 1 : 0)} className="px-4 py-10 text-center text-slate-500">
                  <I18nText en="No Machete player rows yet." ru="Пока нет строк игроков Machete." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </SortableTable>
      </div>

      <div className="hidden overflow-x-auto xl:block">
        <SortableTable {...sortProps} className="sticky-first-col min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3" data-sort-key="playerName"><I18nText en="Player" ru="Игрок" /></th>
              {showContext ? <th className="px-4 py-3" data-sort-key="teamName"><I18nText en="Team" ru="Команда" /></th> : null}
              <th className="px-4 py-3" data-sort-key="position"><I18nText en="Pos" ru="Поз." /></th>
              {hasStarterColumn ? <th className="px-4 py-3" data-sort-key="isStarter"><I18nText en="Start" ru="В старте" /></th> : null}
              <th className="bg-emerald-50 px-2 py-3 text-right text-emerald-700" data-sort-key="fantasyScore">xFP</th>
              <th className="bg-sky-50 px-2 py-3 text-right text-sky-700" data-sort-key="scoringScore">FP</th>
              <th className="bg-amber-50 px-2 py-3 text-right text-amber-700" data-sort-key="alternativeScore">vFP</th>
              <th className="px-3 py-3 text-center" data-sort-disabled="true"><I18nText en="Form" ru="Форма" /></th>
              <th className="px-4 py-3" data-sort-key="nationality"><I18nText en="Nation" ru="Страна" /></th>
              <th className="px-4 py-3 text-right num-tabular" data-sort-key="matchesPlayed">Apps</th>
              <th className="px-4 py-3 text-right num-tabular" data-sort-key="minutesPlayed">Min</th>
              <th className="px-4 py-3 text-right num-tabular" data-sort-key="goals">G</th>
              <th className="px-4 py-3 text-right num-tabular" data-sort-key="assists">A</th>
              <th className="px-4 py-3 text-right num-tabular" data-sort-key="shotsOnTarget">SOT</th>
              <th className="px-4 py-3 text-right num-tabular" data-sort-key="keyPasses">KP</th>
              <th className="px-4 py-3 text-right num-tabular" data-sort-key="tackles">Tkl</th>
              <th className="px-4 py-3 text-right num-tabular" data-sort-key="averageRating">Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((player, idx) => (
              <tr key={player.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                  <PlayerNameCell player={player} />
                </td>
                {showContext ? <TeamNameCell player={player} /> : null}
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.position ?? "—"}</td>
                {hasStarterColumn ? <td className="whitespace-nowrap px-4 py-3"><StarterCell player={player} controls={starterControls} /></td> : null}
                <td className="px-1 py-2 text-right">
                  <ScoreHeatCell value={player.fantasyScore} rank={xRanks[idx]} tone="emerald" />
                </td>
                <td className="px-1 py-2 text-right">
                  <ScoreHeatCell value={player.scoringScore ?? null} rank={fpRanks[idx]} tone="sky" />
                </td>
                <td className="px-1 py-2 text-right">
                  <ScoreHeatCell value={player.alternativeScore ?? null} rank={altRanks[idx]} tone="amber" />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-center">
                  <SparkLine values={player.recentFp ?? []} width={64} height={20} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.nationality ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.matchesPlayed)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.minutesPlayed)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.goals)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.assists)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.shotsOnTarget)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.keyPasses)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.tackles)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 num-tabular">{formatNumber(player.averageRating, 2)}</td>
              </tr>
            ))}
            {players.length === 0 ? (
              <tr>
                <td colSpan={columnsCount} className="px-4 py-10 text-center text-slate-500">
                  <I18nText en="No Machete player rows yet." ru="Пока нет строк игроков Machete." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </SortableTable>
      </div>
    </div>
  );
}

function PlayerNameCell({ player }: { player: MachetePlayerRow }) {
  const comparePlayer = macheteComparePlayer(player);
  const data: PlayerHoverCardData = {
    name: player.name,
    position: player.position,
    teamName: player.teamName,
    teamShortName: player.teamShortName,
    nationality: player.nationality,
    age: player.age,
    matchesPlayed: player.matchesPlayed,
    minutesPlayed: player.minutesPlayed,
    goals: player.goals,
    assists: player.assists,
    averageRating: player.averageRating,
    xFp: player.fantasyScore,
    actualFp: player.scoringScore ?? null,
    altFp: player.alternativeScore ?? null
  };
  return (
    <div className="flex min-w-0 items-center gap-2">
      <PlayerComparePickButton player={comparePlayer} />
      <PlayerWatchlistButton source="machete" player={macheteWatchlistPlayer(player)} />
      <PlayerCompareDraggable player={comparePlayer} className="min-w-0">
        <PlayerHoverCard
          player={data}
          trigger={
            <span className="cursor-help truncate border-b border-dashed border-slate-300" title={player.name}>
              {compactPlayerDisplayName(player.name)}
            </span>
          }
        />
      </PlayerCompareDraggable>
    </div>
  );
}

function TeamNameCell({ player }: { player: MachetePlayerRow }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 text-slate-600" title={player.teamName ?? undefined}>
      {machetePlayerTeamDisplayName(player) ?? "—"}
    </td>
  );
}

export function machetePlayerTeamDisplayName(player: Pick<MachetePlayerRow, "teamName" | "teamShortName">) {
  return compactTeamDisplayName({ name: player.teamName, shortName: player.teamShortName });
}

function macheteWatchlistPlayer(player: MachetePlayerRow) {
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    teamName: player.teamName,
    teamShortName: player.teamShortName
  };
}

function macheteComparePlayer(player: MachetePlayerRow): ComparePlayer {
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    teamName: player.teamName,
    teamShortName: player.teamShortName
  };
}

function StarterCell({
  player,
  controls,
  compact = false
}: {
  player: MachetePlayerRow;
  controls?: {
    leagueId: string;
    season: string;
    teamId: string;
    canEdit?: boolean;
  };
  compact?: boolean;
}) {
  const identity = machetePlayerRowIdentity(player.id);
  if (controls?.canEdit && identity) {
    return (
      <MacheteStarterCheckbox
        leagueId={identity.leagueId}
        season={identity.season}
        teamId={identity.teamId}
        playerId={identity.playerId}
        defaultChecked={Boolean(player.isStarter)}
        label={`В старте: ${player.name}`}
      />
    );
  }

  const className = player.isStarter
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-50 text-slate-500";

  return (
    <span className={`inline-flex items-center justify-center rounded border px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {compact ? (player.isStarter ? "XI" : "B") : <I18nText en={player.isStarter ? "Start" : "Bench"} ru={player.isStarter ? "Старт" : "Запас"} />}
    </span>
  );
}

function machetePlayerRowIdentity(rowId: string) {
  if (rowId.startsWith("combined:")) return null;
  const [leagueId, season, teamId, playerId] = rowId.split(":");
  if (!leagueId || !season || !teamId || !playerId) return null;
  return { leagueId, season, teamId, playerId };
}
