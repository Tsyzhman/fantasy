import { FantasySquadPlanner } from "@/components/machete/FantasySquadPlanner";
import { FranchiseSquadsPanel } from "@/components/machete/FranchiseSquadsPanel";
import { SquadLeagueCommit, SquadLeagueSwitcher } from "@/components/machete/SquadLeagueSwitcher";
import { I18nText } from "@/components/i18n-text";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { isFantasySquadLeague } from "@/lib/leagues/display";
import { FPL_LEAGUE_ID, FPL_PROVIDER, FPL_SEASON } from "@/lib/providers/fpl";
import { loadSharedLeagueOptions, type SharedLeagueSeasonOption } from "@/machete/shared_read_model";
import {
  loadFantasySquadPlannerData,
  loadSportsRuFantasySquadPlannerShellData
} from "@/machete/squad_planner";
import { loadSportsRuSquadSnapshotStatus } from "@/machete/sports_ru_squad_snapshots";
import { parseSquadTableColumns, parseSquadTableColumnWidths } from "@/machete/squad-table-columns";
import { loadFantasyPlayerPoolDataFreshness } from "@/machete/fantasy-player-pool-snapshots";
import { canSwitchFranchise, resolveVisibleFranchise } from "@/machete/franchise-access";
import { loadPlannerReadinessByScope, plannerReadinessBlocksTransferSuggestions, plannerReadinessKey, type PlannerReadiness } from "@/machete/planner_readiness";
import {
  applyFantasyHistorySearchParams,
  fantasyHistorySettingsKey,
  parseFantasyHistorySettings,
  type FantasyHistorySettings
} from "@/machete/squad-history";

export type FantasySquadPageProps = {
  searchParams: Promise<{
    leagueId?: string;
    squadId?: string;
    historyScope?: string;
    historyWindow?: string;
    historySeason?: string | string[];
    franchise?: string;
    provider?: string;
  }>;
  mode: "SPORTS_RU" | "FPL";
};

