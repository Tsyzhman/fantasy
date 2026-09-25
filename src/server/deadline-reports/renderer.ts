import { findingMarker, findingRoleSuffix, splitFindingsByLineup, type DeadlinePlayerFinding } from "./classifier";
import { moscowShortDate, moscowTimeLabel } from "./config";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#message
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#acceptance
 */
export interface DeadlineFixtureLine {
  home: string;
  away: string;
  kickoffAt: Date | null;
  status: string | null;
}

export interface DeadlinePopularityEntry {
  rank: number;
  name: string;
  team: string | null;
  valueText: string | null;
}

export type DeadlinePopularityKind = "BUYS" | "SELLS" | "TRANSFERS_OFFICIAL" | "TRANSFERS_GAIN" | "TRANSFERS_DROP";

export interface DeadlinePopularitySection {
  kind: DeadlinePopularityKind;
  entries: DeadlinePopularityEntry[];
  sourceUrl: string | null;
  sourcePublishedAt: string | null;
}

export interface DeadlineReportInput {
  tag: string;
  deadlineAt: Date | null;
  today: boolean;
  squadSource: {
    kind: "SPORTS_PUBLISHED" | "SITE_SAVED";
    tourLabel: string | null;
    fetchedAt: Date | null;
    note: string | null;
  };
  findings: DeadlinePlayerFinding[];
  fixtures: DeadlineFixtureLine[];
  popularitySections: DeadlinePopularitySection[];
  freshness: Array<{ label: string; at: Date | null; stale: boolean }>;
  squadUrl: string;
  degraded: string[];
  maxLength?: number;
}

export interface RenderedDeadlineReport {
  parts: string[];
  partsCount: number;
}

const TELEGRAM_MESSAGE_LIMIT = 4096;
const SCHEDULE_COLUMN_WIDTH = 21;

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function displayWidth(value: string): number {
  return Array.from(value).length;
}

function fit(value: string, width: number): string {
  const characters = Array.from(value.replace(/\s+/g, " ").trim());
  if (characters.length > width) return `${characters.slice(0, Math.max(1, width - 1)).join("")}…`;
  return characters.join("").padEnd(width, " ");
}

export function renderScheduleBlock(fixtures: DeadlineFixtureLine[]): string {
  if (fixtures.length === 0) return "Матчи тура\n(расписание не опубликовано)";
  const lines = fixtures.map((fixture) => {
    const status = fixture.status && !/scheduled|not[_ ]?started|ns/i.test(fixture.status) ? ` · ${fixture.status}` : "";
    return `${fit(fixture.home, SCHEDULE_COLUMN_WIDTH)} | ${fit(`${fixture.away}${status}`, SCHEDULE_COLUMN_WIDTH)}`;
  });
  return `Матчи тура\n<pre>${escapeHtml(lines.join("\n"))}</pre>`;
}

function renderFindings(title: string, findings: DeadlinePlayerFinding[]): string | null {
  if (findings.length === 0) return null;
  const lines = findings.map((finding) => {
    const reasons = finding.reasons.map((reason) => reason.text).join("; ");
    return `${findingMarker(finding)} ${escapeHtml(finding.name)}${findingRoleSuffix(finding)} — ${escapeHtml(reasons)}.`;
  });
  return `${title}\n${lines.join("\n")}`;
}

const POPULARITY_LABELS: Record<DeadlinePopularityKind, string> = {
  BUYS: "Популярные покупки Sports",
  SELLS: "Популярные продажи Sports",
  TRANSFERS_OFFICIAL: "Популярные трансферы Sports",
  TRANSFERS_GAIN: "Трансферы Sports: рост доли выбора",
  TRANSFERS_DROP: "Трансферы Sports: падение доли выбора"
};

function renderPopularitySection(section: DeadlinePopularitySection): string | null {
  const entries = section.entries.slice(0, 10);
  if (entries.length === 0) return null;
  const label = POPULARITY_LABELS[section.kind] ?? POPULARITY_LABELS.BUYS;
  const lines = entries.map((entry) => {
    const value = section.kind === "TRANSFERS_OFFICIAL" ? "" : ` — ${escapeHtml(entry.valueText ?? "—")}`;
    return `${entry.rank}. ${escapeHtml(entry.name)}${entry.team ? `, ${escapeHtml(entry.team)}` : ""}${value}`;
  });
  const source = section.sourceUrl ? safeUrl(section.sourceUrl) : null;
  return `${label} (топ-${entries.length}):\n${lines.join("\n")}${source ? `\n<a href="${escapeHtml(source)}">источник ↗</a>` : ""}`;
}

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#message
 */
