import { UserRole } from "@prisma/client";
import { ChevronDown, Download, Wrench } from "lucide-react";
import Link from "next/link";

import { FantasyPriceSheetImportForm } from "@/components/machete/FantasyPriceSheetImportForm";
import { FantasySquadPlanner } from "@/components/machete/FantasySquadPlanner";
import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isFantasySquadLeague } from "@/lib/leagues/display";
import { loadSharedLeagueOptions, loadSharedLeagueSeasonOptions, type SharedLeagueSeasonOption } from "@/machete/shared_read_model";
import { loadFantasySquadPlannerData } from "@/machete/squad_planner";
import { loadPlannerReadinessByScope, selectPlannerSeason, type PlannerReadiness } from "@/machete/planner_readiness";
import {
  applyFantasyHistorySearchParams,
  fantasyHistorySettingsKey,
  parseFantasyHistorySettings,
  type FantasyHistorySettings
} from "@/machete/squad-history";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    leagueId?: string;
    season?: string;
    squadId?: string;
    historyScope?: string;
    historyWindow?: string;
    historySeason?: string | string[];
  }>;
};

export default async function MacheteSquadPage({ searchParams }: PageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const historySettings = parseFantasyHistorySettings(params);
  const [allLeagues, allLeagueSeasonOptions] = await Promise.all([loadSharedLeagueOptions(prisma), loadSharedLeagueSeasonOptions(prisma)]);
  const leagues = allLeagues.filter(isFantasySquadLeague);
  const leagueSeasonOptions = allLeagueSeasonOptions.filter(isFantasySquadLeague);
  const selectedLeagueId =
    params.leagueId && leagues.some((league) => String(league.leagueId) === params.leagueId)
      ? params.leagueId
      : leagues[0]
        ? String(leagues[0].leagueId)
        : "";
  const seasonsForSelectedLeague = selectedLeagueId ? leagueSeasonOptions.filter((league) => String(league.leagueId) === selectedLeagueId) : [];
  const readinessByScope = await loadPlannerReadinessByScope(prisma, seasonsForSelectedLeague);
  const seasonSelection = selectPlannerSeason(params.season, seasonsForSelectedLeague, readinessByScope);
  const selectedLeague = seasonSelection.option;
  const selectedSeason = selectedLeague?.season ?? "";
  const data = selectedLeague && seasonSelection.readiness
    ? await loadInitialFantasySquadPlannerData(user.id, selectedLeague, seasonSelection.readiness, historySettings, params.squadId)
    : null;

  return (
    <MacheteShell compact>
      <section className="border-b border-slate-200 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              <I18nText en="Fantasy planning" ru="Фэнтези-планирование" />
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink">
              <I18nText en="Squad planner" ru="Планировщик состава" />
            </h1>
          </div>

          <details className="relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <Wrench className="h-4 w-4" aria-hidden="true" />
              <I18nText en="Data tools" ru="Инструменты" />
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </summary>
            <div className="mt-2 rounded border border-slate-200 bg-white p-3 shadow-elev sm:absolute sm:right-0 sm:z-20 sm:w-[min(36rem,calc(100vw-3rem))]">
              <div className="flex flex-wrap gap-2">
                <Link href={machetePlayersHref(selectedLeague)} className="inline-flex items-center justify-center rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <I18nText en="Player explorer" ru="Таблица игроков" />
                </Link>
                {selectedLeague ? (
                  <>
                    <a href={squadExportHref(selectedLeague, "csv", historySettings, data?.squad.id)} className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <Download className="h-4 w-4" aria-hidden="true" />
                      CSV
                    </a>
                    <a href={squadExportHref(selectedLeague, "xlsx", historySettings, data?.squad.id)} className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <Download className="h-4 w-4" aria-hidden="true" />
                      XLSX
                    </a>
                  </>
                ) : null}
              </div>
              {selectedLeague && user.role === UserRole.ADMIN ? (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <FantasyPriceSheetImportForm leagueId={String(selectedLeague.leagueId)} season={selectedLeague.season} canImport />
                </div>
              ) : null}
            </div>
          </details>
        </div>

        <AutoSubmitForm className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:max-w-3xl sm:grid-cols-[minmax(240px,1fr)_minmax(150px,0.55fr)_auto]">
          <input type="hidden" name="historyScope" value={historySettings.scope} />
          <input type="hidden" name="historyWindow" value={historySettings.window} />
          {historySettings.selectedSeasons.map((season) => <input key={season} type="hidden" name="historySeason" value={season} />)}
          <label className="col-span-2 text-sm sm:col-span-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"><I18nText en="League" ru="Лига" /></span>
            <select name="leagueId" defaultValue={selectedLeagueId} className="w-full rounded border border-slate-200 bg-white px-3 py-2">
              {leagues.map((league) => (
                <option key={String(league.leagueId)} value={String(league.leagueId)}>
                  {league.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Season" ru="Сезон" /></span>
            <select name="season" defaultValue={selectedSeason} disabled={!selectedLeagueId} className="w-full rounded border border-slate-200 bg-white px-3 py-2 disabled:bg-slate-100">
              <LocalizedOption value="" en="Choose league first" ru="Сначала выберите лигу" />
              {seasonsForSelectedLeague.map((league) => (
                <option key={`${league.leagueId}:${league.season}`} value={league.season}>
                  {league.season}{league.isCurrent ? " - current" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="self-end rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            <I18nText en="Load" ru="Загрузить" />
          </button>
        </AutoSubmitForm>
      </section>

      {selectedLeague && data ? (
        <>
          {!data.readiness.ready ? (
            <div role="status" className="mt-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <I18nText
                en={`This explicitly selected season is not forecast-ready: ${data.readiness.reasons.join(", ")}. Auto-pick and transfer recommendations are unavailable.`}
                ru={`Явно выбранный сезон не готов для прогнозов: ${data.readiness.reasons.join(", ")}. Автоподбор и рекомендации по трансферам недоступны.`}
              />
            </div>
          ) : null}
          <FantasySquadPlanner
            key={`${selectedLeague.leagueId}:${selectedLeague.season}:${data.squad.id ?? "new-squad"}:${fantasyHistorySettingsKey(historySettings)}`}
            leagueId={String(selectedLeague.leagueId)}
            season={selectedLeague.season}
            rules={data.rules}
            rounds={data.rounds}
            players={initialSquadPlayers(data.players, data.squad.roundPlans.flatMap((plan) => plan.selections))}
            playerPoolHref={squadPlayerPoolHref(selectedLeague, historySettings, data.squad.id)}
            initialSquad={data.squad}
            savedSquads={data.squads}
            readiness={data.readiness}
            priceStatus={data.priceStatus}
            historySettings={historySettings}
            historySeasonOptions={data.historySeasonOptions}
          />
        </>
      ) : (
        <div className="mt-6 rounded border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          <I18nText
            en="No forecast-ready season is available. Load an explicit season to inspect its readiness blockers, or wait for fixtures, ingestion, and its exact data-quality audit."
            ru="Нет сезона, готового для прогнозов. Выберите сезон явно, чтобы увидеть причины блокировки, либо дождитесь расписания, загрузки данных и точного аудита этого сезона."
          />
        </div>
      )}
    </MacheteShell>
  );
}

function machetePlayersHref(league: SharedLeagueSeasonOption | null) {
  if (!league) return "/machete/players";

  const query = new URLSearchParams({
    leagueId: String(league.leagueId),
    season: league.season
  });

  return `/machete/players?${query.toString()}`;
}

function squadExportHref(league: SharedLeagueSeasonOption, format: "csv" | "xlsx", historySettings: FantasyHistorySettings, squadId?: string | null) {
  const query = new URLSearchParams({
    leagueId: String(league.leagueId),
    season: league.season,
    format
  });
  applyFantasyHistorySearchParams(query, historySettings);
  if (squadId) query.set("squadId", squadId);

  return `/api/machete/squads/export?${query.toString()}`;
}

function squadPlayerPoolHref(league: SharedLeagueSeasonOption, historySettings: FantasyHistorySettings, squadId?: string | null) {
  const query = new URLSearchParams({
    leagueId: String(league.leagueId),
    season: league.season
  });
  applyFantasyHistorySearchParams(query, historySettings);
  if (squadId) query.set("squadId", squadId);
  return `/api/machete/squads?${query.toString()}`;
}

function initialSquadPlayers<T extends { playerId: string }>(players: T[], selections: Array<{ playerId: string }>) {
  const selectedPlayerIds = new Set(selections.map((selection) => selection.playerId));
  return players.filter((player) => selectedPlayerIds.has(player.playerId));
}

async function loadInitialFantasySquadPlannerData(
  userId: string,
  league: SharedLeagueSeasonOption,
  readiness: PlannerReadiness,
  historySettings: FantasyHistorySettings,
  squadId?: string | null
) {
  const requestedSquad = squadId
    ? await prisma.userFantasySquad.findFirst({
        where: {
          id: squadId,
          userId,
          leagueId: league.leagueId,
          season: league.season
        },
        select: {
          players: { select: { playerId: true } }
        }
      })
    : null;
  const selectedSquad = requestedSquad ?? await prisma.userFantasySquad.findFirst({
    where: {
      userId,
      leagueId: league.leagueId,
      season: league.season
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      players: { select: { playerId: true } }
    }
  });

  return loadFantasySquadPlannerData(prisma, userId, league, squadId, {
    playerIds: selectedSquad?.players.map((player) => player.playerId) ?? [],
    readiness,
    historySettings
  });
}
