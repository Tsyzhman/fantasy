import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { StarterCheckbox } from "@/components/players/starter-checkbox";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDate, formatNumber, formatScore } from "@/lib/format";
import { leagueFlag } from "@/lib/leagues/flags";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    leagueId: string;
    teamId: string;
  }>;
};

export default async function BaltikaTeamPage({ params }: PageProps) {
  const { leagueId, teamId } = await params;
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      league: true,
      imports: {
        where: {
          status: "PUBLISHED",
          isCurrentPublished: true
        },
        orderBy: { publishedAt: "desc" },
        take: 1,
        include: {
          season: true,
          snapshots: {
            orderBy: [
              { isStarter: "desc" },
              { positionGroup: "asc" },
              { fantasyScore: { sort: "desc", nulls: "last" } },
              { playerName: "asc" }
            ]
          }
        }
      },
      baltikaMatchStats: {
        include: {
          fixture: true,
          opponentTeam: true
        }
      }
    }
  });

  if (!team || team.leagueId !== leagueId) notFound();

  const currentImport = team.imports[0];
  const players = currentImport?.snapshots ?? [];
  const startersCount = players.filter((player) => player.isStarter).length;
  const matchStats = [...team.baltikaMatchStats].sort((left, right) => {
    const leftDate = left.fixture.kickoffAt?.getTime() ?? 0;
    const rightDate = right.fixture.kickoffAt?.getTime() ?? 0;
    return rightDate - leftDate;
  });
  const homeForm = matchStats.filter((stat) => stat.side === "HOME");
  const awayForm = matchStats.filter((stat) => stat.side === "AWAY");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumbs
        backHref={`/baltika/leagues/${team.leagueId}`}
        backLabel={<I18nText en="Back to league" ru="Назад к лиге" />}
        items={[
          { label: <I18nText en="Baltika" ru="Балтика" />, href: "/baltika/leagues" },
          { label: team.league.name, href: `/baltika/leagues/${team.leagueId}` },
          { label: team.name, href: `/baltika/leagues/${team.leagueId}/teams/${team.id}` }
        ]}
      />

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {leagueFlag(team.league)} {team.league.name}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-ink">{team.name}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {currentImport ? (
              <I18nText
                en={`${players.length} players - ${startersCount} marked as starters - ${currentImport.season.name}`}
                ru={`${players.length} игроков - стартовых: ${startersCount} - ${currentImport.season.name}`}
              />
            ) : (
              <I18nText en="Publish a team import before marking starters." ru="Опубликуйте импорт команды, чтобы отмечать стартовых." />
            )}
          </p>
        </div>
        <Link href="/baltika/players?starterOnly=1" className="rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          <I18nText en="View starters" ru="Смотреть стартовых" />
        </Link>
      </div>

      <section className="mt-8 overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
        <div className="sm:hidden">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-left font-semibold uppercase text-slate-500">
              <tr>
                <th className="w-[42%] px-3 py-3"><I18nText en="Surname" ru="Фамилия" /></th>
                <th className="w-[29%] bg-emerald-50 px-3 py-3 text-right text-emerald-700"><I18nText en="Forecast" ru="Прогноз" /></th>
                <th className="w-[29%] bg-sky-50 px-3 py-3 text-right text-sky-700"><I18nText en="Scoring" ru="Скоринг" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="max-w-[42vw] px-3 py-3 font-medium text-ink">
                    <div className="flex items-center gap-2">
                      <StarterCheckbox snapshotId={player.id} defaultChecked={player.isStarter} label={`Starter: ${player.playerName}`} />
                      <span className="block truncate" title={player.playerName}>{compactPlayerName(player.playerName)}</span>
                    </div>
                    <span className="mt-0.5 block truncate pl-6 text-[11px] font-normal text-slate-500">{player.positionGroup ?? "-"} · {formatNumber(player.minutesPlayed)} min</span>
                  </td>
                  <td className="whitespace-nowrap bg-emerald-50/70 px-3 py-3 text-right font-semibold text-emerald-700">
                    {formatScore(player.fantasyScore)}
                  </td>
                  <td className="whitespace-nowrap bg-sky-50/70 px-3 py-3 text-right font-semibold text-sky-700">
                    {formatScore(player.scoringScore)}
                  </td>
                </tr>
              ))}
              {players.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                    <I18nText en="No published player snapshots for this team yet." ru="Для этой команды пока нет опубликованных игроков." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="hidden overflow-x-auto sm:block xl:hidden">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-center"><I18nText en="Starter" ru="Старт" /></th>
                <th className="px-4 py-3"><I18nText en="Player" ru="Игрок" /></th>
                <th className="px-4 py-3"><I18nText en="Pos" ru="Поз." /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Minutes" ru="Минуты" /></th>
                <th className="hidden px-4 py-3 text-right lg:table-cell"><I18nText en="Goals" ru="Голы" /></th>
                <th className="hidden px-4 py-3 text-right lg:table-cell"><I18nText en="Assists" ru="Ассисты" /></th>
                <th className="bg-emerald-50 px-4 py-3 text-right text-emerald-700"><I18nText en="Predicted FP" ru="Прогноз FP" /></th>
                <th className="bg-sky-50 px-4 py-3 text-right text-sky-700"><I18nText en="Actual FP" ru="Реальные FP" /></th>
                <th className="bg-amber-50 px-4 py-3 text-right text-amber-700"><I18nText en="Alt FP" ru="Альт. FP" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <StarterCheckbox snapshotId={player.id} defaultChecked={player.isStarter} label={`Starter: ${player.playerName}`} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{player.playerName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.positionGroup ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.minutesPlayed)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right text-slate-600 lg:table-cell">{formatScore(player.goals)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right text-slate-600 lg:table-cell">{formatScore(player.assists)}</td>
                  <td className="whitespace-nowrap bg-emerald-50/70 px-4 py-3 text-right font-semibold text-emerald-700">
                    {formatScore(player.fantasyScore)}
                  </td>
                  <td className="whitespace-nowrap bg-sky-50/70 px-4 py-3 text-right font-semibold text-sky-700">
                    {formatScore(player.scoringScore)}
                  </td>
                  <td className="whitespace-nowrap bg-amber-50/70 px-4 py-3 text-right font-semibold text-amber-700">
                    {formatScore(player.alternativeScore)}
                  </td>
                </tr>
              ))}
              {players.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    <I18nText en="No published player snapshots for this team yet." ru="Для этой команды пока нет опубликованных игроков." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="hidden overflow-x-auto xl:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-center"><I18nText en="Starter" ru="Старт" /></th>
                <th className="px-4 py-3"><I18nText en="Player" ru="Игрок" /></th>
                <th className="px-4 py-3"><I18nText en="Pos" ru="Поз." /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Age" ru="Возраст" /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Minutes" ru="Минуты" /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Goals" ru="Голы" /></th>
                <th className="px-4 py-3 text-right">xG</th>
                <th className="px-4 py-3 text-right"><I18nText en="Assists" ru="Ассисты" /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Market" ru="Стоимость" /></th>
                <th className="bg-emerald-50 px-4 py-3 text-right text-emerald-700"><I18nText en="Predicted FP" ru="Прогноз FP" /></th>
                <th className="bg-sky-50 px-4 py-3 text-right text-sky-700"><I18nText en="Actual FP" ru="Реальные FP" /></th>
                <th className="bg-amber-50 px-4 py-3 text-right text-amber-700"><I18nText en="Alt FP" ru="Альт. FP" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <StarterCheckbox snapshotId={player.id} defaultChecked={player.isStarter} label={`Starter: ${player.playerName}`} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{player.playerName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{player.positionGroup ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.age)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatNumber(player.minutesPlayed)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.goals)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.xg)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatScore(player.assists)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatCurrency(player.marketValue)}</td>
                  <td className="whitespace-nowrap bg-emerald-50/70 px-4 py-3 text-right font-semibold text-emerald-700">
                    {formatScore(player.fantasyScore)}
                  </td>
                  <td className="whitespace-nowrap bg-sky-50/70 px-4 py-3 text-right font-semibold text-sky-700">
                    {formatScore(player.scoringScore)}
                  </td>
                  <td className="whitespace-nowrap bg-amber-50/70 px-4 py-3 text-right font-semibold text-amber-700">
                    {formatScore(player.alternativeScore)}
                  </td>
                </tr>
              ))}
              {players.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-slate-500">
                    <I18nText en="No published player snapshots for this team yet." ru="Для этой команды пока нет опубликованных игроков." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TeamFormTable title={<I18nText en="Home form" ru="Домашняя форма" />} stats={homeForm} />
        <TeamFormTable title={<I18nText en="Away form" ru="Гостевая форма" />} stats={awayForm} />
      </section>
    </main>
  );
}

