import Link from "next/link";
import { ImportStatus } from "@prisma/client";

import { I18nText } from "@/components/i18n-text";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { CopyCurrentLinkButton } from "@/components/ui/copy-current-link-button";
import { SparkLine } from "@/components/ui/spark-line";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatCurrency, formatNumber, formatScore, NULL_GLYPH } from "@/lib/format";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import { compactTeamDisplayName } from "@/lib/teams/display";
import { loadSportsRuFantasyPriceRefsByScopedPlayer, sportsRuFantasyPriceScopeKey, type SportsRuFantasyPriceRef } from "@/machete/squad_planner";
import {
  loadSharedMachetePlayerRows,
  type SharedMachetePlayerRow,
  type SharedPlayerRowsScope
} from "@/machete/shared_read_model";
import { parseMacheteMatchWindow, type MacheteMatchWindow } from "@/scoring/machete/match-window";

export const dynamic = "force-dynamic";

type SearchParams = {
  source?: string;
  ids?: string;
  window?: string;
};

type CompareRow = {
  id: string;
  name: string;
  teamName: string | null;
  teamShortName: string | null;
  leagueName: string | null;
  position: string | null;
  matchesPlayed: number | null;
  minutesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  shotsOnTarget: number | null;
  keyPasses: number | null;
  tackles: number | null;
  averageRating: number | null;
  marketValue: number | null;
  fantasyScore: number | null;
  scoringScore: number | null;
  alternativeScore: number | null;
  recentFp: number[];
};

const MAX_PLAYERS = 4;

const WINDOW_OPTIONS: Array<{ value: string; en: string; ru: string }> = [
  { value: "last5", en: "Last 5", ru: "Последние 5" },
  { value: "last10", en: "Last 10", ru: "Последние 10" },
  { value: "last15", en: "Last 15", ru: "Последние 15" },
  { value: "current", en: "Current season", ru: "Текущий сезон" },
  { value: "all", en: "All loaded", ru: "Все матчи" }
];

const METRIC_DEFS: Array<{
  key: keyof CompareRow;
  en: string;
  ru: string;
  format: "score" | "number" | "currency";
  digits?: number;
  tone?: "emerald" | "sky" | "amber";
  higherBetter?: boolean;
}> = [
  { key: "fantasyScore", en: "xFP", ru: "xFP", format: "score", tone: "emerald", higherBetter: true },
  { key: "scoringScore", en: "FP", ru: "FP", format: "score", tone: "sky", higherBetter: true },
  { key: "alternativeScore", en: "vFP", ru: "vFP", format: "score", tone: "amber", higherBetter: true },
  { key: "matchesPlayed", en: "Apps", ru: "Матчи", format: "number", higherBetter: true },
  { key: "minutesPlayed", en: "Min", ru: "Минут", format: "number", higherBetter: true },
  { key: "goals", en: "G", ru: "Г", format: "number", digits: 2, higherBetter: true },
  { key: "assists", en: "A", ru: "П", format: "number", digits: 2, higherBetter: true },
  { key: "shotsOnTarget", en: "SOT", ru: "Удары в створ", format: "number", higherBetter: true },
  { key: "keyPasses", en: "KP", ru: "Кл. передачи", format: "number", higherBetter: true },
  { key: "tackles", en: "Tkl", ru: "Отборы", format: "number", higherBetter: true },
  { key: "averageRating", en: "Rating", ru: "Рейтинг", format: "score", higherBetter: true },
  { key: "marketValue", en: "Market", ru: "Стоимость", format: "currency", higherBetter: true }
];

const METRIC_GROUPS: Array<{
  key: string;
  en: string;
  ru: string;
  metrics: typeof METRIC_DEFS;
}> = [
  {
    key: "fantasy",
    en: "Fantasy",
    ru: "Фэнтези",
    metrics: METRIC_DEFS.filter((metric) => ["fantasyScore", "scoringScore", "alternativeScore"].includes(metric.key))
  },
  {
    key: "volume",
    en: "Usage",
    ru: "Роль",
    metrics: METRIC_DEFS.filter((metric) => ["matchesPlayed", "minutesPlayed", "averageRating"].includes(metric.key))
  },
  {
    key: "attack",
    en: "Attack",
    ru: "Атака",
    metrics: METRIC_DEFS.filter((metric) => ["goals", "assists", "shotsOnTarget", "keyPasses"].includes(metric.key))
  },
  {
    key: "defense",
    en: "Defense & value",
    ru: "Оборона и цена",
    metrics: METRIC_DEFS.filter((metric) => ["tackles", "marketValue"].includes(metric.key))
  }
];

