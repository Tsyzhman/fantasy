import { I18nText } from "@/components/i18n-text";
import { formatDate } from "@/lib/format";

export type MacheteFixtureRow = {
  id: string;
  kickoffAt: Date | string | null;
  status: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export function MacheteFixtureTable({ fixtures }: { fixtures: MacheteFixtureRow[] }) {
  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3"><I18nText en="Date" ru="Дата" /></th>
              <th className="px-4 py-3"><I18nText en="Home" ru="Хозяева" /></th>
              <th className="px-4 py-3 text-center"><I18nText en="Score" ru="Счет" /></th>
              <th className="px-4 py-3"><I18nText en="Away" ru="Гости" /></th>
              <th className="px-4 py-3"><I18nText en="Status" ru="Статус" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fixtures.map((fixture) => (
              <tr key={fixture.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(fixture.kickoffAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{fixture.homeTeamName ?? "TBD"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-center font-semibold text-ink">
                  {fixture.homeScore ?? "-"} : {fixture.awayScore ?? "-"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{fixture.awayTeamName ?? "TBD"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fixture.status ?? "UNKNOWN"}</td>
              </tr>
            ))}
            {fixtures.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  <I18nText en="No Machete fixtures synced yet." ru="Матчи Machete еще не синхронизированы." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