export function renderDeadlineReport(input: DeadlineReportInput): RenderedDeadlineReport {
  const deadlineLabel = input.deadlineAt
    ? `Дедлайн ${input.today ? "сегодня" : moscowShortDate(input.deadlineAt)} ${moscowTimeLabel(input.deadlineAt)} МСК`
    : "Дедлайн уточняется";
  const header = `${input.tag} · ${deadlineLabel}`;
  const sections: string[] = [];

  if (input.squadSource.kind === "SPORTS_PUBLISHED") {
    const tourLabel = input.squadSource.tourLabel;
    const sourceLabel = tourLabel
      ? /тур/i.test(tourLabel)
        ? `опубликованный состав, ${escapeHtml(tourLabel)}`
        : `опубликованный тур ${escapeHtml(tourLabel)}`
      : "опубликованный состав";
    sections.push(
      `Состав Sports: ${sourceLabel}, загружен ${input.squadSource.fetchedAt ? moscowTimeLabel(input.squadSource.fetchedAt) : "время неизвестно"}.` +
        (input.squadSource.note ? `\n${escapeHtml(input.squadSource.note)}` : "")
    );
  } else {
    sections.push(`Состав Scout: сохранённый план${input.squadSource.tourLabel ? ` тура ${escapeHtml(input.squadSource.tourLabel)}` : ""} от ${input.squadSource.fetchedAt ? moscowTimeLabel(input.squadSource.fetchedAt) : "неизвестного времени"}. Не подтверждён Sports.`);
  }

  const { starters, bench } = splitFindingsByLineup(input.findings);
  sections.push(renderFindings("Проверьте основу:", starters) ?? "Проверьте основу:\nРисков не найдено по доступным данным.");
  const benchBlock = renderFindings("Проверьте скамейку:", bench);
  if (benchBlock) sections.push(benchBlock);
  if (input.degraded.length > 0) sections.push(`Нет надёжных данных: ${escapeHtml(input.degraded.slice(0, 8).join("; "))}${input.degraded.length > 8 ? "…" : ""}`);

  sections.push(renderScheduleBlock(input.fixtures));

  for (const popularitySection of input.popularitySections) {
    const block = renderPopularitySection(popularitySection);
    if (block) sections.push(block);
  }

  const freshness = input.freshness
    .map((entry) => `${escapeHtml(entry.label)} ${entry.at ? moscowTimeLabel(entry.at) : "нет"}${entry.stale ? " (устарело)" : ""}`)
    .join(" · ");
  if (freshness) sections.push(`${freshness}.`);

  const squadUrl = safeUrl(input.squadUrl);
  if (squadUrl) sections.push(`<a href="${escapeHtml(squadUrl)}">Открыть состав ↗</a>`);

  const maxLength = input.maxLength ?? TELEGRAM_MESSAGE_LIMIT;
  const whole = `${header}\n${sections.join("\n\n")}`;
  if (whole.length <= maxLength) return { parts: [whole], partsCount: 1 };

  const reserve = header.length + 32;
  const parts: string[] = [];
  let current: string[] = [];
  let currentLength = 0;
  const pushPart = () => {
    if (current.length === 0) return;
    parts.push(current.join("\n\n"));
    current = [];
    currentLength = 0;
  };
  for (const section of sections) {
    const lines = section.split("\n");
    for (const line of lines) {
      const addition = (current.length === 0 ? 0 : 2) + line.length + 1;
      if (currentLength + addition > maxLength - reserve && current.length > 0) pushPart();
      current.push(line);
      currentLength += addition;
    }
  }
  pushPart();

  const total = parts.length;
  return {
    parts: parts.map((part, index) => `${header} · часть ${index + 1}/${total}\n${part}`),
    partsCount: total
  };
}