export default async function ComparePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const currentUser = await getCurrentUser();
  const source = params.source === "baltika" ? "baltika" : "machete";
  const rawIds = (params.ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_PLAYERS);

  const window = parseMacheteMatchWindow({ mode: params.window ?? "last5" });
  const rows = rawIds.length === 0
    ? []
    : source === "machete"
      ? await loadMacheteRows(rawIds, window, currentUser?.id)
      : await loadBaltikaRows(rawIds);

  const backHref = source === "machete" ? "/machete/players" : "/baltika/players";
  const visibleMetricGroups = buildVisibleMetricGroups(rows);
  const xFpLeaderValue = bestMetricValue(rows.map((row) => row.fantasyScore), true);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumbs
        backHref={backHref}
        backLabel={<I18nText en="Back" ru="Назад" />}
        items={[
          { label: source === "machete" ? "Machete" : <I18nText en="Baltika" ru="Балтика" />, href: backHref },
          { label: <I18nText en="Compare" ru="Сравнение" />, href: "/compare" }
        ]}
      />

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            <I18nText en="Side-by-side comparison" ru="Сравнение игроков" />
          </p>
          <h1 className="mt-2 text-3xl font-bold text-ink">
            {rows.length > 0 ? (
              <I18nText en={`${rows.length} players`} ru={`${rows.length} игроков`} />
            ) : (
              <I18nText en="Pick players to compare" ru="Выберите игроков для сравнения" />
            )}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            <I18nText
              en="Drag-and-drop players into the dock on the explorer pages, then click Compare. Up to 4 players, side-by-side."
              ru="Перетащите игроков в панель сравнения на страницах игроков и нажмите «Сравнить». До 4 игроков, бок о бок."
            />
          </p>
        </div>
        {rawIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {source === "machete" ? <WindowSelector source={source} ids={rawIds} active={params.window ?? "last5"} /> : null}
            <CopyCurrentLinkButton />
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <section className="mt-10 rounded border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-soft">
          <I18nText en="No players selected." ru="Ни одного игрока не выбрано." />{" "}
          <Link href={backHref} className="font-semibold text-brand-600 hover:underline">
            <I18nText en="Pick some →" ru="Выбрать →" />
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {rows.map((row) => (
              <CompareSummaryCard
                key={row.id}
                row={row}
                isLeader={xFpLeaderValue !== null && row.fantasyScore === xFpLeaderValue && rows.length > 1}
              />
            ))}
          </section>

          <section className="mt-6 overflow-hidden rounded border border-slate-200 bg-white shadow-soft">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="sticky left-0 z-20 min-w-[132px] bg-slate-50 px-4 py-3">
                      <I18nText en="Metric" ru="Метрика" />
                    </th>
                    {rows.map((row) => (
                      <th key={row.id} className="min-w-[168px] px-3 py-3 text-center align-bottom">
                        <div className="text-sm font-bold text-ink" title={row.name}>{compactPlayerDisplayName(row.name)}</div>
                        <div className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-slate-500" title={row.teamName ?? undefined}>
                          {[row.position, compareTeamDisplayName(row)].filter(Boolean).join(" · ") || NULL_GLYPH}
                        </div>
                        {row.leagueName ? (
                          <div className="text-[10px] font-normal normal-case tracking-normal text-slate-400">
                            {row.leagueName}
                          </div>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleMetricGroups.map((group) => (
                    <MetricGroupRows key={group.key} group={group} rows={rows} />
                  ))}
                  {source === "machete" ? (
                    <tr className="hover:bg-slate-50">
                      <th className="sticky left-0 z-10 bg-slate-50/95 px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
                        <I18nText en="Recent form" ru="Форма" />
                      </th>
                      {rows.map((row) => (
                        <td key={row.id} className="px-3 py-2.5 text-center">
                          <SparkLine values={row.recentFp} width={88} height={28} />
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {source === "baltika" && rawIds.length > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          <I18nText
            en="Baltika snapshots are season-aggregated, so the match-window selector is not applicable."
            ru="Снимки Балтики уже агрегированы по сезону — селектор окна не применяется."
          />
        </p>
      ) : null}
    </main>
  );
}

function WindowSelector({ source, ids, active }: { source: string; ids: string[]; active: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded border border-slate-200 bg-white p-1 shadow-sm">
      <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <I18nText en="Window" ru="Окно" />
      </span>
      {WINDOW_OPTIONS.map((option) => {
        const href = `/compare?source=${source}&ids=${encodeURIComponent(ids.join(","))}&window=${option.value}`;
        const isActive = active === option.value;
        return (
          <Link
            key={option.value}
            href={href}
            className={`rounded px-2 py-1 text-xs font-semibold transition ${
              isActive ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <I18nText en={option.en} ru={option.ru} />
          </Link>
        );
      })}
    </div>
  );
}

function CompareSummaryCard({ row, isLeader }: { row: CompareRow; isLeader: boolean }) {
  return (
    <article className="rounded border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-ink" title={row.name}>{compactPlayerDisplayName(row.name)}</h2>
          <p className="mt-1 truncate text-xs text-slate-500" title={row.teamName ?? undefined}>
            {[row.position, compareTeamDisplayName(row)].filter(Boolean).join(" · ") || NULL_GLYPH}
          </p>
        </div>
        {isLeader ? (
          <span className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            <I18nText en="xFP lead" ru="Лидер xFP" />
          </span>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <SummaryStat tone="emerald" label="xFP" value={row.fantasyScore} />
        <SummaryStat tone="sky" label="FP" value={row.scoringScore} />
        <SummaryStat tone="amber" label="vFP" value={row.alternativeScore} />
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span className="num-tabular"><I18nText en="Min" ru="Мин" />: {formatNumber(row.minutesPlayed)}</span>
        <span className="num-tabular">G+A: {formatNumber(sumNullable(row.goals, row.assists), 2)}</span>
      </div>
    </article>
  );
}

function SummaryStat({
  tone,
  label,
  value
}: {
  tone: "emerald" | "sky" | "amber";
  label: string;
  value: number | null;
}) {
  const className =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "sky"
        ? "bg-sky-50 text-sky-700"
        : "bg-amber-50 text-amber-800";

  return (
    <div className={`rounded px-2 py-2 text-center ${className}`}>
      <dt className="text-[10px] font-bold uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-base font-bold num-tabular">{formatScore(value)}</dd>
    </div>
  );
}

function MetricGroupRows({
  group,
  rows
}: {
  group: (typeof METRIC_GROUPS)[number];
  rows: CompareRow[];
}) {
  return (
    <>
      <tr>
        <th
          colSpan={rows.length + 1}
          className="sticky left-0 bg-slate-100 px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"
        >
          <I18nText en={group.en} ru={group.ru} />
        </th>
      </tr>
      {group.metrics.map((metric) => {
        const values = rows.map((row) => extractMetricValue(row, metric.key));
        const bestValue = bestMetricValue(values, metric.higherBetter ?? true);
        return (
          <tr key={metric.key} className="hover:bg-slate-50">
            <th className="sticky left-0 z-10 bg-slate-50/95 px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">
              <I18nText en={metric.en} ru={metric.ru} />
            </th>
            {rows.map((row, idx) => (
              <MetricValueCell
                key={row.id}
                metric={metric}
                value={values[idx]}
                bestValue={bestValue}
                showDelta={rows.length > 1}
              />
            ))}
          </tr>
        );
      })}
    </>
  );
}

function MetricValueCell({
  metric,
  value,
  bestValue,
  showDelta
}: {
  metric: (typeof METRIC_DEFS)[number];
  value: number | null;
  bestValue: number | null;
  showDelta: boolean;
}) {
  const isBest = bestValue !== null && value === bestValue && showDelta;
  const delta = showDelta && value !== null && bestValue !== null && !isBest ? metricDelta(value, bestValue, metric.higherBetter ?? true) : null;

  return (
    <td
      className={`px-3 py-2.5 text-center text-sm num-tabular ${
        isBest ? toneClasses(metric.tone) : "text-slate-700"
      }`}
    >
      <span className="block font-semibold">{formatMetric(value, metric.format, metric.digits)}</span>
      {isBest ? (
        <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide">
          <I18nText en="Best" ru="Лучший" />
        </span>
      ) : delta ? (
        <span className="mt-0.5 block text-[10px] text-slate-400">{delta}</span>
      ) : null}
    </td>
  );
}

function buildVisibleMetricGroups(rows: CompareRow[]) {
  return METRIC_GROUPS.map((group) => ({
    ...group,
    metrics: group.metrics.filter((metric) => rows.some((row) => extractMetricValue(row, metric.key) !== null))
  })).filter((group) => group.metrics.length > 0);
}

function extractMetricValue(row: CompareRow, key: keyof CompareRow): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bestMetricValue(values: Array<number | null>, higherBetter: boolean): number | null {
  const numeric = values.filter((value): value is number => value !== null);
  if (numeric.length === 0) return null;
  return higherBetter ? Math.max(...numeric) : Math.min(...numeric);
}

function formatMetric(value: number | null, format: "score" | "number" | "currency", digits?: number) {
  if (value === null) return NULL_GLYPH;
  if (format === "currency") return formatCurrency(value);
  if (format === "score") return formatScore(value);
  return formatNumber(value, digits);
}

function metricDelta(value: number, bestValue: number, higherBetter: boolean) {
  const delta = higherBetter ? value - bestValue : bestValue - value;
  if (!Number.isFinite(delta) || delta === 0) return null;
  return formatSignedNumber(delta);
}

function formatSignedNumber(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value, 2)}`;
}

function sumNullable(...values: Array<number | null>) {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numeric.length > 0 ? numeric.reduce((sum, value) => sum + value, 0) : null;
}

function toneClasses(tone: "emerald" | "sky" | "amber" | undefined) {
  if (tone === "emerald") return "bg-emerald-50 font-semibold text-emerald-700";
  if (tone === "sky") return "bg-sky-50 font-semibold text-sky-700";
  if (tone === "amber") return "bg-amber-50 font-semibold text-amber-800";
  return "bg-brand-50 font-semibold text-brand-700";
}

type MacheteIdParts = {
  raw: string;
  combined: boolean;
  scope: SharedPlayerRowsScope | null;
  playerId: string;
};

function parseMacheteId(id: string): MacheteIdParts {
  if (id.startsWith("combined:")) {
    const value = id.slice("combined:".length);
    const [teamId, playerId, competitions] = splitOnce(value, ":", 2);
    const firstCompetition = competitions?.split("|")[0];
    if (!teamId || !playerId || !firstCompetition) {
      return { raw: id, combined: true, scope: null, playerId: playerId ?? "" };
    }
    const [leagueIdRaw, season] = splitOnce(firstCompetition, ":", 1);
    if (!leagueIdRaw || !season) return { raw: id, combined: true, scope: null, playerId };
    const leagueId = parseBigInt(leagueIdRaw);
    const teamIdBig = parseBigInt(teamId);
    if (leagueId === null || teamIdBig === null) return { raw: id, combined: true, scope: null, playerId };
    return { raw: id, combined: true, scope: { leagueId, season, teamId: teamIdBig }, playerId };
  }

  const parts = id.split(":");
  if (parts.length < 4) return { raw: id, combined: false, scope: null, playerId: "" };
  const [leagueIdRaw, season, teamIdRaw, playerId] = parts;
  const leagueId = parseBigInt(leagueIdRaw);
  const teamId = parseBigInt(teamIdRaw);
  if (leagueId === null || teamId === null) return { raw: id, combined: false, scope: null, playerId };
  return { raw: id, combined: false, scope: { leagueId, season, teamId }, playerId };
}

function splitOnce(value: string, separator: string, count: number) {
  const parts: string[] = [];
  let remainder = value;
  for (let i = 0; i < count; i += 1) {
    const idx = remainder.indexOf(separator);
    if (idx < 0) {
      parts.push(remainder);
      remainder = "";
      break;
    }
    parts.push(remainder.slice(0, idx));
    remainder = remainder.slice(idx + separator.length);
  }
  parts.push(remainder);
  return parts;
}

function parseBigInt(value: string | undefined) {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

async function loadMacheteRows(ids: string[], window: MacheteMatchWindow, userId?: string): Promise<CompareRow[]> {
  const parsed = ids.map(parseMacheteId);
  const scopes: SharedPlayerRowsScope[] = [];
  const seenScopeKeys = new Set<string>();
  for (const entry of parsed) {
    if (!entry.scope) continue;
    const key = `${entry.scope.leagueId}:${entry.scope.season}:${entry.scope.teamId}`;
    if (seenScopeKeys.has(key)) continue;
    seenScopeKeys.add(key);
    scopes.push(entry.scope);
  }
  if (scopes.length === 0) return [];

  const [rows, sportsPriceRefs] = await Promise.all([
    loadSharedMachetePlayerRows(prisma, { scopes, matchWindow: window, userId }),
    loadSportsRuFantasyPriceRefsByScopedPlayer(prisma, { scopes })
  ]);
  const byScopePlayer = new Map<string, SharedMachetePlayerRow>();
  for (const row of rows) {
    byScopePlayer.set(row.id, row);
  }

  return parsed
    .map((entry) => {
      const direct = byScopePlayer.get(entry.raw);
      if (direct) return mapMacheteRow(entry.raw, direct, sportsPriceRefs);
      if (entry.scope && entry.playerId) {
        const fallbackKey = `${entry.scope.leagueId}:${entry.scope.season}:${entry.scope.teamId}:${entry.playerId}`;
        const fallback = byScopePlayer.get(fallbackKey);
        if (fallback) return mapMacheteRow(entry.raw, fallback, sportsPriceRefs);
      }
      return null;
    })
    .filter((row): row is CompareRow => row !== null);
}

function mapMacheteRow(id: string, row: SharedMachetePlayerRow, sportsPriceRefs: Map<string, SportsRuFantasyPriceRef>): CompareRow {
  const sportsRef = sportsRuPriceRefForMacheteRowId(id, sportsPriceRefs) ?? sportsRuPriceRefForMacheteRowId(row.id, sportsPriceRefs);
  return {
    id,
    name: sportsRef?.playerName ?? row.name,
    teamName: row.teamName ?? null,
    teamShortName: row.teamShortName ?? null,
    leagueName: row.leagueName ?? null,
    position: sportsRef?.position ?? row.position,
    matchesPlayed: row.matchesPlayed,
    minutesPlayed: row.minutesPlayed,
    goals: row.goals,
    assists: row.assists,
    shotsOnTarget: row.shotsOnTarget,
    keyPasses: row.keyPasses,
    tackles: row.tackles,
    averageRating: row.averageRating,
    marketValue: null,
    fantasyScore: row.fantasyScore,
    scoringScore: row.scoringScore,
    alternativeScore: row.alternativeScore,
    recentFp: row.recentFp ?? []
  };
}

function sportsRuPriceRefForMacheteRowId(rowId: string, sportsPriceRefs: Map<string, SportsRuFantasyPriceRef>) {
  for (const key of sportsRuScopeKeysForMacheteRowId(rowId)) {
    const ref = sportsPriceRefs.get(key);
    if (ref) return ref;
  }
  return null;
}

function sportsRuScopeKeysForMacheteRowId(rowId: string) {
  if (rowId.startsWith("combined:")) return combinedSportsRuScopeKeysForMacheteRowId(rowId);

  const [leagueId, season, , playerId] = rowId.split(":");
  if (!leagueId || !season || !playerId) return [];
  return [sportsRuFantasyPriceScopeKey(leagueId, season, playerId)];
}

function combinedSportsRuScopeKeysForMacheteRowId(rowId: string) {
  const value = rowId.slice("combined:".length);
  const teamSeparatorIndex = value.indexOf(":");
  if (teamSeparatorIndex < 0) return [];

  const afterTeam = value.slice(teamSeparatorIndex + 1);
  const playerSeparatorIndex = afterTeam.indexOf(":");
  if (playerSeparatorIndex < 0) return [];

  const playerId = afterTeam.slice(0, playerSeparatorIndex);
  const competitions = afterTeam.slice(playerSeparatorIndex + 1).split("|");
  return competitions.flatMap((competition) => {
    const [leagueId, season] = splitOnce(competition, ":", 1);
    return leagueId && season ? [sportsRuFantasyPriceScopeKey(leagueId, season, playerId)] : [];
  });
}

async function loadBaltikaRows(ids: string[]): Promise<CompareRow[]> {
  const snapshots = await prisma.playerSnapshot.findMany({
    where: {
      id: { in: ids },
      teamImport: {
        status: ImportStatus.PUBLISHED,
        isCurrentPublished: true
      }
    },
    include: {
      team: true,
      league: true
    }
  });

  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  return ids
    .map((id) => {
      const snapshot = byId.get(id);
      if (!snapshot) return null;
      const row: CompareRow = {
        id: snapshot.id,
        name: snapshot.playerName,
        teamName: snapshot.team?.name ?? null,
        teamShortName: null,
        leagueName: snapshot.league?.name ?? null,
        position: snapshot.positionGroup ?? null,
        matchesPlayed: snapshot.matchesPlayed ?? null,
        minutesPlayed: snapshot.minutesPlayed ?? null,
        goals: snapshot.goals ?? null,
        assists: snapshot.assists ?? null,
        shotsOnTarget: null,
        keyPasses: null,
        tackles: null,
        averageRating: null,
        marketValue: snapshot.marketValue ?? null,
        fantasyScore: snapshot.fantasyScore ?? null,
        scoringScore: snapshot.scoringScore ?? null,
        alternativeScore: snapshot.alternativeScore ?? null,
        recentFp: []
      };
      return row;
    })
    .filter((row): row is CompareRow => row !== null);
}

function compareTeamDisplayName(row: Pick<CompareRow, "teamName" | "teamShortName">) {
  return compactTeamDisplayName({ name: row.teamName, shortName: row.teamShortName });
}
