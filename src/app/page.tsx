import type { Prisma } from "@prisma/client";
import { ArrowRight, CalendarDays, Coins, Crosshair, Database, Eye, RadioTower, Sparkles, Star, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { I18nText } from "@/components/i18n-text";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import { compactTeamDisplayName, providerTeamShortName } from "@/lib/teams/display";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";
import { loadHomeSourceFreshness, sourceAgeStatus } from "@/server/home-freshness";

export const dynamic = "force-dynamic";

const modes = [
  {
    nameEn: "Machete",
    nameRu: "Мачете",
    href: "/machete/leagues",
    imageSrc: "/mode-logos/fotmob-mode.png",
    imageClassName: "h-16 w-16 object-contain",
    icon: RadioTower,
    kickerEn: "FotMob mode",
    kickerRu: "Режим FotMob",
    descriptionEn: "Leagues, fixtures, player stats, squads and fantasy projections.",
    descriptionRu: "Лиги, календарь, статистика игроков, составы и фэнтези-прогнозы."
  },
  {
    nameEn: "Baltika",
    nameRu: "Балтика",
    href: "/baltika/leagues",
    imageSrc: "/mode-logos/wyscout-mode.jpg",
    imageClassName: "h-16 w-16 rounded-full object-cover",
    icon: Database,
    kickerEn: "Wyscout Excel",
    kickerRu: "Wyscout Excel",
    descriptionEn: "Excel imports, published scouting tables and Baltika models.",
    descriptionRu: "Excel-импорты, опубликованные таблицы игроков и модели Балтики."
  },
  {
    nameEn: "MiXerr",
    nameRu: "MiXerr",
    href: "/mixerr",
    imageSrc: "/mode-logos/mixerr-mode.svg",
    imageClassName: "h-16 w-16 object-contain",
    frameClassName: "mode-logo-frame-mixerr",
    icon: Crosshair,
    kickerEn: "Shot maps",
    kickerRu: "Карты ударов",
    descriptionEn: "Team attack, conceded maps, player shots and xG overlays.",
    descriptionRu: "Атака команд, допущенные удары, игроки и xG-слои."
  }
];

export default async function HomePage() {
  const user = process.env.NEXT_PHASE === "phase-production-build" ? null : await getCurrentUser();
  const dashboard = user ? await loadHomeDashboard(user.id).catch(() => null) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-24 sm:px-6 lg:px-8 2xl:max-w-[1600px] 3xl:max-w-[1760px]">
      <section className="grid items-end gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="kicker">
            <I18nText en="Today" ru="Сегодня" />
          </p>
          <h1 className="mt-3 max-w-[14ch] text-[clamp(32px,5vw,56px)] font-bold leading-[1.04] tracking-[-0.04em] text-ink">
            <I18nText en="Fantasy Scout" ru="Fantasy Scout" />
          </h1>
          <p className="mt-4 max-w-[56ch] text-[clamp(16px,1.6vw,19px)] leading-6 text-slate-600">
            <I18nText
              en="Your latest squad, fresh prices, watched players and active workspaces in one place."
              ru="Последний состав, свежие цены, избранное и рабочие режимы в одном месте."
            />
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:col-span-5 lg:justify-end">
          <Link href="/machete/squad" className="ui-button ui-button-primary">
            <Users className="h-4 w-4" />
            <I18nText en="Open squad" ru="Открыть состав" />
          </Link>
          <Link href="/players" className="ui-button">
            <Sparkles className="h-4 w-4" />
            <I18nText en="Find players" ru="Искать игроков" />
          </Link>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Users className="h-5 w-5" />} labelEn="Squad players" labelRu="Игроки состава" value={dashboard?.squad ? String(dashboard.squad.playersCount) : "0"} />
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} labelEn="Next fixtures" labelRu="Ближайшие матчи" value={dashboard?.squad ? String(dashboard.squad.nextRound.fixtureCount) : "0"} />
        <MetricCard icon={<Eye className="h-5 w-5" />} labelEn="Saved views" labelRu="Сохраненные виды" value={String(dashboard?.savedViewsCount ?? 0)} />
        <MetricCard icon={<Star className="h-5 w-5" />} labelEn="Watchlist" labelRu="Избранное" value={String(dashboard?.watchlistCount ?? 0)} />
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="hero-scene p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="kicker">
                <I18nText en="Latest squad" ru="Последний состав" />
              </p>
              <h2 className="mt-2 text-2xl font-bold text-ink">{dashboard?.squad?.name ?? <I18nText en="No saved squad yet" ru="Состав еще не сохранен" />}</h2>
              {dashboard?.squad ? (
                <p className="mt-1 text-sm text-slate-600">
                  {dashboard.squad.leagueName} · {dashboard.squad.season} · <I18nText en="updated" ru="обновлено" /> {formatDate(dashboard.squad.updatedAt)}
                </p>
              ) : (
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  <I18nText
                    en="Build a Machete squad once, then this dashboard will keep the next-round context visible when you return."
                    ru="Соберите Machete-состав один раз, и здесь будет виден контекст ближайшего тура при возвращении."
                  />
                </p>
              )}
            </div>
            <Link
              href={dashboard?.squad?.href ?? "/machete/squad"}
              className="ui-button text-sm"
            >
              <I18nText en="Planner" ru="Планировщик" />
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {dashboard?.squad ? (
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="rounded border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <I18nText en="Roster state" ru="Состояние состава" />
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-500"><I18nText en="Players" ru="Игроки" /></dt>
                    <dd className="mt-1 text-lg font-bold text-ink">{dashboard.squad.playersCount}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500"><I18nText en="Starters" ru="Старт" /></dt>
                    <dd className="mt-1 text-lg font-bold text-ink">{dashboard.squad.startersCount}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500"><I18nText en="Locked" ru="Закреплено" /></dt>
                    <dd className="mt-1 text-lg font-bold text-ink">{dashboard.squad.lockedCount}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <I18nText en="Next round" ru="Ближайший тур" />
                  </p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">{dashboard.squad.nextRound.label}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {dashboard.squad.nextRound.fixtures.length > 0 ? (
                    dashboard.squad.nextRound.fixtures.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} />)
                  ) : (
                    <p className="text-sm text-slate-500">
                      <I18nText en="No upcoming fixtures found for this squad's teams." ru="Для команд состава ближайшие матчи не найдены." />
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="ui-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="kicker">
                <I18nText en="Fresh prices" ru="Свежие цены" />
              </p>
              <h2 className="mt-2 text-2xl font-bold text-ink">Sports.ru</h2>
            </div>
            <Coins className="h-6 w-6 text-brand-600" />
          </div>
          <div className="mt-4 space-y-2">
            {dashboard && dashboard.recentPrices.length > 0 ? (
              dashboard.recentPrices.map((price) => <PriceRow key={price.id} price={price} />)
            ) : (
              <p className="rounded bg-slate-50 px-3 py-4 text-sm text-slate-500">
                <I18nText en="No fantasy prices have been imported yet." ru="Фэнтези-цены пока не импортированы." />
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <div className="ui-card p-5">
          <p className="kicker">
            <I18nText en="Data freshness" ru="Свежесть данных" />
          </p>
          <div className="mt-4 space-y-2">
            {dashboard && dashboard.freshLeagues.length > 0 ? (
              dashboard.freshLeagues.map((league) => <FreshnessRow key={`${league.leagueId}:${league.season}`} league={league} />)
            ) : (
              <p className="rounded bg-slate-50 px-3 py-4 text-sm text-slate-500">
                <I18nText en="No Machete league seasons are loaded yet." ru="Сезоны Machete пока не загружены." />
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {modes.map((mode) => {
            const Icon = mode.icon;

            return (
              <Link
                key={mode.href}
                href={mode.href}
                className="group ui-card p-4 transition-[border-color,box-shadow,background-color] hover:border-slate-300 hover:bg-slate-50 hover:shadow-elev"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`mode-logo-frame mode-logo-frame-choice ${mode.frameClassName ?? ""}`}>
                    <Image src={mode.imageSrc} alt="" width={72} height={72} className={`mode-logo-image ${mode.imageClassName}`} />
                  </span>
                  <ArrowRight className="mt-2 h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-ink" />
                </div>
                <p className="kicker mt-4">
                  <Icon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                  <I18nText en={mode.kickerEn} ru={mode.kickerRu} />
                </p>
                <h2 className="mt-2 text-xl font-bold text-ink">
                  <I18nText en={mode.nameEn} ru={mode.nameRu} />
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  <I18nText en={mode.descriptionEn} ru={mode.descriptionRu} />
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}

async function loadHomeDashboard(userId: string) {
  const sportsContest = await prisma.fantasyContest.findFirst({
    where: { provider: "SPORTS_RU" },
    orderBy: { lastSyncedAt: "desc" },
    select: { id: true }
  });
  const sportsContestId = sportsContest?.id ?? "__missing_sports_contest__";
  const [latestSquad, recentPrices, freshLeagues, savedViewsCount, watchlistCount] = await Promise.all([
    prisma.userFantasySquad.findFirst({
      where: { userId, provider: "SPORTS_RU", contestId: sportsContestId },
      include: {
        league: true,
        players: {
          include: {
            player: true,
            team: true
          },
          orderBy: { slotIndex: "asc" }
        }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.fantasyPlayerPrice.findMany({
      where: { provider: "SPORTS_RU", contestId: sportsContestId },
      include: { league: true },
      orderBy: { lastSeenAt: "desc" },
      take: 5
    }),
    loadHomeSourceFreshness(prisma, userId),
    prisma.userSavedView.count({ where: { userId } }),
    prisma.userWatchlistPlayer.count({ where: { userId } })
  ]);

  const squadTeamIds = latestSquad ? uniqueBigInts(latestSquad.players.map((player) => player.teamId).filter((teamId): teamId is bigint => teamId !== null)) : [];
  const nextRound = latestSquad ? await loadNextRound(latestSquad.leagueId, latestSquad.season, squadTeamIds) : null;

  return {
    squad: latestSquad
      ? {
          name: latestSquad.name,
          leagueName: macheteLeagueDisplayName({
            id: String(latestSquad.leagueId),
            name: latestSquad.league.name,
            country: latestSquad.league.country,
            providerLeagueId: String(latestSquad.leagueId)
          }),
          season: latestSquad.season,
          href: `/machete/squad?${new URLSearchParams({ leagueId: String(latestSquad.leagueId), season: latestSquad.season, squadId: latestSquad.id }).toString()}`,
          playersCount: latestSquad.players.length,
          startersCount: latestSquad.players.filter((player) => player.isStarter).length,
          lockedCount: latestSquad.players.filter((player) => player.isLocked).length,
          updatedAt: latestSquad.updatedAt,
          nextRound: nextRound ?? emptyNextRound()
        }
      : null,
    recentPrices: recentPrices.map((price) => ({
      id: price.id,
      playerName: price.playerName,
      teamName: price.teamName,
      position: price.position,
      price: price.price,
      updatedAt: price.lastSeenAt,
      leagueName: macheteLeagueDisplayName({
        id: String(price.leagueId),
        name: price.league.name,
        country: price.league.country,
        providerLeagueId: String(price.leagueId)
      }),
      href: `/machete/players?${new URLSearchParams({ leagueId: String(price.leagueId), season: price.season }).toString()}`
    })),
    freshLeagues: freshLeagues.map((league) => ({
      leagueId: String(league.leagueId),
      season: league.season,
      isCurrent: league.isCurrent,
      sources: league.sources,
      name: macheteLeagueDisplayName({
        id: String(league.leagueId),
        name: league.name,
        country: league.country ?? null,
        providerLeagueId: String(league.leagueId)
      }),
      href: `/machete/leagues/${league.leagueId}?${new URLSearchParams({ season: league.season }).toString()}`
    })),
    savedViewsCount,
    watchlistCount
  };
}

async function loadNextRound(leagueId: bigint, season: string, teamIds: bigint[]) {
  if (teamIds.length === 0) return emptyNextRound();

  const where: Prisma.CoreMatchWhereInput = {
    leagueId,
    season,
    cancelled: false,
    finished: false,
    matchDate: { gte: startOfTodayUtc() },
    OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }]
  };
  const fixtures = await prisma.coreMatch.findMany({
    where,
    include: {
      homeTeam: true,
      awayTeam: true
    },
    orderBy: [{ matchDate: "asc" }, { id: "asc" }],
    take: 24
  });
  const firstFixture = fixtures[0];
  if (!firstFixture) return emptyNextRound();

  const roundKey = firstFixture.round ? `round:${firstFixture.round}` : `date:${dateKey(firstFixture.matchDate)}`;
  const roundFixtures = fixtures.filter((fixture) => (fixture.round ? `round:${fixture.round}` : `date:${dateKey(fixture.matchDate)}`) === roundKey);
  const fixtureTeamIds = uniqueBigInts(
    roundFixtures.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]).filter((teamId): teamId is bigint => teamId !== null)
  );
  const seasonTeams = fixtureTeamIds.length > 0
    ? await prisma.leagueSeasonTeam.findMany({
        where: { leagueId, season, teamId: { in: fixtureTeamIds } },
        select: { teamId: true, metadata: true }
      })
    : [];
  const teamShortNameById = new Map(
    seasonTeams.flatMap((team) => {
      const shortName = providerTeamShortName({ metadata: team.metadata });
      return shortName ? [[String(team.teamId), shortName] as const] : [];
    })
  );

  return {
    label: firstFixture.round ?? formatDate(firstFixture.matchDate),
    fixtureCount: roundFixtures.length,
    fixtures: roundFixtures.slice(0, 4).map((fixture) => ({
      id: String(fixture.id),
      homeTeamName: fixture.homeTeam?.name ?? "Home",
      homeTeamShortName: fixture.homeTeamId ? teamShortNameById.get(String(fixture.homeTeamId)) ?? null : null,
      awayTeamName: fixture.awayTeam?.name ?? "Away",
      awayTeamShortName: fixture.awayTeamId ? teamShortNameById.get(String(fixture.awayTeamId)) ?? null : null,
      kickoffAt: fixture.matchDate
    }))
  };
}

function MetricCard({ icon, labelEn, labelRu, value }: { icon: React.ReactNode; labelEn: string; labelRu: string; value: string }) {
  return (
    <div className="ui-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">
          <I18nText en={labelEn} ru={labelRu} />
        </p>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded bg-brand-50 text-brand-700">{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-bold text-ink">{value}</p>
    </div>
  );
}

function FixtureRow({ fixture }: { fixture: { homeTeamName: string; homeTeamShortName: string | null; awayTeamName: string; awayTeamShortName: string | null; kickoffAt: Date | null } }) {
  const homeTeam = compactTeamDisplayName({ name: fixture.homeTeamName, shortName: fixture.homeTeamShortName }) ?? fixture.homeTeamName;
  const awayTeam = compactTeamDisplayName({ name: fixture.awayTeamName, shortName: fixture.awayTeamShortName }) ?? fixture.awayTeamName;
  return (
    <div className="flex items-center justify-between gap-3 rounded bg-white px-3 py-2 text-sm">
      <span className="min-w-0 truncate font-semibold text-ink" title={`${fixture.homeTeamName} vs ${fixture.awayTeamName}`}>
        {homeTeam} <span className="text-slate-400">vs</span> {awayTeam}
      </span>
      <span className="shrink-0 text-xs text-slate-500">{formatDate(fixture.kickoffAt)}</span>
    </div>
  );
}

function PriceRow({ price }: { price: { playerName: string; teamName: string; position: string | null; price: number; updatedAt: Date; leagueName: string; href: string } }) {
  return (
    <Link href={price.href} className="flex items-center justify-between gap-3 rounded border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50">
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink" title={price.playerName}>{compactPlayerDisplayName(price.playerName)}</span>
        <span className="block truncate text-xs text-slate-500">
          {[price.position, price.teamName || price.leagueName].filter(Boolean).join(" / ")}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-bold text-ink">{formatNumber(price.price, 1)}</span>
        <span className="block text-xs text-slate-500">{formatDate(price.updatedAt)}</span>
      </span>
    </Link>
  );
}

function FreshnessRow({ league }: { league: { name: string; season: string; isCurrent: boolean; sources: Record<"prices" | "stats" | "lineups" | "forecast", Date | null>; href: string } }) {
  return (
    <Link href={league.href} className="block rounded border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50">
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink">{league.name}</span>
        <span className="block truncate text-xs text-slate-500">
          {league.season}
          {league.isCurrent ? <I18nText en=" · active" ru=" · активный" /> : <I18nText en=" · archive" ru=" · архив" />}
        </span>
      </span>
      <span className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-500">
        {([ ["prices", "Prices", "Цены", 7], ["stats", "Statistics", "Статистика", 26], ["lineups", "Lineups", "Составы", 26], ["forecast", "Forecast", "Прогноз", 6] ] as const).map(([key, en, ru, maxAge]) => {
          const date = league.sources[key], status = sourceAgeStatus(date, maxAge);
          return <span key={key} className={status === "FRESH" || !league.isCurrent ? "" : "text-amber-700"}>
            <I18nText en={en} ru={ru} />: {date ? <>{league.isCurrent && status === "STALE" ? <I18nText en="stale · " ru="устарело · " /> : null}{formatDate(date)}</> : <I18nText en="no data" ru="нет данных" />}
          </span>;
        })}
      </span>
    </Link>
  );
}

function emptyNextRound() {
  return {
    label: "—",
    fixtureCount: 0,
    fixtures: [] as Array<{ id: string; homeTeamName: string; homeTeamShortName: string | null; awayTeamName: string; awayTeamShortName: string | null; kickoffAt: Date | null }>
  };
}

function uniqueBigInts(values: bigint[]) {
  return [...new Map(values.map((value) => [value.toString(), value])).values()];
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function dateKey(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "unknown";
}