export default async function FantasySquadPage({ searchParams, mode }: FantasySquadPageProps) {
  const user = await requireCurrentUser();
  const [tablePreference, params, allLeagues] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { squadTableColumns: true, squadTableColumnWidths: true }
    }),
    searchParams,
    loadSharedLeagueOptions(prisma)
  ]);
  const historySettings = parseFantasyHistorySettings(params);
  const provider = mode === "FPL" ? FPL_PROVIDER : "SPORTS_RU";
  const leagues = mode === "FPL"
    ? allLeagues.filter((league) => league.leagueId === FPL_LEAGUE_ID && league.season === FPL_SEASON)
    : allLeagues.filter(isFantasySquadLeague);
  const selectedLeagueId = mode === "FPL"
    ? leagues[0]
      ? String(leagues[0].leagueId)
      : ""
    : params.leagueId && leagues.some((league) => String(league.leagueId) === params.leagueId)
      ? params.leagueId
      : leagues[0]
        ? String(leagues[0].leagueId)
        : "";
  const selectedLeague = leagues.find((league) => String(league.leagueId) === selectedLeagueId) ?? null;
  const readinessByScope = provider === "FPL" && selectedLeague
    ? await loadPlannerReadinessByScope(prisma, [selectedLeague])
    : new Map<string, PlannerReadiness>();
  const selectedReadiness = selectedLeague && provider === "FPL"
    ? readinessByScope.get(plannerReadinessKey(selectedLeague)) ?? null
    : undefined;
  const data = selectedLeague && (provider !== "FPL" || selectedReadiness)
    ? await loadInitialFantasySquadPlannerData(
        user.id,
        selectedLeague,
        selectedReadiness ?? undefined,
        historySettings,
        params.squadId,
        provider
      )
    : null;
  const freshness = selectedLeague
    ? await mergeSquadDataFreshness(selectedLeague, data?.dataFreshness)
    : null;
  const sportsRuSquadStatus = selectedLeague && provider !== "FPL"
    ? await loadSportsRuSquadSnapshotStatus(prisma, {
        userId: user.id,
        leagueId: selectedLeague.leagueId,
        season: selectedLeague.season
      })
    : null;
  const transferSuggestionsBlockedByReadiness = data ? plannerReadinessBlocksTransferSuggestions(data.readiness) : true;
  const leagueHistoryParams = new URLSearchParams();
  applyFantasyHistorySearchParams(leagueHistoryParams, historySettings);

  return (
    <MacheteShell compact>
      <section className="border-b border-slate-200 py-3 sm:py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              <I18nText en="Fantasy planning" ru="Фэнтези-планирование" />
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-ink sm:mt-1 sm:text-2xl">
              <I18nText en="Squad planner" ru="Планировщик состава" />
            </h1>
          </div>
        </div>

        {mode === "FPL" ? (
          <AutoSubmitForm className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:max-w-xl">
            <input type="hidden" name="historyScope" value={historySettings.scope} />
            <input type="hidden" name="historyWindow" value={historySettings.window} />
            {historySettings.selectedSeasons.map((season) => <input key={season} type="hidden" name="historySeason" value={season} />)}
            <div className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Fantasy league" ru="Фэнтези-лига" /></span>
              <div className="flex min-h-12 items-center rounded border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-800">
                <I18nText en="Fantasy Premier League · EPL CoreLeague 47" ru="Fantasy Premier League · CoreLeague АПЛ 47" />
              </div>
              <input type="hidden" name="leagueId" value={selectedLeagueId} />
            </div>
            <button type="submit" className="ui-button ui-button-primary min-h-12 self-end px-4">
              <I18nText en="Load" ru="Загрузить" />
            </button>
          </AutoSubmitForm>
        ) : (
          <SquadLeagueSwitcher
            pathname="/machete/squad"
            selectedLeagueId={selectedLeagueId}
            historyQuery={leagueHistoryParams.toString()}
            leagues={leagues.map((league) => ({
              leagueId: String(league.leagueId),
              label: league.displayName
            }))}
          />
        )}
        {freshness ? (
          <>
          <details className="mt-3 rounded border border-slate-200 bg-white lg:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
              <I18nText en="Data freshness" ru="Свежесть данных" />
              <span className="text-xs font-normal text-slate-500"><I18nText en="Show details" ru="Подробнее" /></span>
            </summary>
            <dl className="grid gap-2 border-t border-slate-200 p-3 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="font-semibold text-slate-500"><I18nText en="FotMob" ru="FotMob" /></dt><dd className="mt-0.5">{formatDateTime(freshness.fotmobStatsAt)}</dd></div>
              <div><dt className="font-semibold text-slate-500"><I18nText en={provider === "FPL" ? "FPL" : "Sports.ru"} ru={provider === "FPL" ? "FPL" : "Sports.ru"} /></dt><dd className="mt-0.5">{formatDateTime(data?.priceStatus.lastSyncedAt)}</dd></div>
              <div><dt className="font-semibold text-slate-500"><I18nText en="Odds" ru="Коэффициенты" /></dt><dd className="mt-0.5">{formatDateTime(freshness.bookmakerOddsAt)}</dd></div>
              <div>
                <dt className="font-semibold text-slate-500"><I18nText en="Oldest XI flags" ru="Самые старые флаги XI" /></dt>
                <dd className="mt-0.5">{startingXiFreshnessLabel(freshness.startingXiOldest)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500"><I18nText en="Newest XI flags" ru="Самые новые флаги XI" /></dt>
                <dd className="mt-0.5">{startingXiFreshnessLabel(freshness.startingXiNewest)}</dd>
              </div>
            </dl>
          </details>
          <div className="mt-3 hidden flex-wrap items-center gap-2 text-xs text-slate-600 lg:flex">
            <span className="font-semibold uppercase tracking-wide text-slate-500">
              <I18nText en="Data updated · Moscow time" ru="Обновление данных · МСК" />
            </span>
            <span className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
              <I18nText en={`FotMob stats: ${formatDateTime(freshness.fotmobStatsAt)}`} ru={`Стата FotMob: ${formatDateTime(freshness.fotmobStatsAt)}`} />
            </span>
            <span className="rounded border border-slate-200 bg-white px-2.5 py-1.5" title={`${provider === "FPL" ? "Latest FPL" : "Latest Sports.ru"} fantasy-price snapshot for this league and season / ${provider === "FPL" ? "Последний снимок цен FPL" : "Последний снимок цен Sports.ru"} для этой лиги и сезона`}>
              <I18nText en={`${provider === "FPL" ? "FPL" : "Sports.ru"} prices: ${formatDateTime(data?.priceStatus.lastSyncedAt)}`} ru={`${provider === "FPL" ? "Цены FPL" : "Цены Sports.ru"}: ${formatDateTime(data?.priceStatus.lastSyncedAt)}`} />
            </span>
            <span className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
              <I18nText en={`Bookmaker odds: ${formatDateTime(freshness.bookmakerOddsAt)}`} ru={`Кэфы букмекера: ${formatDateTime(freshness.bookmakerOddsAt)}`} />
            </span>
            <span className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
              <I18nText
                en={`Oldest XI flags: ${startingXiFreshnessLabel(freshness.startingXiOldest)}`}
                ru={`Самые старые флаги XI: ${startingXiFreshnessLabel(freshness.startingXiOldest)}`}
              />
            </span>
            <span className="rounded border border-slate-200 bg-white px-2.5 py-1.5">
              <I18nText
                en={`Newest XI flags: ${startingXiFreshnessLabel(freshness.startingXiNewest)}`}
                ru={`Самые новые флаги XI: ${startingXiFreshnessLabel(freshness.startingXiNewest)}`}
              />
            </span>
          </div>
          </>
        ) : null}
      </section>

      {selectedLeague ? (
        <FranchiseSquadsPanel
          leagueId={String(selectedLeague.leagueId)}
          season={selectedLeague.season}
          provider={provider}
          initialFranchise={resolveVisibleFranchise(user, params.franchise)}
          canSwitch={canSwitchFranchise(user)}
        />
      ) : null}

      {selectedLeague && data ? (
        <>
          {!data.readiness.ready && transferSuggestionsBlockedByReadiness ? (
            <div role="status" className="mt-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <I18nText
                en={`The current season is not forecast-ready: ${data.readiness.reasons.join(", ")}. Auto-pick and transfer recommendations are unavailable.`}
                ru={`Текущий сезон не готов для прогнозов: ${data.readiness.reasons.join(", ")}. Автоподбор и рекомендации по трансферам недоступны.`}
              />
            </div>
          ) : null}
          <FantasySquadPlanner
            key={`${provider}:${selectedLeague.leagueId}:${selectedLeague.season}:${data.squad.id ?? "new-squad"}:${fantasyHistorySettingsKey(historySettings)}`}
            leagueId={String(selectedLeague.leagueId)}
            season={selectedLeague.season}
            rules={data.rules}
            rounds={data.rounds}
            bookmakerFavorites={data.bookmakerFavorites}
            initialFixtureCalendar={data.fixtureCalendar ?? null}
            players={initialSquadPlayers(data.players, data.squad.roundPlans.flatMap((plan) => plan.selections))}
            playerPoolHref={squadPlayerPoolHref(
              selectedLeague,
              historySettings,
              data.squad.id,
              mode === "FPL" ? "/api/machete/fpl/squad" : "/api/machete/squads",
              provider,
              data.playerPoolSnapshotId
            )}
            initialSquad={data.squad}
            readiness={data.readiness}
            sportsRuSquadStatus={sportsRuSquadStatus}
            contestId={data.contestId}
            provider={provider}
            squadApiPath={mode === "FPL" ? "/api/machete/fpl/squad" : "/api/machete/squads"}
            squadRoutePath={mode === "FPL" ? "/machete/fpl/squad" : "/machete/squad"}
            historySettings={historySettings}
            initialVisiblePlayerPoolColumns={parseSquadTableColumns(tablePreference?.squadTableColumns)}
            initialPlayerPoolColumnWidths={parseSquadTableColumnWidths(tablePreference?.squadTableColumnWidths)}
          />
        </>
      ) : (
        <div className="mt-6 rounded border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          <I18nText
            en="The current season is unavailable. Wait for its roster and league data to be loaded."
            ru="Текущий сезон недоступен. Дождитесь загрузки его состава и данных лиги."
          />
        </div>
      )}
      {mode !== "FPL" && selectedLeagueId ? <SquadLeagueCommit leagueId={selectedLeagueId} /> : null}
    </MacheteShell>
  );
}

