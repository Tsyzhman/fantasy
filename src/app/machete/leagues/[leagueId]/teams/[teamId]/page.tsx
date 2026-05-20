import { Database, Shield } from "lucide-react";
import { notFound } from "next/navigation";

import { I18nText } from "@/components/i18n-text";
import { MacheteFixtureTable } from "@/components/machete/MacheteFixtureTable";
import { MachetePlayerTable } from "@/components/machete/MachetePlayerTable";
import { MacheteStatusBadge } from "@/components/machete/MacheteStatusBadge";
import { MacheteTeamLogo } from "@/components/machete/MacheteTeamCard";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber, formatScore } from "@/lib/format";
import { matchWindowLabel, matchWindowModeValue, parseMacheteMatchWindow } from "@/scoring/machete/match-window";
import {
  loadSharedLeagueSeason,
  loadSharedMachetePlayerRows,
  loadSharedTeamFixtures,
  parseSharedBigInt,
  resolveSharedTeamLogoUrl,
  sortSharedMacheteRows
} from "@/machete/shared_read_model";

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

  const [playerRows, fixtures, rawPayloads] = await Promise.all([
    loadSharedMachetePlayerRows(prisma, {
      scopes: [{ leagueId: league.leagueId, season: league.season, teamId: parsedTeamId }],
      matchWindow
    }),
    loadSharedTeamFixtures(prisma, league.leagueId, league.season, parsedTeamId, 8),
    prisma.rawMatchPayload.findMany({
      where: {
        match: {
          leagueId: league.leagueId,
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
      orderBy: { fetchedAt: "desc" },
      take: 8
    })
  ]);
  const players = sortSharedMacheteRows(playerRows, "fantasyScore");
  const fantasyPreview = players.map((player) => player.fantasyScore).filter((score): score is number => typeof score === "number");
  const averageFantasyScore = fantasyPreview.length ? fantasyPreview.reduce((total, score) => total + score, 0) / fantasyPreview.length : null;
  const teamLogoUrl = resolveSharedTeamLogoUrl({
    providerLeagueId: league.providerLeagueId,
    teamName: seasonTeam.team.name,
    rawRef: seasonTeam.team.rawRef,
    metadata: seasonTeam.metadata
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumbs
        backHref={`/machete/leagues/${league.leagueId}`}
        backLabel={<I18nText en="Back to league" ru="РќР°Р·Р°Рґ Рє Р»РёРіРµ" />}
        items={[
          { label: "Machete", href: "/machete/leagues" },
          { label: <I18nText en="Leagues" ru="Р›РёРіРё" />, href: "/machete/leagues" },
          { label: league.displayName, href: `/machete/leagues/${league.leagueId}` },
          { label: seasonTeam.team.name, href: `/machete/leagues/${league.leagueId}/teams/${seasonTeam.teamId}` }
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
              <I18nText en="Roster updated" ru="РЎРѕСЃС‚Р°РІ РѕР±РЅРѕРІР»РµРЅ" /> {formatDate(seasonTeam.updatedAt)}
              </p>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="flex items-center gap-2 text-xs font-medium uppercase text-slate-400">
              <Shield className="h-4 w-4" />
              <I18nText en="Shared core team" ru="РћР±С‰Р°СЏ core-РєРѕРјР°РЅРґР°" />
            </dt>
            <dd className="mt-2 font-semibold text-ink">{String(seasonTeam.teamId)}</dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="text-xs font-medium uppercase text-slate-400">
              <I18nText en="Players synced" ru="РРіСЂРѕРєРѕРІ СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅРѕ" />
            </dt>
            <dd className="mt-2 font-semibold text-ink">{formatNumber(players.length)}</dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="text-xs font-medium uppercase text-slate-400">
              <I18nText en="Recent matches shown" ru="РџРѕРєР°Р·Р°РЅРѕ РјР°С‚С‡РµР№" />
            </dt>
            <dd className="mt-2 font-semibold text-ink">{formatNumber(fixtures.length)}</dd>
          </div>
          <div className="rounded border border-slate-200 bg-field p-4">
            <dt className="text-xs font-medium uppercase text-slate-400">
              <I18nText en="Avg fantasy score" ru="РЎСЂРµРґРЅРёР№ fantasy score" />
            </dt>
            <dd className="mt-2 font-semibold text-ink">{formatScore(averageFantasyScore)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            <I18nText en="Players" ru="РРіСЂРѕРєРё" />
          </h2>
          <span className="text-sm text-slate-500">
            <I18nText en="Fantasy score preview" ru="РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ fantasy-РѕС‡РєРѕРІ" />
          </span>
        </div>
        <p className="mb-3 text-sm text-slate-500">Stats and FP from {matchWindowLabel(matchWindow)}. Only shared match_player_stats rows for this team are used.</p>
        <AutoSubmitForm className="mb-3 flex w-full max-w-xs items-end gap-2">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-slate-600">Stats window</span>
            <select name="matchWindow" defaultValue={matchWindowModeValue(matchWindow)} className="w-full rounded border border-slate-200 px-3 py-2">
              <option value="last5">Last 5 team matches</option>
              <option value="last10">Last 10 team matches</option>
              <option value="last15">Last 15 team matches</option>
              <option value="current">Current season</option>
              <option value="previous">Previous season</option>
              <option value="all">All loaded matches</option>
              <option value="custom">Custom team matches</option>
            </select>
            <input
              name="customMatches"
              type="number"
              min="1"
              max="50"
              defaultValue={resolvedSearchParams.customMatches ?? ""}
              className="mt-2 w-full rounded border border-slate-200 px-3 py-2"
              placeholder="Custom N"
            />
          </label>
        </AutoSubmitForm>
        <MachetePlayerTable players={players} />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            <I18nText en="Recent fixtures" ru="РџРѕСЃР»РµРґРЅРёРµ РјР°С‚С‡Рё" />
          </h2>
          <span className="text-sm text-slate-500">
            {formatNumber(fixtures.length)} <I18nText en="shown" ru="РїРѕРєР°Р·Р°РЅРѕ" />
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

      <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-ink">
            <I18nText en="Shared raw payload references" ru="РЎСЃС‹Р»РєРё РЅР° РѕР±С‰РёРµ raw payload" />
          </h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {rawPayloads.map((payload) => (
            <div key={String(payload.matchId)} className="rounded border border-slate-200 bg-field p-3 text-sm">
              <p className="font-semibold text-ink">Match {String(payload.matchId)}</p>
              <p className="mt-1 truncate text-slate-600">
                {[payload.match.homeTeam?.name, payload.match.awayTeam?.name].filter(Boolean).join(" - ") || "Fixture"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {payload.isFinal ? "final" : "not final"} / {formatDate(payload.fetchedAt)}
              </p>
            </div>
          ))}
          {rawPayloads.length === 0 ? (
            <p className="text-sm text-slate-500">
              <I18nText en="No shared raw match payloads stored for this team yet." ru="Р”Р»СЏ СЌС‚РѕР№ РєРѕРјР°РЅРґС‹ РїРѕРєР° РЅРµС‚ РѕР±С‰РёС… raw payload РјР°С‚С‡РµР№." />
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
