import { formatNumber, formatScore } from "@/lib/format";

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
  alternativeScore?: number | null;
};

export function MachetePlayerTable({ players, showContext = false }: { players: MachetePlayerRow[]; showContext?: boolean }) {
  const columnsCount = showContext ? 16 : 14;

  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Player</th>
              {showContext ? <th className="px-4 py-3">Team</th> : null}
              {showContext ? <th className="px-4 py-3">League</th> : null}
              <th className="px-4 py-3">Pos</th>
              <th className="bg-emerald-50 px-4 py-3 text-right text-emerald-700">Expected FP</th>
              <th className="px-4 py-3 text-right">Age</th>
              <th className="px-4 py-3">Nation</th>
              <th className="px-4 py-3 text-right">Apps</th>
              <th className="px-4 py-3 text-right">Min</th>
              <th className="px-4 py-3 text-right">G</th>
              <th className="px-4 py-3 text-right">A</th>
              <th className="px-4 py-3 text-right">SOT</th>
              <th className="px-4 py-3 text-right">KP</th>
              <th className="px-4 py-3 text-right">Tkl</th>
              <th className="px-4 py-3 text-right">Rating</th>
              <th className="bg-amber-50 px-4 py-3 text-right text-amber-700">Alt FP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {players.map((player) => (
              <tr key={player.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{player.name}</td>
                {showContext ? <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.teamName ?? "-"}</td> : null}
                {showContext ? <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.leagueName ?? "-"}</td> : null}
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.position ?? "-"}</td>
                <td className="whitespace-nowrap bg-emerald-50/70 px-4 py-3 text-right font-semibold text-emerald-700">
                  {formatScore(player.fantasyScore)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.age)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.nationality ?? "-"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.matchesPlayed)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.minutesPlayed)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.goals)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.assists)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.shotsOnTarget)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.keyPasses)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.tackles)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.averageRating)}</td>
                <td className="whitespace-nowrap bg-amber-50/70 px-4 py-3 text-right font-semibold text-amber-700">
                  {formatScore(player.alternativeScore ?? null)}
                </td>
              </tr>
            ))}
            {players.length === 0 ? (
              <tr>
                <td colSpan={columnsCount} className="px-4 py-10 text-center text-slate-500">
                  No Machete player snapshots yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
