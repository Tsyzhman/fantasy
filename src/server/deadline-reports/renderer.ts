import { findingMarker, findingRoleSuffix, splitFindingsByLineup, type DeadlineFindingReason, type DeadlinePlayerFinding } from "./classifier";
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
    note: string | null;
  };
  findings: DeadlinePlayerFinding[];
  fixtures: DeadlineFixtureLine[];
  popularitySections: DeadlinePopularitySection[];
  squadUrl: string;
  degraded: string[];
  maxLength?: number;
}

export interface RenderedDeadlineReport {
  parts: string[];
  partsCount: number;
}

const TELEGRAM_MESSAGE_LIMIT = 4096;

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

export function renderScheduleBlock(fixtures: DeadlineFixtureLine[]): string {
  if (fixtures.length === 0) return "Матчи тура\n(расписание не опубликовано)";
  const lines = fixtures.map((fixture) => `${escapeHtml(fixture.home)} - ${escapeHtml(fixture.away)}`);
  return `Матчи тура\n${lines.join("\n")}`;
}

function compactReason(reason: DeadlineFindingReason): string {
  switch (reason.code) {
    case "BLANK": return "нет матча в туре";
    case "OUT_OF_XI": return "вне прогноза основы SorareInside";
    case "ALT_ZERO": return "ALT 0";
    case "PARTIAL_XI_COVERAGE": return "прогноз основы есть не для всех матчей";
    case "UNKNOWN_DATA": return reason.text.replace(/^Нет надёжных данных: /, "");
  }
}

function renderFindings(title: string, findings: DeadlinePlayerFinding[], maxLineLength: number): string | null {
  if (findings.length === 0) return null;
  const groups = new Map<string, DeadlinePlayerFinding[]>();
  for (const finding of findings) {
    const key = JSON.stringify(finding.reasons.map((reason) => [reason.code, reason.text]));
    const group = groups.get(key);
    if (group) group.push(finding);
    else groups.set(key, [finding]);
  }
  const lines: string[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    const prefix = `${findingMarker(first)} `;
    const suffix = ` — ${escapeHtml(first.reasons.map(compactReason).join("; "))}.`;
    let names: string[] = [];
    for (const finding of group) {
      const name = `${escapeHtml(finding.name)}${findingRoleSuffix(finding)}`;
      if (names.length > 0 && prefix.length + [...names, name].join(", ").length + suffix.length > maxLineLength) {
        lines.push(`${prefix}${names.join(", ")}${suffix}`);
        names = [];
      }
      names.push(name);
    }
    lines.push(`${prefix}${names.join(", ")}${suffix}`);
  }
  return `${title}\n${lines.join("\n")}`;
}

function additionalDegradedNotes(input: DeadlineReportInput): string[] {
  const shown = new Set<string>();
  for (const finding of input.findings) {
    for (const reason of finding.reasons) {
      if (reason.code === "UNKNOWN_DATA" || reason.code === "PARTIAL_XI_COVERAGE") {
        shown.add(`${finding.name}: ${reason.text.replace(/^Нет надёжных данных: /, "")}`);
      }
    }
  }
  return [...new Set(input.degraded)].filter((note) => !shown.has(note));
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
  const maxLength = input.maxLength ?? TELEGRAM_MESSAGE_LIMIT;
  const maxLineLength = maxLength - header.length - 32;

  if (input.squadSource.kind === "SPORTS_PUBLISHED") {
    const tourLabel = input.squadSource.tourLabel;
    const sourceLabel = tourLabel
      ? /тур/i.test(tourLabel)
        ? `${escapeHtml(tourLabel)} (опубликованный)`
        : `${escapeHtml(tourLabel)} тур (опубликованный)`
      : "опубликованный состав";
    sections.push(`Состав Sports: ${sourceLabel}.` + (input.squadSource.note ? ` ${escapeHtml(input.squadSource.note)}` : ""));
  } else {
    sections.push(`Состав Scout: сохранённый план${input.squadSource.tourLabel ? ` тура ${escapeHtml(input.squadSource.tourLabel)}` : ""}. Не подтверждён Sports.`);
  }

  const { starters, bench } = splitFindingsByLineup(input.findings);
  const degradedNotes = additionalDegradedNotes(input);
  sections.push(renderFindings("Проверьте основу:", starters, maxLineLength) ?? (degradedNotes.length > 0
    ? "Проверьте основу:\nПроверка неполная — см. причины ниже."
    : "Проверьте основу:\nРисков не найдено по доступным данным."));
  const benchBlock = renderFindings("Проверьте скамейку:", bench, maxLineLength);
  if (benchBlock) sections.push(benchBlock);
  if (degradedNotes.length > 0) sections.push(`Не хватает данных: ${escapeHtml(degradedNotes.slice(0, 8).join("; "))}${degradedNotes.length > 8 ? "…" : ""}`);

  sections.push(renderScheduleBlock(input.fixtures));

  for (const popularitySection of input.popularitySections) {
    const block = renderPopularitySection(popularitySection);
    if (block) sections.push(block);
  }

  const squadUrl = safeUrl(input.squadUrl);
  if (squadUrl) sections.push(`<a href="${escapeHtml(squadUrl)}">Открыть состав ↗</a>`);

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
