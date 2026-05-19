import { CalendarDays, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BaltikaCalendarPanel } from "@/components/baltika/baltika-calendar-panel";
import { I18nText } from "@/components/i18n-text";
import { MacheteSyncButton } from "@/components/machete/MacheteSyncButton";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { prisma } from "@/lib/db";
import { leagueSubtitle } from "@/lib/leagues/display";
import { leagueFlag } from "@/lib/leagues/flags";
import { getSportsRuCalendarSource } from "@/lib/providers/sports-ru-calendar";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    leagueId: string;
  }>;
};

export default async function BaltikaLeagueSchedulePage({ params }: PageProps) {
  const { leagueId } = await params;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      seasons: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      teams: {
        orderBy: { name: "asc" },
        include: {
          baltikaMatchStats: {
            select: {
              side: true,
              xg: true,
              xga: true
            }
          }
        }
      },
      baltikaFixtures: {
        orderBy: [
          { roundNumber: "asc" },
          { kickoffAt: "asc" },
          { homeTeamName: "asc" }
        ]
      }
    }
  });

  if (!league) notFound();

  const season = league.seasons[0];
  const source = getSportsRuCalendarSource(league.id);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumbs
        backHref={`/baltika/leagues/${league.id}`}
        backLabel={<I18nText en="Back to league" ru="Назад к лиге" />}
        items={[
          { label: <I18nText en="Baltika" ru="Балтика" />, href: "/baltika/leagues" },
          { label: league.name, href: `/baltika/leagues/${league.id}` },
          { label: <I18nText en="Calendar" ru="Календарь" />, href: `/baltika/leagues/${league.id}/schedule` }
        ]}
      />

      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {leagueFlag(league)} {leagueSubtitle(league, season?.name ?? "No season")}
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-ink">
            <CalendarDays className="h-8 w-8" />
            {league.name} <I18nText en="calendar" ru="календарь" />
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            <I18nText
              en="Rounds are displayed from 1 in the visible order. Future fixtures stay editable, including empty rounds and double-gameweek rounds."
              ru="Туры показаны в видимом порядке с 1. Будущие матчи можно редактировать, включая пустые туры и double-GW."
            />
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Link
            href={`/baltika/leagues/${league.id}`}
            className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <I18nText en="Teams" ru="Команды" />
          </Link>
          {source ? (
            <>
              <a
                href={source.fantasyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Sports.ru Fantasy
                <ExternalLink className="h-4 w-4" />
              </a>
              <MacheteSyncButton endpoint={`/api/baltika/leagues/${league.id}/sync-sports-schedule`} variant="secondary">
                <I18nText en="Sync Sports.ru schedule" ru="Синхронизировать календарь Sports.ru" />
              </MacheteSyncButton>
            </>
          ) : null}
        </div>
      </div>

      {season ? (
        <BaltikaCalendarPanel
          leagueId={league.id}
          seasonId={season.id}
          teams={league.teams.map((team) => {
            const home = averageTeamStats(team.baltikaMatchStats.filter((stat) => stat.side === "HOME"));
            const away = averageTeamStats(team.baltikaMatchStats.filter((stat) => stat.side === "AWAY"));
            const overall = averageTeamStats(team.baltikaMatchStats);

            return {
              id: team.id,
              name: team.name,
              homeXgPerMatch: home.xgPerMatch,
              homeXgaPerMatch: home.xgaPerMatch,
              awayXgPerMatch: away.xgPerMatch,
              awayXgaPerMatch: away.xgaPerMatch,
              overallXgPerMatch: overall.xgPerMatch,
              overallXgaPerMatch: overall.xgaPerMatch
            };
          })}
          fixtures={league.baltikaFixtures.map((fixture) => ({
            id: fixture.id,
            roundNumber: fixture.roundNumber,
            kickoffAt: fixture.kickoffAt?.toISOString() ?? null,
            status: fixture.status,
            source: fixture.source,
            homeTeamId: fixture.homeTeamId,
            awayTeamId: fixture.awayTeamId,
            homeTeamName: fixture.homeTeamName,
            awayTeamName: fixture.awayTeamName,
            homeScore: fixture.homeScore,
            awayScore: fixture.awayScore,
            homeXg: fixture.homeXg,
            awayXg: fixture.awayXg
          }))}
        />
      ) : (
        <section className="mt-8 rounded border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          <I18nText en="Create a season before managing the calendar." ru="Создайте сезон перед настройкой календаря." />
        </section>
      )}
    </main>
  );
}

function averageTeamStats(stats: Array<{ xg: number | null; xga: number | null }>) {
  const xg = stats.map((stat) => stat.xg).filter(isNumber);
  const xga = stats.map((stat) => stat.xga).filter(isNumber);
  const matches = Math.max(xg.length, xga.length);

  return {
    xgPerMatch: matches > 0 ? round(sum(xg) / matches) : 0,
    xgaPerMatch: matches > 0 ? round(sum(xga) / matches) : 0
  };
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
