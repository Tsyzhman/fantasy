"use client";

import { Columns2, Crosshair, Layers3, Pause, Play, Shield, SkipForward, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { LocalizedOption, localizedText, useLanguage } from "@/components/localized-option";
import { SortableTable } from "@/components/sortable-table";
import type { ShotMapShot } from "@/lib/shot-maps";
import { shotMatchesSituationFilter, type ShotSituationFilter } from "@/mixer/shot-filters";

type ShotMapExplorerProps = {
  teamShots: ShotMapShot[];
  concededShots: ShotMapShot[];
  playerShots: ShotMapShot[];
  overlayShots: {
    attacking: ShotMapShot[];
    conceded: ShotMapShot[];
  };
  zoneSummary: {
    attacking: ZoneSummary;
    conceded: ZoneSummary;
  };
  windowLabel: string;
  defendingWindowLabel: string;
  windowLabelRu: string;
  defendingWindowLabelRu: string;
};

type ZoneSummary = {
  left_shots: number;
  center_shots: number;
  right_shots: number;
  left_xg: number;
  center_xg: number;
  right_xg: number;
};

type Mode = "for" | "against" | "overlay" | "split" | "player";
type ShotLayer = {
  key: string;
  label: string;
  shots: ShotMapShot[];
  tone: "attacking" | "conceded" | "player";
};

export function ShotMapExplorer({
  teamShots,
  concededShots,
  playerShots,
  overlayShots,
  zoneSummary,
  windowLabel,
  defendingWindowLabel,
  windowLabelRu,
  defendingWindowLabelRu
}: ShotMapExplorerProps) {
  const language = useLanguage();
  const [mode, setMode] = useState<Mode>("overlay");
  const [goalsOnly, setGoalsOnly] = useState(false);
  const [onTargetOnly, setOnTargetOnly] = useState(false);
  const [showTeamShots, setShowTeamShots] = useState(true);
  const [showConceded, setShowConceded] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [situation, setSituation] = useState<ShotSituationFilter>("all");
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaybackRunning, setIsPlaybackRunning] = useState(false);

  const layers = useMemo(() => {
    const selectedShotIds = new Set(playerShots.map((shot) => shot.id));
    const selectedPlayerRefs = new Set(playerShots.flatMap((shot) => [shot.player_id, shot.provider_player_id]).filter((value): value is string => Boolean(value)));

    if (mode === "against") return [{ key: "against", label: localizedText(language, "Team shots against", "Допущенные удары"), shots: filterShots(concededShots), tone: "conceded" as const }];
    if (mode === "player") return [{ key: "player", label: localizedText(language, "Selected player shots", "Удары выбранного игрока"), shots: filterShots(playerShots), tone: "player" as const }];
    if (mode === "for") return attackingLayers("for", localizedText(language, "Team shots for", "Удары команды"), teamShots);
    if (mode === "split") {
      return [
        ...attackingLayers("split-for", localizedText(language, "Team A attacking", "Команда А атакует"), overlayShots.attacking),
        ...(showConceded
          ? [
              {
                key: "split-against",
                label: localizedText(language, "Team B conceded", "Команда B допускает"),
                shots: filterShots(overlayShots.conceded),
                tone: "conceded" as const
              }
            ]
          : [])
      ];
    }

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
  }, [concededShots, goalsOnly, language, mode, onTargetOnly, overlayShots.attacking, overlayShots.conceded, playerShots, showConceded, showTeamShots, situation, teamShots]);

  const visibleShots = layers.flatMap((layer) => layer.shots);
  const sequenceShots = useMemo(() => orderShotsForPlayback(visibleShots), [visibleShots]);
  const clampedPlaybackIndex = sequenceShots.length ? playbackIndex % sequenceShots.length : 0;
  const activeSequenceShot = sequenceShots[clampedPlaybackIndex] ?? null;
  const playbackRunning = isPlaybackRunning && sequenceShots.length > 1;
  const totalXg = visibleShots.reduce((total, shot) => total + (shot.xg ?? 0), 0);
  const shooterSummaries = summarizeShooters(visibleShots, language);
  const topShooterSummaries = shooterSummaries.slice(0, 8);
  const splitAttackLayers = layers.filter((layer) => layer.tone !== "conceded");
  const splitConcededLayers = layers.filter((layer) => layer.tone === "conceded");

  useEffect(() => {
    if (!playbackRunning) return;
    const timer = window.setInterval(() => {
      setPlaybackIndex((current) => (current + 1) % sequenceShots.length);
    }, 900);
    return () => window.clearInterval(timer);
  }, [playbackRunning, sequenceShots.length]);

  return (
    <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <ModeButton active={mode === "for"} onClick={() => setMode("for")} icon={<Crosshair className="h-4 w-4" />} label={<I18nText en="Team A attack" ru="Атака A" />} />
            <ModeButton active={mode === "against"} onClick={() => setMode("against")} icon={<Shield className="h-4 w-4" />} label={<I18nText en="Team A conceded" ru="Допущено A" />} />
            <ModeButton active={mode === "overlay"} onClick={() => setMode("overlay")} icon={<Layers3 className="h-4 w-4" />} label={<I18nText en="A vs B overlay" ru="A против B" />} />
            <ModeButton active={mode === "split"} onClick={() => setMode("split")} icon={<Columns2 className="h-4 w-4" />} label={<I18nText en="Side-by-side" ru="Рядом" />} />
            <ModeButton active={mode === "player"} onClick={() => setMode("player")} icon={<UserRound className="h-4 w-4" />} label={<I18nText en="Selected player" ru="Игрок" />} />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={goalsOnly} onChange={(event) => setGoalsOnly(event.target.checked)} />
              <I18nText en="Goals" ru="Голы" />
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={onTargetOnly} onChange={(event) => setOnTargetOnly(event.target.checked)} />
              <I18nText en="On target" ru="В створ" />
            </label>
            {mode === "for" || mode === "overlay" || mode === "split" ? (
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={showTeamShots} onChange={(event) => setShowTeamShots(event.target.checked)} />
                <I18nText en="Team layer" ru="Слой команды" />
              </label>
            ) : null}
            {mode === "overlay" || mode === "split" ? (
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={showConceded} onChange={(event) => setShowConceded(event.target.checked)} />
                <I18nText en="Team B conceded" ru="Допущено B" />
              </label>
            ) : null}
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={showHeatmap} onChange={(event) => setShowHeatmap(event.target.checked)} />
              <I18nText en="Heatmap" ru="Теплокарта" />
            </label>
            <div className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setIsPlaybackRunning((current) => !current)}
                disabled={sequenceShots.length === 0}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                aria-label={playbackRunning ? "Pause shot sequence" : "Play shot sequence"}
              >
                {playbackRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setPlaybackIndex((current) => (sequenceShots.length ? (current + 1) % sequenceShots.length : 0))}
                disabled={sequenceShots.length === 0}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                aria-label="Next shot"
              >
                <SkipForward className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-12 px-1 text-right text-xs font-semibold text-slate-500 num-tabular">
                {sequenceShots.length ? `${clampedPlaybackIndex + 1}/${sequenceShots.length}` : "0/0"}
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

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <LegendItem tone="attacking" label={localizedText(language, "Team shots", "Удары команды")} />
          <LegendItem tone="conceded" label={localizedText(language, "Conceded shots", "Допущенные удары")} />
          <LegendItem tone="player" label={localizedText(language, "Selected player", "Выбранный игрок")} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span className="font-semibold uppercase tracking-wide text-slate-400"><I18nText en="Outcome:" ru="Исход:" /></span>
          <OutcomeKey color="bg-emerald-500" label={localizedText(language, "Goal", "Гол")} />
          <OutcomeKey color="bg-amber-400" label={localizedText(language, "On target", "В створ")} />
          <OutcomeKey color="bg-slate-400" label={localizedText(language, "Off target", "Мимо")} />
          <OutcomeKey color="bg-violet-500" label={localizedText(language, "Blocked", "Заблокирован")} />
          <span className="ml-2"><I18nText en="◇ Header · ◯ Foot · ⊙ Set piece. Size ∝ xG." ru="◇ Голова · ◯ Нога · ⊙ Стандарт. Размер ∝ xG." /></span>
        </div>

        {mode === "split" ? (
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <ShotPitchPanel
              title={<I18nText en="Team A attack" ru="Атака A" />}
              layers={splitAttackLayers}
              showHeatmap={showHeatmap}
              activeShotId={activeSequenceShot?.id ?? null}
            />
            <ShotPitchPanel
              title={<I18nText en="Team B conceded" ru="Допущено B" />}
              layers={splitConcededLayers}
              showHeatmap={showHeatmap}
              activeShotId={activeSequenceShot?.id ?? null}
            />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <ShotPitchPanel
              layers={layers}
              showHeatmap={showHeatmap}
              activeShotId={activeSequenceShot?.id ?? null}
              compact={false}
            />
          </div>
        )}

        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink"><I18nText en="Top shooters" ru="Топ бьющих" /></h2>
              <p className="mt-1 text-xs text-slate-500">
                <I18nText
                  en={<>Team A window: {windowLabel}. Team B conceded window: {defendingWindowLabel}.</>}
                  ru={<>Окно команды А: {windowLabelRu}. Окно допущенных ударов команды B: {defendingWindowLabelRu}.</>}
                />
              </p>
            </div>
            <p className="text-xs text-slate-500">
              <I18nText en={`${visibleShots.length} visible shots · ${shooterSummaries.length} shooters`} ru={`Видимых ударов: ${visibleShots.length} · бьющих: ${shooterSummaries.length}`} />
            </p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <SortableTable className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2"><I18nText en="Player" ru="Игрок" /></th>
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
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{summary.playerName}</td>
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
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      <I18nText en="No shooter stats for the current layer and filters." ru="Нет статистики бьющих по текущему слою и фильтрам." />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </SortableTable>
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase text-slate-500"><I18nText en="Visible layer" ru="Видимый слой" /></p>
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
                <LegendItem tone={layer.tone} label={layer.label} />
                <span className="font-semibold text-slate-600">{layer.shots.length}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase text-slate-500"><I18nText en="Side zones" ru="Зоны по флангам" /></p>
          <ZoneTable title={<I18nText en="Attacking" ru="Атака" />} summary={zoneSummary.attacking} />
          <ZoneTable title={<I18nText en="Conceded" ru="Допущено" />} summary={zoneSummary.conceded} />
          <p className="mt-4 text-xs leading-5 text-slate-500">
            <I18nText
              en="Shots are normalized to a common attacking direction and shown in the attacking third. Raw FotMob coordinates are preserved."
              ru="Удары нормализованы в одну сторону атаки и показаны в атакующей трети. Исходные координаты FotMob сохраняются."
            />
          </p>
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

  return [...summaries.values()].sort((left, right) => right.shots - left.shots || right.xg - left.xg || left.playerName.localeCompare(right.playerName));
}

