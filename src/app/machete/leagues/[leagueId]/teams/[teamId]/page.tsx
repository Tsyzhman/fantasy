import { UserRole } from "@prisma/client";
import { Database, Shield } from "lucide-react";
import { notFound } from "next/navigation";

import { I18nText } from "@/components/i18n-text";
import { MacheteFixtureTable } from "@/components/machete/MacheteFixtureTable";
import { MachetePlayerTable } from "@/components/machete/MachetePlayerTable";
import { MacheteStatusBadge } from "@/components/machete/MacheteStatusBadge";
import { MacheteTeamLogo } from "@/components/machete/MacheteTeamCard";
import { SportsRuPlayerMappingPanel } from "@/components/machete/SportsRuPlayerMappingPanel";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { LocalizedOption } from "@/components/localized-option";
import { LocalizedNumberInput } from "@/components/ui/localized-number-input";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber, formatScore } from "@/lib/format";
import { matchWindowLabel, matchWindowLabelRu, matchWindowModeValue, parseMacheteMatchWindow } from "@/scoring/machete/match-window";
import {
  loadSharedLeagueSeason,
  loadSharedMachetePlayerRows,
  loadSharedMatchWindowSummary,
  loadSharedTeamFixtures,
  parseSharedBigInt,
  resolveSharedTeamLogoUrl,
  sortSharedMacheteRows
} from "@/machete/shared_read_model";
import { loadSportsRuTeamPlayerMappings, sportsRuDisplayNamesByPlayerId } from "@/machete/sports_ru_player_mapping";
import { loadSportsRuAuthoritativeRosterContext, sportsRuSeasonAliases } from "@/machete/squad_planner";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    leagueId: string;
    teamId: string;
  }>;
  searchParams?: Promise<{
    recentMatches?: string;
    matchWindow?: string;
    customMatches?: string;
    starterFilter?: string;
  }>;
};

