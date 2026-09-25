import { FantasySquadPlanner } from "@/components/machete/FantasySquadPlanner";
import { FranchiseSquadsPanel } from "@/components/machete/FranchiseSquadsPanel";
import { SquadLeagueCommit, SquadLeagueSwitcher } from "@/components/machete/SquadLeagueSwitcher";
import { I18nText } from "@/components/i18n-text";
import { MacheteShell } from "@/components/machete/MacheteShell";
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
    <MacheteShell
      compact
      tools={(
        <>
          {mode === "FPL" ? (
            <span className="text-[13px] font-semibold text-slate-700">
              <I18nText en="Fantasy Premier League" ru="Fantasy Premier League" />
            </span>
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
            <SquadFreshness
              provider={provider}
              fotmobStatsAt={freshness.fotmobStatsAt}
              pricesAt={data?.priceStatus.lastSyncedAt}
              bookmakerOddsAt={freshness.bookmakerOddsAt}
              startingXiOldest={freshness.startingXiOldest}
              startingXiNewest={freshness.startingXiNewest}
            />
          ) : null}
        </>
      )}
    >
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

function SquadFreshness({
  provider,
  fotmobStatsAt,
  pricesAt,
  bookmakerOddsAt,
  startingXiOldest,
  startingXiNewest
}: {
  provider: string;
  fotmobStatsAt: Parameters<typeof formatDateTime>[0];
  pricesAt: Parameters<typeof formatDateTime>[0];
  bookmakerOddsAt: Parameters<typeof formatDateTime>[0];
  startingXiOldest?: { teamName: string; at: string | null } | null;
  startingXiNewest?: { teamName: string; at: string | null } | null;
}) {
  const priceName = provider === "FPL" ? "FPL" : "Sports.ru";
  return (
    <details className="relative">
      <summary className="flex h-8 cursor-pointer list-none items-center rounded-xl border border-slate-200 bg-white px-2.5 text-[13px] font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
        <I18nText en="Freshness" ru="Свежесть" />
      </summary>
      <dl className="absolute left-0 z-30 mt-1 grid w-[min(20rem,calc(100vw-2rem))] gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-md sm:left-auto sm:right-0">
        <div><dt className="font-semibold text-slate-500"><I18nText en="FotMob" ru="FotMob" /></dt><dd className="mt-0.5">{formatDateTime(fotmobStatsAt)}</dd></div>
        <div><dt className="font-semibold text-slate-500">{priceName}</dt><dd className="mt-0.5">{formatDateTime(pricesAt)}</dd></div>
        <div><dt className="font-semibold text-slate-500"><I18nText en="Odds" ru="Коэффициенты" /></dt><dd className="mt-0.5">{formatDateTime(bookmakerOddsAt)}</dd></div>
        <div>
          <dt className="font-semibold text-slate-500"><I18nText en="Oldest XI flags" ru="Самые старые флаги XI" /></dt>
          <dd className="mt-0.5">{startingXiFreshnessLabel(startingXiOldest)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500"><I18nText en="Newest XI flags" ru="Самые новые флаги XI" /></dt>
          <dd className="mt-0.5">{startingXiFreshnessLabel(startingXiNewest)}</dd>
        </div>
      </dl>
    </details>
  );
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
