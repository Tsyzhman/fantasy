"use client";

import { ChevronLeft, ChevronRight, Crosshair, Layers3, Shield, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { LocalizedOption, localizedText, useLanguage } from "@/components/localized-option";
import { SortableTable } from "@/components/sortable-table";
import { FOTMOB_PITCH_LENGTH_METERS, FOTMOB_PITCH_WIDTH_METERS, normalized_shot_axis_coordinate } from "@/lib/shot-coordinates";
import type { ShotMapShot } from "@/lib/shot-maps";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import { shotMatchesSituationFilter, type ShotSituationFilter } from "@/mixer/shot-filters";
import { buildShotHeatField, heatColor, type ShotHeatField } from "@/mixer/shot-heatmap";

type ShotMapExplorerProps = {
  teamShots: ShotMapShot[];
  playerShots: ShotMapShot[];
  overlayShots: {
    attacking: ShotMapShot[];
    conceded: ShotMapShot[];
  };
  zoneSummary: {
    attacking: ZoneSummary;
    conceded: ZoneSummary;
  };
};

type ZoneSummary = {
  left_shots: number;
  center_shots: number;
  right_shots: number;
  left_xg: number;
  center_xg: number;
  right_xg: number;
};

type Mode = "for" | "against" | "overlay" | "player";
type ShotLayer = {
  key: string;
  label: string;
  shots: ShotMapShot[];
  tone: "attacking" | "conceded" | "player";
};

export function ShotMapExplorer({
  teamShots,
  playerShots,
  overlayShots,
  zoneSummary
}: ShotMapExplorerProps) {
  const language = useLanguage();
  const [mode, setMode] = useState<Mode>("overlay");
  const [goalsOnly, setGoalsOnly] = useState(false);
  const [onTargetOnly, setOnTargetOnly] = useState(false);
  const [showHeat, setShowHeat] = useState(true);
  const [showTeamShots, setShowTeamShots] = useState(true);
  const [showConceded, setShowConceded] = useState(true);
  const [situation, setSituation] = useState<ShotSituationFilter>("all");
  const [activeShotIndex, setActiveShotIndex] = useState(0);

  const layers = useMemo(() => {
    const selectedShotIds = new Set(playerShots.map((shot) => shot.id));
    const selectedPlayerRefs = new Set(playerShots.flatMap((shot) => [shot.player_id, shot.provider_player_id]).filter((value): value is string => Boolean(value)));

    if (mode === "against") return [{ key: "against", label: localizedText(language, "Team B conceded", "Команда B допускает"), shots: filterShots(overlayShots.conceded), tone: "conceded" as const }];
    if (mode === "player") return [{ key: "player", label: localizedText(language, "Selected player shots", "Удары выбранного игрока"), shots: filterShots(playerShots), tone: "player" as const }];
    if (mode === "for") return attackingLayers("for", localizedText(language, "Team shots for", "Удары команды"), teamShots);

    return [
      ...attackingLayers("overlay-for", localizedText(language, "Team A attacking", "Команда А атакует"), overlayShots.attacking),
      ...(showConceded
        ? [
            {
              key: "overlay-against",
              label: localizedText(language, "Team B conceded", "Команда B допускает"),
              shots: filterShots(overlayShots.conceded),
              tone: "conceded" as const
            }
          ]
        : [])
    ];

    function filterShots(shots: ShotMapShot[]) {
      return shots.filter((shot) => {
        if (goalsOnly && !shot.is_goal) return false;
        if (onTargetOnly && !shot.is_on_target) return false;
        if (!shotMatchesSituationFilter(shot.situation, situation)) return false;
        return true;
      });
    }

    function attackingLayers(key: string, label: string, shots: ShotMapShot[]): ShotLayer[] {
      const filteredShots = filterShots(shots);
      const selected = filteredShots.filter(isSelectedPlayerShot);
      const teammates = filteredShots.filter((shot) => !isSelectedPlayerShot(shot));

      return [
        ...(showTeamShots ? [{ key, label, shots: teammates, tone: "attacking" as const }] : []),
        ...(selected.length > 0
          ? [
              {
                key: `${key}-selected-player`,
                label: localizedText(language, "Selected player shots", "Удары выбранного игрока"),
                shots: selected,
                tone: "player" as const
              }
            ]
          : [])
      ];
    }

    function isSelectedPlayerShot(shot: ShotMapShot) {
      if (selectedShotIds.has(shot.id)) return true;
      return selectedPlayerRefs.has(shot.player_id ?? "") || selectedPlayerRefs.has(shot.provider_player_id ?? "");
    }
  }, [goalsOnly, language, mode, onTargetOnly, overlayShots.attacking, overlayShots.conceded, playerShots, showConceded, showTeamShots, situation, teamShots]);

  const visibleShots = layers.flatMap((layer) => layer.shots);
  const heatField = useMemo(
    () => (showHeat ? buildShotHeatField(visibleShots.map(shotToHeatPoint), {
      left: PITCH_FIELD_X,
      top: PITCH_FIELD_Y,
      width: PITCH_FIELD_WIDTH,
      height: PITCH_FIELD_HEIGHT
    }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleShots is derived from the memoized layers
    [showHeat, layers]
  );
  const sequenceShots = useMemo(() => orderShotsForSequence(visibleShots), [visibleShots]);
  const activeSequenceIndex = sequenceShots.length ? activeShotIndex % sequenceShots.length : 0;
  const activeSequenceShot = sequenceShots[activeSequenceIndex] ?? null;
  const totalXg = visibleShots.reduce((total, shot) => total + (shot.xg ?? 0), 0);
  const shooterSummaries = summarizeShooters(visibleShots, language);
  const topShooterSummaries = shooterSummaries.slice(0, 8);
  const switchActiveShot = (direction: -1 | 1) => {
    setActiveShotIndex((current) => (sequenceShots.length ? (current + direction + sequenceShots.length) % sequenceShots.length : 0));
  };

  return (
    <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <ModeButton active={mode === "for"} onClick={() => setMode("for")} icon={<Crosshair className="h-4 w-4" />} label={<I18nText en="A attack" ru="Атака A" />} />
            <ModeButton active={mode === "against"} onClick={() => setMode("against")} icon={<Shield className="h-4 w-4" />} label={<I18nText en="B conceded" ru="Допущено B" />} />
            <ModeButton active={mode === "overlay"} onClick={() => setMode("overlay")} icon={<Layers3 className="h-4 w-4" />} label={<I18nText en="Overlay" ru="Оверлей" />} />
            <ModeButton active={mode === "player"} onClick={() => setMode("player")} icon={<UserRound className="h-4 w-4" />} label={<I18nText en="Player" ru="Игрок" />} />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <label className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1">
              <input type="checkbox" checked={goalsOnly} onChange={(event) => setGoalsOnly(event.target.checked)} />
              <I18nText en="Goals" ru="Голы" />
            </label>
            <label className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1">
              <input type="checkbox" checked={onTargetOnly} onChange={(event) => setOnTargetOnly(event.target.checked)} />
              <I18nText en="SOT" ru="В створ" />
            </label>
            <label className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1">
              <input type="checkbox" checked={showHeat} onChange={(event) => setShowHeat(event.target.checked)} />
              <I18nText en="Heatmap" ru="Тепловая карта" />
            </label>
            {mode === "for" || mode === "overlay" ? (
              <label className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1">
                <input type="checkbox" checked={showTeamShots} onChange={(event) => setShowTeamShots(event.target.checked)} />
                <I18nText en="A layer" ru="Слой A" />
              </label>
            ) : null}
            {mode === "overlay" ? (
              <label className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1">
                <input type="checkbox" checked={showConceded} onChange={(event) => setShowConceded(event.target.checked)} />
                <I18nText en="B conceded" ru="Допущено B" />
              </label>
            ) : null}
            <div className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => switchActiveShot(-1)}
                disabled={sequenceShots.length === 0}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                aria-label={localizedText(language, "Previous shot", "Предыдущий удар")}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => switchActiveShot(1)}
                disabled={sequenceShots.length === 0}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                aria-label={localizedText(language, "Next shot", "Следующий удар")}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-12 px-1 text-right text-xs font-semibold text-slate-500 num-tabular">
                {sequenceShots.length ? `${activeSequenceIndex + 1}/${sequenceShots.length}` : "0/0"}
              </span>
            </div>
            <select value={situation} onChange={(event) => setSituation(event.target.value as ShotSituationFilter)} className="rounded border border-slate-200 px-2 py-1">
              <LocalizedOption value="all" en="All situations" ru="Все ситуации" />
              <LocalizedOption value="open_play" en="Open play" ru="С игры" />
              <LocalizedOption value="set_piece" en="Set piece" ru="Стандарт" />
              <LocalizedOption value="penalty" en="Penalty" ru="Пенальти" />
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <LegendItem tone="attacking" label="A" />
          <LegendItem tone="conceded" label="B" />
          <LegendItem tone="player" label={localizedText(language, "Player", "Игрок")} />
          <OutcomeKey color="bg-emerald-500" label={localizedText(language, "Goal", "Гол")} />
          <OutcomeKey color="bg-amber-400" label={localizedText(language, "SOT", "В створ")} />
          <OutcomeKey color="bg-violet-500" label={localizedText(language, "Blocked", "Заблокирован")} />
          {showHeat ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-8 rounded-full bg-gradient-to-r from-[#fde68a] via-[#f97316] to-[#dc2626]" />
              <I18nText en="Heat (xG-weighted)" ru="Плотность (вес — xG)" />
            </span>
          ) : null}
        </div>

        <div className="mt-3 overflow-x-auto">
          <ShotPitchPanel
            layers={layers}
            activeShotId={activeSequenceShot?.id ?? null}
            compact={false}
            language={language}
            heatField={heatField}
          />
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-base font-semibold text-ink"><I18nText en="Top shooters" ru="Топ бьющих" /></h2>
            <p className="text-xs text-slate-500">
              <I18nText en={`${visibleShots.length} shots · ${shooterSummaries.length} players`} ru={`${visibleShots.length} ударов · игроков: ${shooterSummaries.length}`} />
            </p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <SortableTable className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2"><I18nText en="Player" ru="Игрок" /></th>
                  <th className="px-3 py-2"><I18nText en="Position" ru="Позиция" /></th>
                  <th className="px-3 py-2"><I18nText en="Team" ru="Команда" /></th>
                  <th className="px-3 py-2 text-right"><I18nText en="Shots" ru="Удары" /></th>
                  <th className="px-3 py-2 text-right">xG</th>
                  <th className="px-3 py-2 text-right"><I18nText en="Goals" ru="Голы" /></th>
                  <th className="px-3 py-2 text-right"><I18nText en="On target" ru="В створ" /></th>
                  <th className="px-3 py-2"><I18nText en="Last shot" ru="Последний удар" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topShooterSummaries.map((summary) => (
                  <tr key={summary.key} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-ink" title={summary.playerName}>{compactPlayerDisplayName(summary.playerName)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{summary.position}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{summary.teamName}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-ink">{summary.shots}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{summary.xg.toFixed(2)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{summary.goals}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{summary.onTarget}</td>
                    <td className="min-w-48 px-3 py-2 text-slate-600">{summary.lastShot}</td>
                  </tr>
                ))}
                {topShooterSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                      <I18nText en="No shooter stats for the current layer and filters." ru="Нет статистики бьющих по текущему слою и фильтрам." />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </SortableTable>
          </div>
        </div>
      </section>

      <aside>
        <section className="rounded border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase text-slate-500"><I18nText en="Summary" ru="Сводка" /></p>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-slate-500"><I18nText en="Shots" ru="Удары" /></dt>
              <dd className="mt-1 text-lg font-bold text-ink">{visibleShots.length}</dd>
            </div>
            <div>
              <dt className="text-slate-500">xG</dt>
              <dd className="mt-1 text-lg font-bold text-ink">{totalXg.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-slate-500"><I18nText en="Goals" ru="Голы" /></dt>
              <dd className="mt-1 text-lg font-bold text-ink">{visibleShots.filter((shot) => shot.is_goal).length}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-2 text-xs text-slate-500">
            {layers.map((layer) => (
              <div key={layer.key} className="flex items-center justify-between gap-3">
                <LegendItem tone={layer.tone} label={compactLayerLabel(layer, language)} />
                <span className="font-semibold text-slate-600">{layer.shots.length}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase text-slate-500"><I18nText en="Zones" ru="Зоны" /></p>
            <ZoneTable title={<I18nText en="A attack" ru="Атака A" />} summary={zoneSummary.attacking} />
            <ZoneTable title={<I18nText en="B conceded" ru="Допущено B" />} summary={zoneSummary.conceded} />
          </div>
        </section>
      </aside>
    </div>
  );
}

function summarizeShooters(shots: ShotMapShot[], language: "en" | "ru") {
  const summaries = new Map<
    string,
    {
      key: string;
      playerName: string;
      positionValues: string[];
      teamName: string;
      shots: number;
      xg: number;
      goals: number;
      onTarget: number;
      latestTimestamp: number;
      lastShot: string;
    }
  >();

  for (const shot of shots) {
    const key = [shot.player_id ?? shot.provider_player_id ?? shot.player_name ?? "unknown", shot.team_id ?? shot.provider_team_id ?? shot.team_name ?? ""].join(":");
    const existing = summaries.get(key) ?? {
      key,
      playerName: shot.player_name ?? localizedText(language, "Unknown shooter", "Неизвестный игрок"),
      positionValues: [],
      teamName: shot.team_name ?? localizedText(language, "Unknown team", "Неизвестная команда"),
      shots: 0,
      xg: 0,
      goals: 0,
      onTarget: 0,
      latestTimestamp: 0,
      lastShot: ""
    };

    existing.shots += 1;
    existing.xg += shot.xg ?? 0;
    existing.goals += shot.is_goal ? 1 : 0;
    existing.onTarget += shot.is_on_target ? 1 : 0;
    const position = shot.player_position?.trim();
    if (position && !existing.positionValues.includes(position)) existing.positionValues.push(position);

    const timestamp = shot.match_date ? new Date(shot.match_date).getTime() : 0;
    if (timestamp >= existing.latestTimestamp) {
      existing.latestTimestamp = timestamp;
      existing.lastShot = [
        shot.minute !== null ? `${shot.minute}${shot.added_time ? `+${shot.added_time}` : ""}'` : null,
        shot.xg !== null ? `${shot.xg.toFixed(2)} xG` : null,
        shot.event_type,
        shot.match_label
      ].filter(Boolean).join(" | ");
    }

    summaries.set(key, existing);
  }

  return [...summaries.values()]
    .map((summary) => ({
      ...summary,
      position: summary.positionValues.length > 0 ? summary.positionValues.join(", ") : "-"
    }))
    .sort((left, right) => right.shots - left.shots || right.xg - left.xg || left.playerName.localeCompare(right.playerName));
}

function orderShotsForSequence(shots: ShotMapShot[]) {
  return [...shots].sort((left, right) => {
    const leftDate = left.match_date ? new Date(left.match_date).getTime() : 0;
    const rightDate = right.match_date ? new Date(right.match_date).getTime() : 0;
    return (
      leftDate - rightDate ||
      (left.minute ?? 0) - (right.minute ?? 0) ||
      (left.added_time ?? 0) - (right.added_time ?? 0) ||
      left.id.localeCompare(right.id)
    );
  });
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold ${
        active ? "bg-ink text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ZoneTable({ title, summary }: { title: ReactNode; summary: ZoneSummary }) {
  const total = summary.left_shots + summary.center_shots + summary.right_shots;
  const rows = [
    [<I18nText key="left" en="Left" ru="Слева" />, summary.left_shots, summary.left_xg],
    [<I18nText key="center" en="Center" ru="Центр" />, summary.center_shots, summary.center_xg],
    [<I18nText key="right" en="Right" ru="Справа" />, summary.right_shots, summary.right_xg]
  ] as const;

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-2 divide-y divide-slate-100 text-sm">
        {rows.map(([label, shots, xg], index) => (
          <div key={index} className="grid grid-cols-[1fr_auto_auto] gap-3 py-2">
            <span className="text-slate-600">{label}</span>
            <span className="font-semibold text-ink">{total ? Math.round((shots / total) * 100) : 0}%</span>
            <span className="text-slate-500">{xg.toFixed(2)} xG</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendItem({ tone, label }: { tone: "attacking" | "conceded" | "player"; label: string }) {
  return (
    <p className="flex items-center gap-2">
      <span className={legendDotClassName(tone)} />
      {label}
    </p>
  );
}

function compactLayerLabel(layer: ShotLayer, language: "en" | "ru") {
  if (layer.tone === "player") return localizedText(language, "Player", "Игрок");
  if (layer.tone === "conceded") return localizedText(language, "B conceded", "Допущено B");
  return localizedText(language, "A attack", "Атака A");
}

function ShotPitchPanel({
  title,
  layers,
  activeShotId,
  compact = true,
  language,
  heatField = null
}: {
  title?: ReactNode;
  layers: ShotLayer[];
  activeShotId: string | null;
  compact?: boolean;
  language: "en" | "ru";
  heatField?: ShotHeatField | null;
}) {
  const shotCount = layers.reduce((total, layer) => total + layer.shots.length, 0);
  const frameClassName = compact
    ? "relative aspect-[680/368] min-h-[220px] w-full overflow-hidden rounded border border-emerald-800 bg-emerald-800 shadow-inner"
    : "relative mx-auto aspect-[680/368] min-h-[260px] w-full min-w-[360px] max-w-[980px] overflow-hidden rounded border border-emerald-800 bg-emerald-800 shadow-inner";

  return (
    <div>
      {title ? (
        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>{title}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 num-tabular">{shotCount}</span>
        </div>
      ) : null}
      <div className={frameClassName}>
        <ShotPitchSvg layers={layers} activeShotId={activeShotId} language={language} heatField={heatField} />
        {shotCount === 0 ? (
          <div className="absolute inset-0 grid place-items-center bg-[#121619]/75 text-sm font-semibold text-[#f3f1ea]">
            <I18nText en="No shots for current filters" ru="Нет ударов по текущим фильтрам" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ShotPitchSvg({ layers, activeShotId, language, heatField = null }: { layers: ShotLayer[]; activeShotId: string | null; language: "en" | "ru"; heatField?: ShotHeatField | null }) {
  const penaltyArea = pitchRectFromCenterWidth(PENALTY_AREA_WIDTH_METERS, PENALTY_AREA_DEPTH_METERS);
  const sixYardBox = pitchRectFromCenterWidth(SIX_YARD_BOX_WIDTH_METERS, SIX_YARD_BOX_DEPTH_METERS);
  const goal = goalMouthRect();
  const penaltySpot = pitchPoint(CENTER_Y_METERS, FOTMOB_PITCH_LENGTH_METERS - PENALTY_SPOT_DISTANCE_METERS);
  const penaltyArc = penaltyArcPath();
  const zoneLineOne = pitchXFromFotMobY(FOTMOB_PITCH_WIDTH_METERS / 3);
  const zoneLineTwo = pitchXFromFotMobY((FOTMOB_PITCH_WIDTH_METERS * 2) / 3);

  return (
    <svg className="h-full w-full" viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_HEIGHT}`} role="img" aria-label={localizedText(language, "Pitch", "Поле")}>
      <defs>
        <pattern id="pitch-stripes" width={PITCH_FIELD_WIDTH / 5} height={PITCH_HEIGHT} patternUnits="userSpaceOnUse">
          <rect width={PITCH_FIELD_WIDTH / 10} height={PITCH_HEIGHT} fill="#047857" opacity="0.35" />
          <rect x={PITCH_FIELD_WIDTH / 10} width={PITCH_FIELD_WIDTH / 10} height={PITCH_HEIGHT} fill="#065f46" opacity="0.28" />
        </pattern>
        <filter id="shot-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor="#052e16" floodOpacity="0.36" />
        </filter>
        <clipPath id="pitch-field-clip">
          <rect x={PITCH_FIELD_X} y={PITCH_FIELD_Y} width={PITCH_FIELD_WIDTH} height={PITCH_FIELD_HEIGHT} rx="8" />
        </clipPath>
        <filter id="heat-blur" x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur stdDeviation="13" />
        </filter>
      </defs>

      <rect width={PITCH_WIDTH} height={PITCH_HEIGHT} fill="#047857" />
      <rect width={PITCH_WIDTH} height={PITCH_HEIGHT} fill="url(#pitch-stripes)" />
      <g fill="none" stroke="rgba(255,255,255,0.76)" strokeLinecap="round" strokeWidth="3">
        <rect x={PITCH_FIELD_X} y={PITCH_FIELD_Y} width={PITCH_FIELD_WIDTH} height={PITCH_FIELD_HEIGHT} />
        <path d={`M${penaltyArea.x} ${penaltyArea.y}V${penaltyArea.y + penaltyArea.height}H${penaltyArea.x + penaltyArea.width}V${penaltyArea.y}`} />
        <path d={`M${sixYardBox.x} ${sixYardBox.y}V${sixYardBox.y + sixYardBox.height}H${sixYardBox.x + sixYardBox.width}V${sixYardBox.y}`} />
        <path d={`M${goal.x} ${PITCH_FIELD_Y}V${goal.y}H${goal.x + goal.width}V${PITCH_FIELD_Y}`} />
        <circle cx={penaltySpot.x} cy={penaltySpot.y} r="4" fill="rgba(255,255,255,0.82)" stroke="none" />
        <path d={penaltyArc} strokeOpacity="0.5" />
      </g>
      <g fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5">
        <path d={`M${zoneLineOne} ${PITCH_FIELD_Y}V${PITCH_FIELD_Y + PITCH_FIELD_HEIGHT}`} />
        <path d={`M${zoneLineTwo} ${PITCH_FIELD_Y}V${PITCH_FIELD_Y + PITCH_FIELD_HEIGHT}`} />
      </g>

      {heatField && heatField.cells.length > 0 ? <ShotHeatLayer heatField={heatField} /> : null}

      {layers.map((layer) =>
        layer.shots.map((shot, index) => (
          <ShotMarker key={`${layer.key}-${shot.id}-${index}`} layer={layer} shot={shot} active={shot.id === activeShotId} />
        ))
      )}
    </svg>
  );
}

function ShotHeatLayer({ heatField }: { heatField: ShotHeatField }) {
  return (
    <g clipPath="url(#pitch-field-clip)" filter="url(#heat-blur)">
      {heatField.cells.map((cell, index) => (
        <circle
          key={index}
          cx={cell.cx}
          cy={cell.cy}
          r={heatField.cellRadius}
          fill={heatColor(cell.intensity)}
          opacity={0.14 + 0.5 * cell.intensity}
        />
      ))}
    </g>
  );
}

/** Heat input reuses the marker display geometry; intensity is xG-weighted. */
function shotToHeatPoint(shot: ShotMapShot) {
  const marker = shotMarkerGeometry(shot);
  return { x: marker.x, y: marker.y, weight: Math.max(shot.xg ?? 0.05, 0.02) };
}

function ShotMarker({ layer, shot, active }: { layer: ShotLayer; shot: ShotMapShot; active: boolean }) {
  const marker = shotMarkerGeometry(shot);
  const fill = markerFill(shot);
  const stroke = markerStroke(layer.tone);
  const strokeWidth = layer.tone === "player" ? 3 : 2;
  const opacity = layer.tone === "conceded" ? 0.86 : 0.96;

  // Shape by layer: attacking shots are circles, conceded shots are diamonds.
  const isSetPiece = (shot.situation ?? "").toLowerCase().includes("penalty") || (shot.event_type ?? "").toLowerCase().includes("penalty");

  return (
    <g className="transition-transform hover:scale-125" filter="url(#shot-shadow)" opacity={opacity} style={{ transformOrigin: `${marker.x}px ${marker.y}px` }}>
      <title>{shotTooltip(shot, layer.label)}</title>
      {active ? (
        <>
          <circle cx={marker.x} cy={marker.y} r={marker.radius + 13} fill="#fef08a" opacity="0.2" />
          <circle cx={marker.x} cy={marker.y} r={marker.radius + 8} fill="none" stroke="#fef08a" strokeWidth="4" />
        </>
      ) : null}
      {layer.tone === "conceded" ? (
        <rect
          x={marker.x - marker.radius}
          y={marker.y - marker.radius}
          width={marker.radius * 2}
          height={marker.radius * 2}
          rx="2"
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          transform={`rotate(45 ${marker.x} ${marker.y})`}
        />
      ) : (
        <circle cx={marker.x} cy={marker.y} r={marker.radius} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      )}
      {isSetPiece ? (
        <circle cx={marker.x} cy={marker.y} r={marker.radius + 4} fill="none" stroke="#fcd34d" strokeOpacity="0.88" strokeWidth="2" />
      ) : null}
      {layer.tone === "player" ? (
        <circle cx={marker.x} cy={marker.y} r={marker.radius + 6} fill="none" stroke="rgba(236,253,245,0.92)" strokeWidth="2" />
      ) : null}
    </g>
  );
}

function OutcomeKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-full border border-white shadow-sm ${color}`} />
      <span>{label}</span>
    </span>
  );
}

function legendDotClassName(tone: "attacking" | "conceded" | "player") {
  if (tone === "conceded") return "h-3 w-3 rotate-45 rounded-[3px] border border-white bg-indigo-600 opacity-80 shadow-sm";
  if (tone === "player") return "h-3 w-3 rounded-full border border-emerald-950/60 bg-emerald-300 shadow-sm ring-2 ring-white";
  return "h-3 w-3 rounded-full border border-white bg-rose-500 shadow-sm";
}

const FOTMOB_FINAL_THIRD_START_X_METERS = 70;
const CENTER_Y_METERS = FOTMOB_PITCH_WIDTH_METERS / 2;
const SHOTMAP_DEPTH_METERS = FOTMOB_PITCH_LENGTH_METERS - FOTMOB_FINAL_THIRD_START_X_METERS;
const PENALTY_AREA_DEPTH_METERS = 16.5;
const PENALTY_AREA_WIDTH_METERS = 40.32;
const SIX_YARD_BOX_DEPTH_METERS = 5.5;
const SIX_YARD_BOX_WIDTH_METERS = 18.32;
const GOAL_WIDTH_METERS = 7.32;
const GOAL_DEPTH_PX = 10;
const PENALTY_SPOT_DISTANCE_METERS = 11;
const PENALTY_ARC_RADIUS_METERS = 9.15;
const PITCH_WIDTH = 680;
const PITCH_FIELD_X = 18;
const PITCH_FIELD_Y = 18;
const PITCH_FIELD_WIDTH = 644;
const PITCH_FIELD_HEIGHT = (PITCH_FIELD_WIDTH / FOTMOB_PITCH_WIDTH_METERS) * SHOTMAP_DEPTH_METERS;
const PITCH_HEIGHT = PITCH_FIELD_Y * 2 + PITCH_FIELD_HEIGHT;

function shotMarkerGeometry(shot: ShotMapShot) {
  const [displayX, displayY] = shotDisplayCoordinates(shot);
  const xMeters = clamp(percentToMeters(displayX, FOTMOB_PITCH_LENGTH_METERS) ?? FOTMOB_FINAL_THIRD_START_X_METERS, FOTMOB_FINAL_THIRD_START_X_METERS, FOTMOB_PITCH_LENGTH_METERS);
  const yMeters = clamp(percentToMeters(displayY, FOTMOB_PITCH_WIDTH_METERS) ?? CENTER_Y_METERS, 0, FOTMOB_PITCH_WIDTH_METERS);
  const size = Math.max(7, Math.min(17, 7 + Math.sqrt(Math.max(shot.xg ?? 0.04, 0)) * 10));

  return {
    x: pitchXFromFotMobY(FOTMOB_PITCH_WIDTH_METERS - yMeters),
    y: pitchYFromFotMobX(xMeters),
    radius: size / 2
  };
}

function pitchPoint(fotMobY: number, fotMobX: number) {
  return {
    x: pitchXFromFotMobY(fotMobY),
    y: pitchYFromFotMobX(fotMobX)
  };
}

function pitchRectFromCenterWidth(widthMeters: number, depthMeters: number, topOffsetPx = 0) {
  const leftMeters = (FOTMOB_PITCH_WIDTH_METERS - widthMeters) / 2;
  return {
    x: pitchXFromFotMobY(leftMeters),
    y: PITCH_FIELD_Y + topOffsetPx,
    width: fieldWidthMetersToPx(widthMeters),
    height: fieldDepthMetersToPx(depthMeters)
  };
}

function goalMouthRect() {
  const leftMeters = (FOTMOB_PITCH_WIDTH_METERS - GOAL_WIDTH_METERS) / 2;
  return {
    x: pitchXFromFotMobY(leftMeters),
    y: PITCH_FIELD_Y - GOAL_DEPTH_PX,
    width: fieldWidthMetersToPx(GOAL_WIDTH_METERS)
  };
}

function penaltyArcPath() {
  const boxBottomY = PITCH_FIELD_Y + fieldDepthMetersToPx(PENALTY_AREA_DEPTH_METERS);
  const radiusPx = fieldDepthMetersToPx(PENALTY_ARC_RADIUS_METERS);
  const penaltyToBoxMeters = PENALTY_AREA_DEPTH_METERS - PENALTY_SPOT_DISTANCE_METERS;
  const lateralOffsetMeters = Math.sqrt(Math.max(PENALTY_ARC_RADIUS_METERS ** 2 - penaltyToBoxMeters ** 2, 0));
  const leftX = pitchXFromFotMobY(CENTER_Y_METERS - lateralOffsetMeters);
  const rightX = pitchXFromFotMobY(CENTER_Y_METERS + lateralOffsetMeters);

  return `M${leftX} ${boxBottomY}A${radiusPx} ${radiusPx} 0 0 0 ${rightX} ${boxBottomY}`;
}

function pitchXFromFotMobY(yMeters: number) {
  return PITCH_FIELD_X + (yMeters / FOTMOB_PITCH_WIDTH_METERS) * PITCH_FIELD_WIDTH;
}

function pitchYFromFotMobX(xMeters: number) {
  const distanceFromGoalMeters = FOTMOB_PITCH_LENGTH_METERS - xMeters;
  return PITCH_FIELD_Y + (distanceFromGoalMeters / SHOTMAP_DEPTH_METERS) * PITCH_FIELD_HEIGHT;
}

function fieldWidthMetersToPx(value: number) {
  return (value / FOTMOB_PITCH_WIDTH_METERS) * PITCH_FIELD_WIDTH;
}

function fieldDepthMetersToPx(value: number) {
  return (value / SHOTMAP_DEPTH_METERS) * PITCH_FIELD_HEIGHT;
}

function percentToMeters(value: number | null, axisLength: number) {
  if (value === null) return null;
  return (value / 100) * axisLength;
}

function markerFill(shot: ShotMapShot) {
  if (shot.is_goal) return "#10b981";
  if (shot.is_blocked) return "#8b5cf6";
  if (shot.is_on_target) return "#f59e0b";
  return "#94a3b8";
}

function markerStroke(tone: "attacking" | "conceded" | "player") {
  if (tone === "conceded") return "#312e81";
  if (tone === "player") return "#022c22";
  return "rgba(255,255,255,0.92)";
}

function shotDisplayCoordinates(shot: ShotMapShot): [number | null, number | null] {
  return [
    normalized_shot_axis_coordinate(shot.normalized_x, shot.x, FOTMOB_PITCH_LENGTH_METERS),
    normalized_shot_axis_coordinate(shot.normalized_y, shot.y, FOTMOB_PITCH_WIDTH_METERS)
  ];
}

function shotTooltip(shot: ShotMapShot, layer: string) {
  return [
    layer,
    shot.player_name,
    shot.minute !== null ? `${shot.minute}${shot.added_time ? `+${shot.added_time}` : ""}'` : null,
    shot.xg !== null ? `${shot.xg.toFixed(2)} xG` : null,
    shot.event_type,
    shot.match_label
  ].filter(Boolean).join(" | ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
