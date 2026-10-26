"use client";
/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import { type UiLanguage } from "./planner-explanations";
import { type PlayerPoolOptionalColumn, playerPoolOptionalColumns, customPlayerPoolColumnValue } from "./PlayerPool";
import type { GlobalStrategyAnalysis } from "@/machete/global-strategy-planner";
import { localizedText } from "@/components/localized-option";
import { type FantasyPlannerPlayer } from "@/machete/squad_logic";
import type { SquadFilterPreset, SquadFilterPresetFilters } from "@/machete/squad-filter-presets";

export async function recordGlobalRecommendation(squadId: string | null, analysis: GlobalStrategyAnalysis) {
  if (!squadId || !["READY", "NEUTRAL"].includes(analysis.evaluation.status)) return;
  try {
    const response = await fetch("/api/machete/squads/global-strategy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ squadId, analysis }) });
    if (!response.ok) console.warn("Global strategy recommendation snapshot was not recorded.", response.status);
  } catch { console.warn("Global strategy recommendation snapshot request failed."); }
}

export async function downloadPlayerPoolXlsx(
  players: FantasyPlannerPlayer[],
  horizon: number,
  language: UiLanguage,
  leagueId: string,
  season: string,
  visibleColumnKeys: string[],
  provider = "SPORTS_RU"
) {
  const optionalColumnsByKey = new Map(playerPoolOptionalColumns(players, horizon, language, provider).map((column) => [column.key, column]));
  const selectedColumns = visibleColumnKeys
    .map((key) => optionalColumnsByKey.get(key))
    .filter((column): column is PlayerPoolOptionalColumn => Boolean(column));
  const columns = [
    { key: "player", header: localizedText(language, "Player", "Игрок") },
    { key: "team", header: localizedText(language, "Team", "Команда") },
    { key: "position", header: localizedText(language, "Position", "Позиция") },
    { key: "price", header: localizedText(language, "Price", "Цена") },
    ...selectedColumns.map((column) => ({ key: column.key, header: column.label }))
  ];
  const response = await fetch("/api/machete/squads/export-table", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    body: JSON.stringify({
      leagueId,
      season,
      provider,
      language,
      horizon,
      columns,
      rows: players.map((player) => ({
        player: provider === "FPL" ? player.name : player.fotmobName ?? player.name,
        team: player.teamName,
        position: player.positionGroup,
        price: player.price,
        ...Object.fromEntries(selectedColumns.map((column) => [
          column.key,
          playerPoolExportCellValue(column.key, player, horizon)
        ]))
      }))
    })
  });
  if (!response.ok) throw new Error("PLAYER_TABLE_EXPORT_FAILED");

  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `players-${leagueId}-${season.replaceAll("/", "-")}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export async function loadSquadFilterPresets(signal?: AbortSignal) {
  try {
    const response = await fetch("/api/user/saved-views?source=squad", { cache: "no-store", signal });
    if (!response.ok) return null;
    return squadFilterPresetsFromPayload(await response.json());
  } catch (error) {
    if ((error as Error).name === "AbortError") return null;
    return null;
  }
}

export async function saveSquadFilterPreset(name: string, filters: SquadFilterPresetFilters) {
  try {
    const href = `squad-filter:${encodeURIComponent(name.trim().toLocaleLowerCase())}`;
    const response = await fetch("/api/user/saved-views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "squad", name: name.trim().slice(0, 60), href, filters })
    });
    if (!response.ok) return null;
    return squadFilterPresetsFromPayload(await response.json());
  } catch {
    return null;
  }
}

export async function removeSquadFilterPreset(id: string) {
  try {
    const params = new URLSearchParams({ source: "squad", id });
    const response = await fetch(`/api/user/saved-views?${params.toString()}`, { method: "DELETE" });
    if (!response.ok) return null;
    return squadFilterPresetsFromPayload(await response.json());
  } catch {
    return null;
  }
}

export function squadFilterPresetsFromPayload(payload: unknown): SquadFilterPreset[] | null {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { views?: unknown }).views)) return null;
  const result: SquadFilterPreset[] = [];
  for (const item of (payload as { views: unknown[] }).views) {
    if (!item || typeof item !== "object") continue;
    const preset = item as Partial<SquadFilterPreset>;
    if (typeof preset.id !== "string" || typeof preset.name !== "string" || typeof preset.createdAt !== "string" || typeof preset.updatedAt !== "string" || !preset.filters) continue;
    result.push(preset as SquadFilterPreset);
  }
  return result.slice(0, 20);
}

export function playerPoolExportCellValue(key: string, player: FantasyPlannerPlayer, horizon: number) {
  if (key === "fixtures") return player.fixtures.slice(0, horizon).join(" | ");
  const value = customPlayerPoolColumnValue(key, player, horizon);
  if (typeof value !== "number") return value;
  if (["startProbability", "sixtyProbability", "fullMatchProbability", "forecastConfidence"].includes(key) || /(?:appearance|sixty|full_match)_(?:probability|rate)/.test(key)) {
    return value * 100;
  }
  return value;
}