export default async function MacheteTeamPage({ params, searchParams }: PageProps) {
  const { leagueId, teamId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const matchWindow = parseMacheteMatchWindow({
    mode: resolvedSearchParams.matchWindow,
    customMatches: resolvedSearchParams.customMatches,
    legacyRecentMatches: resolvedSearchParams.recentMatches
  });
  const starterFilter = parseStarterFilter(resolvedSearchParams.starterFilter);
  const league = await loadSharedLeagueSeason(prisma, leagueId);
  const parsedTeamId = parseSharedBigInt(teamId);
  if (!league || !parsedTeamId) notFound();

  const seasonTeam = await prisma.leagueSeasonTeam.findUnique({
    where: {
      leagueId_season_teamId: {
        leagueId: league.leagueId,
        season: league.season,
        teamId: parsedTeamId
      }
    },
    include: {
      team: true
    }
  });
  if (!seasonTeam || !seasonTeam.active) notFound();

  const teamScope = { leagueId: league.leagueId, season: league.season, teamId: parsedTeamId };
  const currentUser = await getCurrentUser();
  const teamContest = await prisma.fantasyContest.findFirst({
    where: {
      provider: "SPORTS_RU",
      leagueId: league.leagueId,
      season: { in: sportsRuSeasonAliases(league.season) }
    },
    orderBy: { lastSyncedAt: "desc" },
    select: { id: true }
  });
  const authoritativeRosterPromise = loadSportsRuAuthoritativeRosterContext(prisma, league, undefined, teamContest?.id ?? null);
  const [playerRows, fixtures, rawPayloads, windowSummary, sportsRuMappings] = await Promise.all([
    authoritativeRosterPromise.then(({ rosterOverrides }) => loadSharedMachetePlayerRows(prisma, {
      scopes: [teamScope],
      matchWindow,
      userId: currentUser?.id,
      rosterOverrides
    })),
    loadSharedTeamFixtures(prisma, league.leagueId, league.season, parsedTeamId, 8),
    prisma.rawMatchPayload.findMany({
      where: {
        match: {
          leagueId: league.leagueId,
          season: league.season,
          OR: [{ homeTeamId: parsedTeamId }, { awayTeamId: parsedTeamId }]
        }
      },
      include: {
        match: {
          include: {
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } }
          }
        }
      },
      orderBy: [{ match: { matchDate: "desc" } }, { fetchedAt: "desc" }],
      take: 8
    }),
    loadSharedMatchWindowSummary(prisma, [teamScope], matchWindow),
    loadSportsRuTeamPlayerMappings(prisma, {
      leagueId: league.leagueId,
      season: league.season,
      teamId: parsedTeamId,
      contestId: teamContest?.id ?? null
    })
  ]);
  const sportsNamesByPlayerId = sportsRuDisplayNamesByPlayerId(sportsRuMappings);
  const players = filterByStarter(sortSharedMacheteRows(playerRows, "fantasyScore"), starterFilter).map((player) => ({
    ...player,
    sportsName: sportsNamesByPlayerId.get(macheteTeamRowPlayerId(player.id) ?? "") ?? null
  }));
  const fantasyPreview = players.map((player) => player.fantasyScore).filter((score): score is number => typeof score === "number");
  const averageFantasyScore = fantasyPreview.length ? fantasyPreview.reduce((total, score) => total + score, 0) / fantasyPreview.length : null;
  const canEditRoster = Boolean(currentUser);
  const teamLogoUrl = resolveSharedTeamLogoUrl({
    providerLeagueId: league.providerLeagueId,
    teamName: seasonTeam.team.name,
    rawRef: seasonTeam.team.rawRef,
    metadata: seasonTeam.metadata
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PageBreadcrumbs
          backHref={macheteLeagueHref(league.leagueId, league.season)}
          backLabel={<I18nText en="Back to league" ru="Назад к лиге" />}
          items={[
            { label: "Machete", href: "/machete/leagues" },
            { label: <I18nText en="Leagues" ru="Лиги" />, href: "/machete/leagues" },
            { label: league.displayName, href: macheteLeagueHref(league.leagueId, league.season) },
            { label: seasonTeam.team.name, href: macheteTeamHref(league.leagueId, seasonTeam.teamId) }
          ]}
      />

      <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <MacheteTeamLogo logoUrl={teamLogoUrl} name={seasonTeam.team.name} size="lg" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {league.displayName} / {league.season} / FOTMOB
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold text-ink">{seasonTeam.team.name}</h1>
                <MacheteStatusBadge status="SYNCED" />
              </div>
              <p className="mt-2 text-sm text-slate-600">
                <I18nText en="FotMob ID" ru="ID FotMob" /> {seasonTeam.team.rawRef ?? String(seasonTeam.teamId)} /{" "}
                <I18nText en="Roster updated" ru="Состав обновлен" /> {formatDate(seasonTeam.updatedAt)}
              </p>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="flex items-center gap-2 text-xs font-medium uppercase text-slate-400">
              <Shield className="h-4 w-4" />
              <I18nText en="Shared core team" ru="Общая core-команда" />
            </dt>
            <dd className="mt-2 font-semibold text-ink">{String(seasonTeam.teamId)}</dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="text-xs font-medium uppercase text-slate-400">
              <I18nText en="Players synced" ru="Игроков синхронизировано" />
            </dt>
            <dd className="mt-2 font-semibold text-ink">{formatNumber(players.length)}</dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="text-xs font-medium uppercase text-slate-400">
              <I18nText en="Recent matches shown" ru="Показано матчей" />
            </dt>
            <dd className="mt-2 font-semibold text-ink">{formatNumber(fixtures.length)}</dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="text-xs font-medium uppercase text-slate-400">
              <I18nText en="Player-stat coverage" ru="Покрытие статистики" />
            </dt>
            <dd className="mt-2 font-semibold text-ink">
              {windowSummary ? `${formatNumber(windowSummary.matchesWithPlayerStats)}/${formatNumber(windowSummary.officialMatches)}` : "-"}
            </dd>
            <p className="mt-1 text-xs text-slate-500">
              <I18nText en="parsed / official in selected window" ru="распарсено / официально в выбранном окне" />
            </p>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="text-xs font-medium uppercase text-slate-400">
              <I18nText en="Avg fantasy score" ru="Средние фэнтези-очки" />
            </dt>
            <dd className="mt-2 font-semibold text-ink">{formatScore(averageFantasyScore)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            <I18nText en="Players" ru="Игроки" />
          </h2>
          <span className="text-sm text-slate-500">
            <I18nText en="Fantasy score preview" ru="Предпросмотр фэнтези-очков" />
          </span>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          <I18nText
            en={<>Stats and FP from {matchWindowLabel(matchWindow)}. Only shared match_player_stats rows for this team are used.</>}
            ru={<>Статистика и FP по окну «{matchWindowLabelRu(matchWindow)}». Используются только общие строки match_player_stats этой команды.</>}
          />
        </p>
        <AutoSubmitForm className="mb-3 grid w-full gap-3 sm:max-w-xl sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-600"><I18nText en="Stats window" ru="Окно статистики" /></span>
            <select name="matchWindow" defaultValue={matchWindowModeValue(matchWindow)} className="w-full rounded border border-slate-200 px-3 py-2">
              <LocalizedOption value="last5" en="Last 5 team matches" ru="Последние 5 матчей команды" />
              <LocalizedOption value="last10" en="Last 10 team matches" ru="Последние 10 матчей команды" />
              <LocalizedOption value="last15" en="Last 15 team matches" ru="Последние 15 матчей команды" />
              <LocalizedOption value="current" en="Current season" ru="Текущий сезон" />
              <LocalizedOption value="previous" en="Previous season" ru="Предыдущий сезон" />
              <LocalizedOption value="all" en="All loaded matches" ru="Все загруженные матчи" />
              <LocalizedOption value="custom" en="Custom team matches" ru="Свое число матчей команды" />
            </select>
            <LocalizedNumberInput
              name="customMatches"
              min={1}
              max={50}
              defaultValue={resolvedSearchParams.customMatches ?? ""}
              className="mt-2"
              placeholderEn="Number of matches"
              placeholderRu="Кол-во матчей"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-600"><I18nText en="Starter status" ru="Статус старта" /></span>
            <select name="starterFilter" defaultValue={starterFilter} className="w-full rounded border border-slate-200 px-3 py-2">
              <LocalizedOption value="" en="All players" ru="Все игроки" />
              <LocalizedOption value="starter" en="In starting XI" ru="В старте" />
              <LocalizedOption value="bench" en="Not in starting XI" ru="Не в старте" />
            </select>
          </label>
        </AutoSubmitForm>
        <MachetePlayerTable
          players={players}
          showStarterStatus
          starterControls={{
            leagueId: String(league.leagueId),
            season: league.season,
            teamId: String(parsedTeamId),
            canEdit: canEditRoster,
            roster: playerRows.map((player) => ({
              position: player.position,
              isStarter: player.isStarter
            }))
          }}
        />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            <I18nText en="Recent fixtures" ru="Последние матчи" />
          </h2>
          <span className="text-sm text-slate-500">
            {formatNumber(fixtures.length)} <I18nText en="shown" ru="показано" />
          </span>
        </div>
        <MacheteFixtureTable
          fixtures={fixtures.map((fixture) => ({
            id: String(fixture.id),
            kickoffAt: fixture.matchDate,
            status: fixture.status,
            homeTeamName: fixture.homeTeam?.name ?? null,
            awayTeamName: fixture.awayTeam?.name ?? null,
            homeScore: fixture.homeScore,
            awayScore: fixture.awayScore
          }))}
        />
      </section>

      {currentUser?.role === UserRole.ADMIN ? (
      <details className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <summary className="flex cursor-pointer items-center gap-2 text-lg font-semibold text-ink">
          <Database className="h-5 w-5 text-slate-500" />
          <I18nText en="Diagnostics and retained raw payload references" ru="Диагностика и сохраненные исходные данные" />
        </summary>
        <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {rawPayloads.map((payload) => (
            <div key={String(payload.matchId)} className="rounded border border-slate-200 bg-field p-3 text-sm">
              <p className="font-semibold text-ink"><I18nText en="Match" ru="Матч" /> {String(payload.matchId)}</p>
              <p className="mt-1 truncate text-slate-600">
                {[payload.match.homeTeam?.name, payload.match.awayTeam?.name].filter(Boolean).join(" - ") || <I18nText en="Fixture" ru="Матч" />}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                <I18nText en="Match date" ru="Дата матча" />: {formatDate(payload.match.matchDate ?? rawPayloadMatchDate(payload.payload))}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                <I18nText en="Fetched" ru="Загружен" />: {formatDate(payload.fetchedAt)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                <I18nText en="Match status" ru="Статус матча" />: {payload.match.status ?? (payload.match.finished ? "FINISHED" : "-")}
              </p>
              <p className={`mt-1 text-xs font-medium ${payload.isFinal ? "text-emerald-700" : "text-amber-700"}`}>
                {payload.isFinal ? (
                  <I18nText en="Detailed payload parsed" ru="Подробные данные разобраны" />
                ) : (
                  <I18nText en="Shallow payload: player stats may be missing" ru="Данные неполные: статистика игроков может отсутствовать" />
                )}
              </p>
              {rawPayloadDetailReason(payload.payload) ? (
                <p className="mt-1 text-xs text-amber-700">
                  <I18nText en="Reason" ru="Причина" />: {rawPayloadDetailReason(payload.payload)}
                </p>
              ) : null}
            </div>
          ))}
          {rawPayloads.length === 0 ? (
            <p className="text-sm text-slate-500">
              <I18nText en="No retained raw payloads for this team. Finalized matches keep normalized rows only." ru="Для этой команды нет сохраненных raw-payload: финальные матчи хранят только нормализованные строки." />
            </p>
          ) : null}
        </div>
        </div>
      </details>
      ) : null}

      {canEditRoster ? (
        <SportsRuPlayerMappingPanel
          rows={sportsRuMappings}
          roster={playerRows.flatMap((row) => {
            const playerId = macheteTeamRowPlayerId(row.id);
            return playerId ? [{ playerId, name: row.name, position: row.position }] : [];
          })}
          canEdit
          contestId={teamContest?.id ?? null}
        />
      ) : null}
    </main>
  );
}

function rawPayloadDetailReason(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const reason = (payload as { detailsUnavailableReason?: unknown }).detailsUnavailableReason;
  return typeof reason === "string" && reason.trim() ? reason : null;
}

function parseStarterFilter(value: string | undefined) {
  return value === "starter" || value === "bench" ? value : "";
}

function filterByStarter<T extends { isStarter?: boolean | null }>(rows: T[], starterFilter: ReturnType<typeof parseStarterFilter>) {
  if (starterFilter === "starter") return rows.filter((row) => row.isStarter);
  if (starterFilter === "bench") return rows.filter((row) => !row.isStarter);
  return rows;
}

function macheteTeamRowPlayerId(rowId: string) {
  if (rowId.startsWith("combined:")) return null;
  const parts = rowId.split(":");
  return parts.length === 4 ? parts[3] || null : null;
}

function macheteLeagueHref(leagueId: bigint, season: string) {
  return `/machete/leagues/${leagueId}?season=${encodeURIComponent(season)}`;
}

function macheteTeamHref(leagueId: bigint, teamId: bigint) {
  return `/machete/leagues/${leagueId}/teams/${teamId}`;
}

function rawPayloadMatchDate(payload: unknown) {
  const record = rawPayloadRecord(payload);
  const status = rawPayloadRecord(record.status);
  return firstRawPayloadDate(status.utcTime, record.kickoffAt, record.matchTimeUTC, record.matchDate, record.startDay);
}

function firstRawPayloadDate(...values: unknown[]) {
  for (const value of values) {
    const parsed = rawPayloadDateValue(value);
    if (parsed) return parsed;
  }
  return null;
}

function rawPayloadDateValue(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  if (!raw) return null;

  const directDate = new Date(raw);
  if (!Number.isNaN(directDate.getTime())) return directDate;

  const fotMobLocalDate = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!fotMobLocalDate) return null;

  const [, day, month, year, hour, minute, second = "0"] = fotMobLocalDate;
  const utcDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  return Number.isNaN(utcDate.getTime()) ? null : utcDate;
}

function rawPayloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