function orderShotsForPlayback(shots: ShotMapShot[]) {
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

function ShotPitchPanel({
  title,
  layers,
  showHeatmap,
  activeShotId,
  compact = true
}: {
  title?: ReactNode;
  layers: ShotLayer[];
  showHeatmap: boolean;
  activeShotId: string | null;
  compact?: boolean;
}) {
  const shotCount = layers.reduce((total, layer) => total + layer.shots.length, 0);
  const frameClassName = compact
    ? "relative aspect-[68/36] min-h-[220px] w-full overflow-hidden rounded border border-emerald-800 bg-emerald-800 shadow-inner"
    : "relative mx-auto aspect-[68/36] min-h-[260px] w-full min-w-[360px] max-w-[980px] overflow-hidden rounded border border-emerald-800 bg-emerald-800 shadow-inner";

  return (
    <div>
      {title ? (
        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>{title}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 num-tabular">{shotCount}</span>
        </div>
      ) : null}
      <div className={frameClassName}>
        <ShotPitchSvg layers={layers} showHeatmap={showHeatmap} activeShotId={activeShotId} />
        {shotCount === 0 ? (
          <div className="absolute inset-0 grid place-items-center bg-emerald-950/35 text-sm font-semibold text-white">
            <I18nText en="No shots for current filters" ru="Нет ударов по текущим фильтрам" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ShotPitchSvg({ layers, showHeatmap, activeShotId }: { layers: ShotLayer[]; showHeatmap: boolean; activeShotId: string | null }) {
  return (
    <svg className="h-full w-full" viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_HEIGHT}`} role="img" aria-label="Pitch">
      <defs>
        <pattern id="pitch-stripes" width="136" height={PITCH_HEIGHT} patternUnits="userSpaceOnUse">
          <rect width="68" height={PITCH_HEIGHT} fill="#047857" opacity="0.35" />
          <rect x="68" width="68" height={PITCH_HEIGHT} fill="#065f46" opacity="0.28" />
        </pattern>
        <filter id="shot-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor="#052e16" floodOpacity="0.36" />
        </filter>
        <filter id="shot-heat-blur" x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>

      <rect width={PITCH_WIDTH} height={PITCH_HEIGHT} fill="#047857" />
      <rect width={PITCH_WIDTH} height={PITCH_HEIGHT} fill="url(#pitch-stripes)" />
      <g fill="none" stroke="rgba(255,255,255,0.76)" strokeLinecap="round" strokeWidth="3">
        <rect x="18" y="18" width="644" height="324" />
        <path d="M149 18V171H531V18" />
        <path d="M253 18V69H427V18" />
        <path d="M305 18V8H375V18" />
        <circle cx="340" cy="120" r="4" fill="rgba(255,255,255,0.82)" stroke="none" />
        <path d="M271 171A86 86 0 0 0 409 171" strokeOpacity="0.5" />
      </g>
      <g fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5">
        <path d="M18 99H662" />
        <path d="M18 180H662" />
        <path d="M18 261H662" />
      </g>

      {showHeatmap ? <ShotHeatmap layers={layers} /> : null}

      {layers.map((layer) =>
        layer.shots.map((shot, index) => (
          <ShotMarker key={`${layer.key}-${shot.id}-${index}`} layer={layer} shot={shot} active={shot.id === activeShotId} />
        ))
      )}
    </svg>
  );
}

function ShotHeatmap({ layers }: { layers: ShotLayer[] }) {
  return (
    <g filter="url(#shot-heat-blur)" opacity="0.95" style={{ mixBlendMode: "screen" }}>
      {layers.map((layer) =>
        layer.shots.map((shot, index) => {
          const marker = shotMarkerGeometry(shot);
          const radius = 28 + Math.sqrt(Math.max(shot.xg ?? 0.03, 0.03)) * 52;
          const opacity = heatmapOpacity(layer.tone, shot);
          return (
            <circle
              key={`heat-${layer.key}-${shot.id}-${index}`}
              cx={marker.x}
              cy={marker.y}
              r={radius}
              fill={heatmapFill(layer.tone)}
              opacity={opacity}
            />
          );
        })
      )}
    </g>
  );
}

function ShotMarker({ layer, shot, active }: { layer: ShotLayer; shot: ShotMapShot; active: boolean }) {
  const marker = shotMarkerGeometry(shot);
  const fill = markerFill(shot);
  const stroke = markerStroke(layer.tone);
  const strokeWidth = layer.tone === "player" ? 3 : 2;
  const opacity = layer.tone === "conceded" ? 0.86 : 0.96;

  // Shape by body part / situation.
  const isHead = (shot.body_part ?? "").toLowerCase().includes("head");
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
      {isHead ? (
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

const ATTACKING_THIRD_START_X = 100 * 2 / 3;
const PITCH_WIDTH = 680;
const PITCH_HEIGHT = 360;
const PITCH_FIELD_X = 18;
const PITCH_FIELD_Y = 18;
const PITCH_FIELD_WIDTH = 644;
const PITCH_FIELD_HEIGHT = 324;

function shotMarkerGeometry(shot: ShotMapShot) {
  const [displayX, displayY] = shotDisplayCoordinates(shot);
  const x = clamp(displayX ?? ATTACKING_THIRD_START_X, ATTACKING_THIRD_START_X, 100);
  const y = clamp(displayY ?? 50, 2, 98);
  const size = Math.max(7, Math.min(17, 7 + Math.sqrt(Math.max(shot.xg ?? 0.04, 0)) * 10));
  const attackingThirdTop = ((100 - x) / (100 - ATTACKING_THIRD_START_X)) * 100;

  return {
    x: PITCH_FIELD_X + (y / 100) * PITCH_FIELD_WIDTH,
    y: PITCH_FIELD_Y + (attackingThirdTop / 100) * PITCH_FIELD_HEIGHT,
    radius: size / 2
  };
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

function heatmapFill(tone: "attacking" | "conceded" | "player") {
  if (tone === "conceded") return "#818cf8";
  if (tone === "player") return "#34d399";
  return "#fb7185";
}

function heatmapOpacity(tone: "attacking" | "conceded" | "player", shot: ShotMapShot) {
  const xgWeight = Math.min(0.22, Math.max(0.07, (shot.xg ?? 0.04) * 0.55));
  const toneWeight = tone === "player" ? 1.2 : tone === "conceded" ? 0.92 : 1;
  return xgWeight * toneWeight;
}

function shotDisplayCoordinates(shot: ShotMapShot): [number | null, number | null] {
  const hasDerivedNormalizedCoordinates =
    shot.normalized_x !== null &&
    shot.normalized_y !== null &&
    (!sameCoordinate(shot.normalized_x, shot.x) || !sameCoordinate(shot.normalized_y, shot.y));

  if (hasDerivedNormalizedCoordinates) return [shot.normalized_x, shot.normalized_y];

  return [normalizeFotMobAxis(shot.normalized_x ?? shot.x, 105), normalizeFotMobAxis(shot.normalized_y ?? shot.y, 68)];
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

function normalizeFotMobAxis(value: number | null, axisLength: number) {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return value * 100;
  if (value >= 0 && value <= axisLength) return (value / axisLength) * 100;
  return value;
}

function sameCoordinate(left: number | null, right: number | null) {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < 0.000001;
}
