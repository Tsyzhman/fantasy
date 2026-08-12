"use client";

import { CheckCircle2, Link2, Save, XCircle } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { SortableTable } from "@/components/sortable-table";
import { formatNumber } from "@/lib/format";
import type { SportsRuTeamMappingRow } from "@/machete/sports_ru_player_mapping";

type FotMobRosterOption = {
  playerId: string;
  name: string;
  position: string | null;
};

type SportsRuPlayerMappingPanelProps = {
  rows: SportsRuTeamMappingRow[];
  roster: FotMobRosterOption[];
  canEdit: boolean;
  contestId?: string | null;
};

export function SportsRuPlayerMappingPanel({ rows, roster, canEdit, contestId }: SportsRuPlayerMappingPanelProps) {
  const language = useLanguage();
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((row) => [row.priceId, row.mappedPlayerId ?? ""]))
  );
  const [savedRows, setSavedRows] = useState<Record<string, { status: string; matchedBy: string | null; confidence: number | null }>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const summary = useMemo(() => {
    const matched = rows.filter((row) => (savedRows[row.priceId]?.status ?? row.status) === "MATCHED").length;
    return {
      matched,
      total: rows.length
    };
  }, [rows, savedRows]);

  function updateDraft(priceId: string, playerId: string) {
    setDrafts((current) => ({ ...current, [priceId]: playerId }));
  }

  function saveMapping(row: SportsRuTeamMappingRow) {
    const selectedContestId = row.contestId ?? contestId ?? null;
    if (!selectedContestId) {
      setMessage(localizedText(language, "Fantasy contest is not synchronized.", "Фэнтези-контест ещё не синхронизирован."));
      return;
    }
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/machete/sports-ru-player-mappings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: row.priceId,
          playerId: drafts[row.priceId] || null,
          contestId: selectedContestId
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(language === "ru" ? localizedText(language, "Failed to save mapping.", "Не удалось сохранить сопоставление.") : payload?.error?.message ?? localizedText(language, "Failed to save mapping.", "Не удалось сохранить сопоставление."));
        return;
      }
      setSavedRows((current) => ({
        ...current,
        [row.priceId]: {
          status: payload.mapping?.status ?? "MATCHED",
          matchedBy: payload.mapping?.matchedBy ?? "MANUAL",
          confidence: payload.mapping?.confidence ?? null
        }
      }));
      const selectionSync = payload.mapping?.selectionSync;
      const syncedSelections =
        Number(selectionSync?.movedSelections ?? 0) +
        Number(selectionSync?.refreshedSelections ?? 0) +
        Number(selectionSync?.removedDuplicateSelections ?? 0);
      setMessage(
        syncedSelections > 0
          ? localizedText(language, `Mapping saved. Synced ${syncedSelections} squad selections.`, `Сопоставление сохранено. Обновлено записей состава: ${syncedSelections}.`)
          : localizedText(language, "Mapping saved.", "Сопоставление сохранено.")
      );
    });
  }

  if (rows.length === 0) {
    return (
      <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-ink"><I18nText en="Sports.ru to FotMob mapping" ru="Сопоставление Sports.ru с FotMob" /></h2>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          <I18nText
            en="No Sports.ru price rows are linked to this team yet. Import Sports.ru fantasy prices first, then return here."
            ru="К этой команде пока не привязаны строки цен Sports.ru. Сначала импортируйте фэнтези-цены Sports.ru, затем вернитесь сюда."
          />
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-ink"><I18nText en="Sports.ru to FotMob mapping" ru="Сопоставление Sports.ru с FotMob" /></h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <I18nText
              en={<>{summary.matched}/{summary.total} mapped. Manual links are reused by the squad picker and future price imports.</>}
              ru={<>{summary.matched}/{summary.total} сопоставлено. Ручные связи используются в планировщике состава и будущих импортах цен.</>}
            />
          </p>
        </div>
        {message ? <span className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</span> : null}
      </div>

      <div className="mt-4 overflow-hidden rounded border border-slate-200">
        <SortableTable className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">Sports.ru</th>
              <th className="px-3 py-3 text-right"><I18nText en="Price" ru="Цена" /></th>
              <th className="px-3 py-3"><I18nText en="FotMob roster player" ru="Игрок состава FotMob" /></th>
              <th className="px-3 py-3"><I18nText en="Status" ru="Статус" /></th>
              {canEdit ? <th className="w-20 px-3 py-3" data-sort-disabled="true" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const saved = savedRows[row.priceId];
              const status = saved?.status ?? row.status;
              const confidence = saved?.confidence ?? row.confidence;
              const draftPlayerId = drafts[row.priceId] ?? row.mappedPlayerId ?? "";
              const bestCandidate = row.candidates[0];
              return (
                <tr key={row.priceId} className={status === "MATCHED" ? "bg-emerald-50/50" : "hover:bg-slate-50"}>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-ink">{row.sportsName}</p>
                    <p className="text-xs text-slate-500">
                      {[row.sportsPosition, row.sportsTeamName || null, row.sportsNormalizedName].filter(Boolean).join(" / ")}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-ink">{formatNumber(row.price, 1)}</td>
                  <td className="min-w-[240px] px-3 py-3">
                    {canEdit ? (
                      <select
                        value={draftPlayerId}
                        onChange={(event) => updateDraft(row.priceId, event.target.value)}
                        className="w-full rounded border border-slate-200 px-3 py-2"
                      >
                        <option value="">{localizedText(language, "Not mapped", "Не сопоставлен")}</option>
                        {row.candidates.length > 0 ? (
                          <optgroup label={localizedText(language, "Best candidates", "Лучшие кандидаты")}>
                            {row.candidates.slice(0, 5).map((candidate) => (
                              <option key={`candidate:${candidate.playerId}`} value={candidate.playerId}>
                                {candidate.playerName} / {candidate.position ?? "-"} / {Math.round(candidate.confidence * 100)}%
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                        <optgroup label={localizedText(language, "Full FotMob roster", "Полный состав FotMob")}>
                          {roster.map((player) => (
                            <option key={player.playerId} value={player.playerId}>
                              {player.name} / {player.position ?? "-"}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    ) : (
                      <div>
                        <p className="font-medium text-ink">{row.mappedPlayerName ?? localizedText(language, "Not mapped", "Не сопоставлен")}</p>
                        {bestCandidate ? (
                          <p className="text-xs text-slate-500">
                            <I18nText
                              en={<>Best candidate: {bestCandidate.playerName} ({Math.round(bestCandidate.confidence * 100)}%)</>}
                              ru={<>Лучший кандидат: {bestCandidate.playerName} ({Math.round(bestCandidate.confidence * 100)}%)</>}
                            />
                          </p>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${status === "MATCHED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                      {status === "MATCHED" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      {status}
                    </span>
                    <p className="mt-1 text-xs text-slate-500">
                      {saved?.matchedBy ?? row.matchedBy ?? "candidate"} {confidence !== null ? `/ ${Math.round(confidence * 100)}%` : ""}
                    </p>
                  </td>
                  {canEdit ? (
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => saveMapping(row)}
                        disabled={isPending}
                        className="inline-flex h-9 w-9 items-center justify-center rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        aria-label={localizedText(language, "Save mapping", "Сохранить сопоставление")}
                      >
                        <Save className="h-4 w-4" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
      </div>
    </section>
  );
}