function squadPlayerPoolHref(
  league: SharedLeagueSeasonOption,
  historySettings: FantasyHistorySettings,
  squadId: string | null | undefined,
  apiPath: string,
  provider: string,
  snapshotId?: string | null
) {
  const query = new URLSearchParams({
    leagueId: String(league.leagueId),
    season: league.season,
    progressive: "1"
  });
  if (provider === FPL_PROVIDER) query.set("provider", FPL_PROVIDER);
  if (snapshotId) query.set("snapshotId", snapshotId);
  applyFantasyHistorySearchParams(query, historySettings);
  if (squadId) query.set("squadId", squadId);
  return `${apiPath}?${query.toString()}`;
}

async function mergeSquadDataFreshness(
  league: SharedLeagueSeasonOption,
  snapshot?: {
    fotmobStatsAt: string | null;
    bookmakerOddsAt: string | null;
    startingXiOldest?: { teamName: string; at: string | null } | null;
    startingXiNewest?: { teamName: string; at: string | null } | null;
  } | null
) {
  const live = await loadFantasyPlayerPoolDataFreshness(prisma, league);
  return {
    fotmobStatsAt: snapshot?.fotmobStatsAt ?? live.fotmobStatsAt,
    bookmakerOddsAt: snapshot?.bookmakerOddsAt ?? live.bookmakerOddsAt,
    startingXiOldest: live.startingXiOldest ?? snapshot?.startingXiOldest ?? null,
    startingXiNewest: live.startingXiNewest ?? snapshot?.startingXiNewest ?? null
  };
}

