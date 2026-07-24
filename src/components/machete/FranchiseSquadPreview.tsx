"use client";

import { Eye } from "lucide-react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { FdrRow } from "@/components/ui/fdr-pill";
import { cn } from "@/lib/cn";
import { formatNumber, formatScore, NULL_GLYPH } from "@/lib/format";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import type { AdminFranchiseSquadPreviewPlayer } from "@/machete/admin-franchise-squads";
import { fixtureChipPresentations } from "./fantasy-squad-ui";

export function FranchiseSquadPreview({
  players,
  ownerName
}: {
  players: AdminFranchiseSquadPreviewPlayer[];
  ownerName: string;
}) {
  const language = useLanguage();
  const starters = players
    .filter((player) => player.isStarter)
    .sort((left, right) => positionOrder(left.positionGroup) - positionOrder(right.positionGroup) || left.slotIndex - right.slotIndex);
  const bench = players
    .filter((player) => !player.isStarter)
    .sort((left, right) => Number(left.positionGroup === "GK") - Number(right.positionGroup === "GK") || left.slotIndex - right.slotIndex);
  const lines = [
    { position: "GK" as const, en: "Goalkeeper", ru: "Вратарь" },
    { position: "DEF" as const, en: "Defenders", ru: "Защитники" },
    { position: "MID" as const, en: "Midfielders", ru: "Полузащитники" },
    { position: "FWD" as const, en: "Forwards", ru: "Нападающие" }
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-inner" aria-label={localizedText(language, `Squad preview for ${ownerName}`, `Предпросмотр состава: ${ownerName}`)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold text-ink">
            <Eye className="h-4 w-4 text-sky-700" aria-hidden="true" />
            <I18nText en="Squad preview" ru="Предпросмотр состава" />
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">
            <I18nText
              en="Preview only; changes are available only in the squad owner's editor."
              ru="Только предпросмотр; изменения доступны только владельцу в его редакторе."
            />
          </p>
        </div>
        <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          <I18nText en="Read only" ru="Только просмотр" />
        </span>
      </div>

      <div className="rounded border border-emerald-300 bg-emerald-900 p-1.5 shadow-inner">
        <h5 className="mb-1 text-xs font-bold uppercase tracking-wide text-white">
          <I18nText en="Starting XI" ru="Стартовый состав" /> · {starters.length}
        </h5>
        <div className="relative overflow-hidden rounded border border-white/20 bg-emerald-800/80 px-1 py-1.5">
          <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t border-white/15" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
          <div className="relative space-y-1.5">
            {lines.map((line) => {
              const linePlayers = starters.filter((player) => player.positionGroup === line.position);
              return (
                <div key={line.position}>
                  <p className="mb-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-white/80">
                    {localizedText(language, line.en, line.ru)}
                  </p>
                  <div className="flex min-h-14 flex-wrap items-stretch justify-center gap-1 rounded p-0.5">
                    {linePlayers.map((player) => <PreviewPlayerCard key={player.playerId} player={player} />)}
                    {linePlayers.length === 0 ? (
                      <div className="flex min-h-12 w-24 items-center justify-center rounded border border-dashed border-white/25 bg-white/10 text-[11px] text-white/70">
                        <I18nText en="Empty" ru="Пусто" />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="my-1.5 h-px bg-slate-300" />

      <div className="rounded border border-slate-200 bg-white p-2">
        <h5 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <I18nText en="Bench" ru="Запас" /> · {bench.length}
        </h5>
        <div className="flex min-h-16 flex-wrap justify-center gap-1 sm:flex-nowrap">
          {bench.map((player) => <PreviewPlayerCard key={player.playerId} player={player} compact />)}
          {bench.length === 0 ? <p className="py-5 text-sm text-slate-500"><I18nText en="Empty" ru="Пусто" /></p> : null}
        </div>
      </div>
    </section>
  );
}

function PreviewPlayerCard({ player, compact = false }: { player: AdminFranchiseSquadPreviewPlayer; compact?: boolean }) {
  const language = useLanguage();
  const fp1 = firstForecast(player.roundPoints, player.predictedFp);
  const fp3 = horizonForecast(player.roundPoints, 3);
  const alt1 = firstForecast(player.alternativeRoundPoints, player.alternativePredictedFp);
  const alt3 = horizonForecast(player.alternativeRoundPoints, 3);
  const multiplier = player.isCaptain ? 2 : 1;
  const fixtures = fixtureChipPresentations(player.fixtures, player.fixtureDifficulties, 3, player.fixtureFullNames);
  const cardTitle = [
    player.name,
    localizedText(language, `Club: ${player.teamName}`, `Клуб: ${player.teamName}`),
    localizedText(language, `Expected minutes: ${player.expectedMinutes === null ? NULL_GLYPH : Math.round(player.expectedMinutes)}`, `Ожидаемые минуты: ${player.expectedMinutes === null ? NULL_GLYPH : Math.round(player.expectedMinutes)}`),
    player.isCaptain ? localizedText(language, "Captain: forecasts on the card are doubled.", "Капитан: прогнозы на карточке удвоены.") : null
  ].filter((line): line is string => Boolean(line)).join("\n");

  return (
    <article
      data-read-only-player-card="true"
      title={cardTitle}
      className={cn(
        compact ? "w-[3.8rem] 2xl:w-16" : "w-[3.8rem] 2xl:w-[4.25rem]",
        "relative cursor-default rounded border bg-white px-1 py-0.5 text-center shadow-sm",
        player.isCaptain ? "border-amber-400 ring-2 ring-amber-200" : "border-white/70"
      )}
    >
      <span className="absolute left-0.5 top-0.5 max-w-[1.5rem] truncate text-[7px] font-bold text-slate-500" title={player.teamName}>
        {player.teamShortName || player.teamName}
      </span>
      <div className="flex translate-x-1 items-center justify-center">
        <span className={cn("rounded px-0.5 py-px text-[7px] font-bold", positionPillClass(player.positionGroup))}>{player.positionGroup}</span>
      </div>
      <div className="relative mx-auto grid w-full grid-cols-[1fr_1.75rem_1fr] items-center">
        {player.isCaptain || player.isViceCaptain ? (
          <span className={cn("z-10 mr-0.5 justify-self-end rounded px-0.5 py-px text-[7px] font-black text-white shadow-sm", player.isCaptain ? "bg-amber-700" : "bg-slate-700")}>
            {player.isCaptain ? "C" : "VC"}
          </span>
        ) : <span aria-hidden="true" />}
        <div className="relative mx-auto mt-0.5 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-[9px] font-black text-slate-500 ring-1 ring-white">
          <span aria-hidden="true">{player.name.trim().slice(0, 1).toUpperCase()}</span>
          {player.photoUrl ? (
            <img
              src={player.photoUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onError={(event) => { event.currentTarget.style.display = "none"; }}
              className="absolute inset-0 h-full w-full bg-slate-100 object-cover object-top"
            />
          ) : null}
        </div>
        <span className="ml-0.5 justify-self-start whitespace-nowrap text-[7px] font-black text-ink num-tabular" title={localizedText(language, `Fantasy price: ${formatNumber(player.price, 1)}`, `Фэнтези-цена: ${formatNumber(player.price, 1)}`)}>
          {player.priceSource === "ESTIMATED" ? "~" : ""}{formatNumber(player.price, 1)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[9px] font-bold text-ink" title={player.name}>{compactPlayerDisplayName(player.name)}</p>
      <dl className="mt-0.5 text-[7px] leading-tight num-tabular">
        <div className="grid grid-cols-3 gap-x-px">
          <PreviewMetric label="FP1" ruLabel="ФО1" value={scaleForecast(fp1, multiplier)} color="text-emerald-700" />
          <PreviewMetric label="FP3" ruLabel="ФО3" value={scaleForecast(fp3, multiplier)} color="text-sky-700" />
          <PreviewMetric label="FFO" value={scaleForecast(player.foontasyPoints, multiplier)} color="text-cyan-700" />
        </div>
        <div className="mt-px grid grid-cols-2 gap-x-px px-1">
          <PreviewMetric label="ALT1" value={scaleForecast(alt1, multiplier)} color="text-amber-700" />
          <PreviewMetric label="ALT3" value={scaleForecast(alt3, multiplier)} color="text-violet-700" />
        </div>
      </dl>
      {fixtures.length > 0 ? (
        <div className="mt-0.5 flex min-w-0 items-center justify-center gap-px overflow-hidden">
          <FdrRow
            fixtures={fixtures.slice(0, 3)}
            className="min-w-0 flex-nowrap gap-px overflow-hidden [&_.fdr-pill]:min-w-0 [&_.fdr-pill]:max-w-[1.1rem] [&_.fdr-pill]:px-px [&_.fdr-pill]:text-[8px]"
          />
        </div>
      ) : null}
    </article>
  );
}

function PreviewMetric({ label, ruLabel, value, color }: { label: string; ruLabel?: string; value: number | null; color: string }) {
  return (
    <div className="min-w-0" title={`${label}: ${formatScore(value)}`}>
      <dt className="whitespace-nowrap text-[6px] font-semibold uppercase text-slate-500">{ruLabel ? <I18nText en={label} ru={ruLabel} /> : label}</dt>
      <dd className={cn("whitespace-nowrap text-[8px] font-bold", color)}>{compactScore(value)}</dd>
    </div>
  );
}

function firstForecast(values: Array<number | null>, fallback: number | null) {
  return values.length > 0 ? values[0] ?? null : fallback;
}

function horizonForecast(values: Array<number | null>, horizon: number) {
  const selected = values.slice(0, horizon);
  if (selected.length < horizon || selected.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;
  return selected.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function scaleForecast(value: number | null, multiplier: number) {
  return typeof value === "number" && Number.isFinite(value) ? value * multiplier : null;
}

function compactScore(value: number | null) {
  if (value === null || !Number.isFinite(value)) return NULL_GLYPH;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function positionOrder(position: AdminFranchiseSquadPreviewPlayer["positionGroup"]) {
  return position === "GK" ? 0 : position === "DEF" ? 1 : position === "MID" ? 2 : position === "FWD" ? 3 : 4;
}

function positionPillClass(position: AdminFranchiseSquadPreviewPlayer["positionGroup"]) {
  if (position === "GK") return "bg-amber-100 text-amber-800";
  if (position === "DEF") return "bg-sky-100 text-sky-800";
  if (position === "MID") return "bg-emerald-100 text-emerald-800";
  if (position === "FWD") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}
