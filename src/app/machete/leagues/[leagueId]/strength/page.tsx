/** @spec spec://modules/machete/FEAT-015-league-strength#view */

import Link from "next/link";
import { notFound } from "next/navigation";

import { I18nText } from "@/components/i18n-text";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { prisma } from "@/lib/db";
import { formatScore } from "@/lib/format";
import { loadLeagueStrength } from "@/machete/league-strength-reader";
import { loadSharedLeagueSeason } from "@/machete/shared_read_model";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ season?: string | string[] }>;
};

export default async function LeagueStrengthPage({ params, searchParams }: PageProps) {
  const [{ leagueId }, { season }] = await Promise.all([params, searchParams]);
  const league = await loadSharedLeagueSeason(prisma, leagueId, typeof season === "string" ? season : undefined);
  if (!league) notFound();

  const strength = await loadLeagueStrength(prisma, league.leagueId, league.season);
  const leagueHref = `/machete/leagues/${league.leagueId}`;
  const seasonQuery = `?season=${encodeURIComponent(league.season)}`;

  return (
    <MacheteShell
      section={<I18nText en="Team strength" ru="Рейтинг силы" />}
      parent={{ href: leagueHref + seasonQuery, label: league.displayName }}
    >
      <section className="ui-card mt-4 p-4 sm:p-5">
        <p className="text-sm font-medium text-slate-500">{league.displayName} · {league.season}</p>
        <h2 id="league-strength-title" className="mt-1 text-2xl font-bold text-ink"><I18nText en="Massey team strength" ru="Рейтинг силы Massey" /></h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          <I18nText
            en="The rating compares teams in this season and accounts for their opponents and home advantage. It weights the final goal difference and xG difference equally, using the score alone where paired xG is missing. Small samples are pulled toward zero."
            ru="Рейтинг сравнивает команды в пределах сезона с учётом соперников и домашнего поля. Разница голов и разница xG имеют равный вес. Если xG одной из команд нет, учитывается только счёт. На малой выборке оценки ближе к нулю."
          />
        </p>
        {strength && strength.matches > 0 ? (
          <p className="mt-3 text-sm font-semibold text-ink">
            <I18nText
              en={`Finished matches with scores for both sides: ${strength.matches} · With paired xG: ${strength.pairedXgMatches}/${strength.matches}`}
              ru={`Матчи с итоговым счётом: ${strength.matches} · С xG обеих команд: ${strength.pairedXgMatches}/${strength.matches}`}
            />
          </p>
        ) : null}
      </section>

      {strength && strength.matches > 0 ? (
        <section className="ui-card mt-4 overflow-hidden">
          <div role="region" aria-labelledby="league-strength-title" className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[36rem] text-sm tabular-nums">
              <thead className="border-b border-slate-200 bg-field text-slate-600">
                <tr>
                  <th scope="col" className="px-3 py-3 text-right">#</th>
                  <th scope="col" className="px-3 py-3 text-left"><I18nText en="Team" ru="Команда" /></th>
                  <th scope="col" className="px-3 py-3 text-right"><I18nText en="Played" ru="Матчи" /></th>
                  <th scope="col" className="px-3 py-3 text-right">Massey</th>
                  <th scope="col" className="px-3 py-3 text-right"><I18nText en="xG diff / match" ru="Разница xG / матч" /></th>
                  <th scope="col" className="px-3 py-3 text-right"><I18nText en="Schedule strength" ru="Сложность календаря" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {strength.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-right text-slate-600">{row.ratingRank ?? "—"}</td>
                    <th scope="row" className="px-3 py-2 text-left font-semibold text-ink">
                      <Link href={`${leagueHref}/teams/${row.id}${seasonQuery}`} prefetch={false} className="hover:underline">
                        {row.name}
                      </Link>
                    </th>
                    <td className="px-3 py-2 text-right">{row.played}</td>
                    <td className="px-3 py-2 text-right font-semibold text-ink">{formatSignedScore(row.rating)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatSignedScore(row.xgDifference)}
                      <span className="ml-2 text-xs text-slate-500">
                        {row.xgRank !== null ? `#${row.xgRank} · ` : ""}{row.pairedXg}/{row.played}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatSignedScore(row.schedule)}
                      {row.scheduleRank !== null ? <span className="ml-2 text-xs text-slate-500">#{row.scheduleRank}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            <I18nText
              en="Schedule strength is the average opponent rating adjusted for venue. #1 is the hardest schedule. The fraction in the xG column shows matches with xG for both sides."
              ru="Сложность календаря — средний рейтинг соперников с поправкой на поле. №1 — самый сложный календарь. Доля в колонке xG показывает, для скольких матчей есть xG обеих команд."
            />
          </p>
        </section>
      ) : (
        <p className="ui-card mt-4 p-5 text-sm text-slate-600">
          {strength ? (
            <I18nText en="There are no finished matches with scores for this season yet." ru="В этом сезоне пока нет завершённых матчей с итоговым счётом." />
          ) : (
            <I18nText en="This season exceeds the size limit for the rating." ru="Этот сезон превышает лимит матчей или команд для расчёта рейтинга." />
          )}
        </p>
      )}
    </MacheteShell>
  );
}

function formatSignedScore(value: number | null) {
  return `${value !== null && value > 0 ? "+" : ""}${formatScore(value)}`;
}