function startingXiFreshnessLabel(value?: { teamName: string; at: string | null } | null) {
  if (!value) return formatDateTime(null);
  return `${value.teamName} · ${formatDateTime(value.at)}`;
}

function initialSquadPlayers<T extends { playerId: string }>(players: T[], selections: Array<{ playerId: string }>) {
  const selectedPlayerIds = new Set(selections.map((selection) => selection.playerId));
  return players.filter((player) => selectedPlayerIds.has(player.playerId));
}

async function loadInitialFantasySquadPlannerData(
  userId: string,
  league: SharedLeagueSeasonOption,
  readiness: PlannerReadiness | undefined,
  historySettings: FantasyHistorySettings,
  squadId?: string | null,
  provider = "SPORTS_RU"
) {
  const contest = await prisma.fantasyContest.findUnique({
    where: { provider_leagueId_season: { provider, leagueId: league.leagueId, season: league.season } },
    select: { id: true }
  });
  if (provider === "SPORTS_RU") {
    return loadSportsRuFantasySquadPlannerShellData(prisma, userId, league, squadId, {
      ...(readiness ? { readiness } : {}),
      historySettings,
      contestId: contest?.id ?? null
    });
  }
  const requestedSquad = squadId && contest
    ? await prisma.userFantasySquad.findFirst({
        where: {
          id: squadId,
          userId,
          provider,
          ...(contest ? { contestId: contest.id } : {}),
          leagueId: league.leagueId,
          season: league.season
        },
        select: {
          players: { select: { playerId: true } }
        }
      })
    : null;
  const selectedSquad = requestedSquad ?? (contest
    ? await prisma.userFantasySquad.findFirst({
        where: {
          userId,
          provider,
          contestId: contest.id,
          leagueId: league.leagueId,
          season: league.season
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          players: { select: { playerId: true } }
        }
      })
    : null);

  const selectedPlayerIds = selectedSquad?.players.map((player) => player.playerId) ?? [];
  const data = await loadFantasySquadPlannerData(prisma, userId, league, squadId, {
    playerIds: selectedPlayerIds,
    readiness,
    historySettings,
    deferFormulaProjections: true,
    provider,
    contestId: contest?.id ?? null
  });
  return data;
}
