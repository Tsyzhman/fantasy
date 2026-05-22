import { formatNumber, formatScore } from "@/lib/format";
import { I18nText } from "@/components/i18n-text";
import { SortableTable } from "@/components/sortable-table";

export type MachetePlayerRow = {
  id: string;
  name: string;
  teamName?: string | null;
  leagueName?: string | null;
  position: string | null;
  age: number | null;
  nationality: string | null;
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
};

export function MachetePlayerTable({
  players,
  showContext = false,
  serverSortParam,
  defaultSort
}: {
  players: MachetePlayerRow[];
  showContext?: boolean;
  serverSortParam?: string;
  defaultSort?: string;
}) {
  const columnsCount = showContext ? 15 : 14;
  const sortProps = { serverSortParam, defaultSort };

  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
      <div className="sm:hidden">
        <SortableTable {...sortProps} className="min-w-full table-fixed divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-left font-semibold uppercase text-slate-500">
            <tr>
              <th className="w-[42%] px-3 py-3" data-sort-key="playerName"><I18nText en="Surname" ru="Фамилия" /></th>
              <th className="w-[29%] bg-emerald-50 px-3 py-3 text-right text-emerald-700" data-sort-key="fantasyScore"><I18nText en="Forecast" ru="Прогноз" /></th>
              <th className="w-[29%] bg-sky-50 px-3 py-3 text-right text-sky-700" data-sort-key="scoringScore"><I18nText en="Scoring" ru="Скоринг" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((player) => (
              <tr key={player.id} className="hover:bg-slate-50">
                <td className="max-w-[42vw] px-3 py-3 font-medium text-ink">
                  <span className="block truncate" title={player.name}>{compactPlayerName(player.name)}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-normal text-slate-500">
                    {player.position ?? "-"}{showContext && player.teamName ? ` · ${player.teamName}` : ""}
                  </span>
                </td>
                <td className="whitespace-nowrap bg-emerald-50/70 px-3 py-3 text-right font-semibold text-emerald-700">
                  {formatScore(player.fantasyScore)}
                </td>
                <td className="whitespace-nowrap bg-sky-50/70 px-3 py-3 text-right font-semibold text-sky-700">
                  {formatScore(player.scoringScore ?? null)}
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
        <SortableTable {...sortProps} className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3" data-sort-key="playerName"><I18nText en="Player" ru="Игрок" /></th>
              {showContext ? <th className="px-4 py-3" data-sort-key="teamName"><I18nText en="Team" ru="Команда" /></th> : null}
              <th className="px-4 py-3" data-sort-key="position"><I18nText en="Pos" ru="Поз." /></th>
              <th className="px-4 py-3 text-right" data-sort-key="matchesPlayed">Apps</th>
              <th className="px-4 py-3 text-right" data-sort-key="minutesPlayed">Min</th>
              <th className="hidden px-4 py-3 text-right lg:table-cell" data-sort-key="goals">G</th>
              <th className="hidden px-4 py-3 text-right lg:table-cell" data-sort-key="assists">A</th>
              <th className="bg-emerald-50 px-4 py-3 text-right text-emerald-700" data-sort-key="fantasyScore"><I18nText en="Expected FP" ru="Прогноз FP" /></th>
              <th className="bg-sky-50 px-4 py-3 text-right text-sky-700" data-sort-key="scoringScore"><I18nText en="Actual FP" ru="Реальные FP" /></th>
              <th className="bg-amber-50 px-4 py-3 text-right text-amber-700" data-sort-key="alternativeScore"><I18nText en="Alt FP" ru="Альт. FP" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((player) => (
              <tr key={player.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{player.name}</td>
                {showContext ? <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.teamName ?? "-"}</td> : null}
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.position ?? "-"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.matchesPlayed)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.minutesPlayed)}</td>
                <td className="hidden whitespace-nowrap px-4 py-3 text-right text-slate-600 lg:table-cell">{formatNumber(player.goals)}</td>
                <td className="hidden whitespace-nowrap px-4 py-3 text-right text-slate-600 lg:table-cell">{formatNumber(player.assists)}</td>
                <td className="whitespace-nowrap bg-emerald-50/70 px-4 py-3 text-right font-semibold text-emerald-700">
                  {formatScore(player.fantasyScore)}
                </td>
                <td className="whitespace-nowrap bg-sky-50/70 px-4 py-3 text-right font-semibold text-sky-700">
                  {formatScore(player.scoringScore ?? null)}
                </td>
                <td className="whitespace-nowrap bg-amber-50/70 px-4 py-3 text-right font-semibold text-amber-700">
                  {formatScore(player.alternativeScore ?? null)}
                </td>
              </tr>
            ))}
            {players.length === 0 ? (
              <tr>
                <td colSpan={showContext ? 10 : 9} className="px-4 py-10 text-center text-slate-500">
                  <I18nText en="No Machete player rows yet." ru="Пока нет строк игроков Machete." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </SortableTable>
      </div>

      <div className="hidden overflow-x-auto xl:block">
        <SortableTable {...sortProps} className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3" data-sort-key="playerName"><I18nText en="Player" ru="Игрок" /></th>
              {showContext ? <th className="px-4 py-3" data-sort-key="teamName"><I18nText en="Team" ru="Команда" /></th> : null}
              <th className="px-4 py-3" data-sort-key="position"><I18nText en="Pos" ru="Поз." /></th>
              <th className="bg-emerald-50 px-4 py-3 text-right text-emerald-700" data-sort-key="fantasyScore"><I18nText en="Expected FP" ru="Прогноз FP" /></th>
              <th className="bg-sky-50 px-4 py-3 text-right text-sky-700" data-sort-key="scoringScore"><I18nText en="Actual FP" ru="Реальные FP" /></th>
              <th className="bg-amber-50 px-4 py-3 text-right text-amber-700" data-sort-key="alternativeScore"><I18nText en="Alt FP" ru="Альт. FP" /></th>
              <th className="px-4 py-3" data-sort-key="nationality"><I18nText en="Nation" ru="Страна" /></th>
              <th className="px-4 py-3 text-right" data-sort-key="matchesPlayed">Apps</th>
              <th className="px-4 py-3 text-right" data-sort-key="minutesPlayed">Min</th>
              <th className="px-4 py-3 text-right" data-sort-key="goals">G</th>
              <th className="px-4 py-3 text-right" data-sort-key="assists">A</th>
              <th className="px-4 py-3 text-right" data-sort-key="shotsOnTarget">SOT</th>
              <th className="px-4 py-3 text-right" data-sort-key="keyPasses">KP</th>
              <th className="px-4 py-3 text-right" data-sort-key="tackles">Tkl</th>
              <th className="px-4 py-3 text-right" data-sort-key="averageRating">Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((player) => (
              <tr key={player.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{player.name}</td>
                {showContext ? <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.teamName ?? "-"}</td> : null}
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.position ?? "-"}</td>
                <td className="whitespace-nowrap bg-emerald-50/70 px-4 py-3 text-right font-semibold text-emerald-700">
                  {formatScore(player.fantasyScore)}
                </td>
                <td className="whitespace-nowrap bg-sky-50/70 px-4 py-3 text-right font-semibold text-sky-700">
                  {formatScore(player.scoringScore ?? null)}
                </td>
                <td className="whitespace-nowrap bg-amber-50/70 px-4 py-3 text-right font-semibold text-amber-700">
                  {formatScore(player.alternativeScore ?? null)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.nationality ?? "-"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.matchesPlayed)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.minutesPlayed)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.goals)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.assists)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.shotsOnTarget)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.keyPasses)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.tackles)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.averageRating)}</td>
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

function compactPlayerName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}