type TeamFormRow = {
  id: string;
  side: string;
  goals: number | null;
  xg: number | null;
  xga: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  fixture: {
    kickoffAt: Date | null;
    roundNumber: number | null;
    homeTeamName: string;
    awayTeamName: string | null;
    homeScore: number | null;
    awayScore: number | null;
  };
  opponentTeam: {
    name: string;
  } | null;
};

function TeamFormTable({ title, stats }: { title: ReactNode; stats: TeamFormRow[] }) {
  const avgXg = average(stats.map((stat) => stat.xg));
  const avgXga = average(stats.map((stat) => stat.xga));

  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">
            xG {formatScore(avgXg)} / xGA {formatScore(avgXga)}
          </p>
        </div>
        <span className="text-sm font-semibold text-slate-500">
          {formatNumber(stats.length)} <I18nText en="matches" ru="матчей" />
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3"><I18nText en="Date" ru="Дата" /></th>
              <th className="px-4 py-3"><I18nText en="Round" ru="Тур" /></th>
              <th className="px-4 py-3"><I18nText en="Opponent" ru="Соперник" /></th>
              <th className="px-4 py-3 text-right"><I18nText en="Score" ru="Счет" /></th>
              <th className="px-4 py-3 text-right">xG</th>
              <th className="px-4 py-3 text-right">xGA</th>
              <th className="px-4 py-3 text-right"><I18nText en="Shots" ru="Удары" /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stats.map((stat) => (
              <tr key={stat.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(stat.fixture.kickoffAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{stat.fixture.roundNumber ?? "-"}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{stat.opponentTeam?.name ?? opponentName(stat)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{scoreLabel(stat)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-700">{formatScore(stat.xg)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-rose-700">{formatScore(stat.xga)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
                  {formatNumber(stat.shots)} / {formatNumber(stat.shotsOnTarget)}
                </td>
              </tr>
            ))}
            {stats.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  <I18nText en="No Team Stats matches loaded yet." ru="Матчи Team Stats еще не загружены." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function average(values: Array<number | null>) {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function opponentName(stat: TeamFormRow) {
  return stat.side === "HOME" ? stat.fixture.awayTeamName ?? "TBD" : stat.fixture.homeTeamName;
}

function scoreLabel(stat: TeamFormRow) {
  const home = stat.fixture.homeScore;
  const away = stat.fixture.awayScore;
  if (home === null || away === null) return "-";
  return stat.side === "HOME" ? `${home}:${away}` : `${away}:${home}`;
}

function compactPlayerName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}
