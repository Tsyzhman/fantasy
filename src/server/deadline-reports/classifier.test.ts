import assert from "node:assert/strict";
import test from "node:test";
import { classifyDeadlinePlayers, splitFindingsByLineup, type DeadlinePlayerSignalInput } from "./classifier";
import { escapeHtml, renderDeadlineReport, renderScheduleBlock, type DeadlineReportInput } from "./renderer";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#acceptance
 */
function player(overrides: Partial<DeadlinePlayerSignalInput> = {}): DeadlinePlayerSignalInput {
  return {
    playerId: "1",
    name: "Игрок А",
    teamId: "10",
    teamName: "Клуб",
    isStarter: true,
    isCaptain: false,
    isViceCaptain: false,
    alt: 5,
    altIsRoundedZero: false,
    fixtureCount: 1,
    predictedXi: { available: true, inXi: true, coveredFixtures: 1, stale: false, source: "SORAREINSIDE" },
    mappingComplete: true,
    ...overrides
  };
}

test("blank is reported only when the calendar is complete", () => {
  const blank = classifyDeadlinePlayers({ players: [player({ fixtureCount: 0 })], scheduleKnown: true, scheduleComplete: true });
  assert.equal(blank.findings[0]?.reasons[0]?.code, "BLANK");
  const unknownCalendar = classifyDeadlinePlayers({ players: [player({ fixtureCount: 0 })], scheduleKnown: false, scheduleComplete: false });
  assert.equal(unknownCalendar.findings[0]?.reasons.some((reason) => reason.code === "BLANK"), false);
  assert.equal(unknownCalendar.findings[0]?.reasons.some((reason) => reason.code === "UNKNOWN_DATA"), true);
});

test("out-of-XI requires coverage of every fixture in a double round", () => {
  const partial = classifyDeadlinePlayers({
    players: [player({ fixtureCount: 2, predictedXi: { available: true, inXi: false, coveredFixtures: 1, stale: false, source: "SORAREINSIDE" } })],
    scheduleKnown: true,
    scheduleComplete: true
  });
  assert.equal(partial.findings[0]?.reasons.some((reason) => reason.code === "OUT_OF_XI"), false);
  assert.equal(partial.findings[0]?.reasons.some((reason) => reason.code === "PARTIAL_XI_COVERAGE"), true);
  const complete = classifyDeadlinePlayers({
    players: [player({ fixtureCount: 2, predictedXi: { available: true, inXi: false, coveredFixtures: 2, stale: false, source: "SORAREINSIDE" } })],
    scheduleKnown: true,
    scheduleComplete: true
  });
  assert.equal(complete.findings[0]?.reasons.some((reason) => reason.code === "OUT_OF_XI"), true);
});

test("true ALT zero differs from a rounded zero", () => {
  const trueZero = classifyDeadlinePlayers({ players: [player({ alt: 0 })], scheduleKnown: true, scheduleComplete: true });
  assert.equal(trueZero.findings[0]?.reasons.some((reason) => reason.code === "ALT_ZERO"), true);
  const roundedZero = classifyDeadlinePlayers({ players: [player({ alt: 0, altIsRoundedZero: true })], scheduleKnown: true, scheduleComplete: true });
  assert.equal(roundedZero.findings.length, 0);
});

test("missing ALT, mapping or a stale forecast produce an explicit unknown cause", () => {
  const missingAlt = classifyDeadlinePlayers({ players: [player({ alt: null })], scheduleKnown: true, scheduleComplete: true });
  assert.match(missingAlt.findings[0]?.reasons[0]?.text ?? "", /ALT недоступен/);
  const stale = classifyDeadlinePlayers({
    players: [player({ predictedXi: { available: true, inXi: true, coveredFixtures: 1, stale: true, source: "SORAREINSIDE" } })],
    scheduleKnown: true,
    scheduleComplete: true
  });
  assert.match(stale.findings[0]?.reasons[0]?.text ?? "", /устарел/);
  const unmapped = classifyDeadlinePlayers({ players: [player({ mappingComplete: false })], scheduleKnown: true, scheduleComplete: true });
  assert.match(unmapped.findings[0]?.reasons[0]?.text ?? "", /маппинг/);
});

test("one player keeps several distinct reasons and the bench split follows the squad", () => {
  const result = classifyDeadlinePlayers({
    players: [player({ isStarter: false, isCaptain: true, fixtureCount: 0, alt: 0 })],
    scheduleKnown: true,
    scheduleComplete: true
  });
  const finding = result.findings[0]!;
  assert.equal(finding.reasons.length, 2);
  assert.equal(finding.bench, true);
  assert.equal(finding.captain, true);
  const split = splitFindingsByLineup(result.findings);
  assert.equal(split.starters.length, 0);
  assert.equal(split.bench.length, 1);
});

function reportInput(overrides: Partial<DeadlineReportInput> = {}): DeadlineReportInput {
  return {
    tag: "#Англия10",
    deadlineAt: new Date("2026-09-25T15:30:00.000Z"),
    today: true,
    squadSource: { kind: "SPORTS_PUBLISHED", tourLabel: "9", fetchedAt: new Date("2026-09-25T05:02:00.000Z"), note: "Последние замены на тур 10 могут отсутствовать." },
    findings: [
      { playerId: "1", name: "Игрок А", teamName: "Arsenal", bench: false, captain: true, viceCaptain: false, reasons: [{ code: "ALT_ZERO", text: "ALT 0 — проверьте игрока" }] }
    ],
    fixtures: [{ home: "Arsenal", away: "Liverpool", kickoffAt: new Date("2026-09-25T15:30:00.000Z"), status: "scheduled" }],
    popularity: { available: true, count: 10, sourceUrl: "https://www.sports.ru/football/1117357818-x.html" },
    freshness: [
      { label: "Статистика", at: new Date("2026-09-25T05:32:00.000Z"), stale: false },
      { label: "Кэфы", at: new Date("2026-09-25T05:18:00.000Z"), stale: false }
    ],
    squadUrl: "https://fantasy.example/machete/squad",
    degraded: [],
    ...overrides
  };
}

test("report contains the tag, source, risks, three-column schedule and freshness", () => {
  const { parts, partsCount } = renderDeadlineReport(reportInput());
  assert.equal(partsCount, 1);
  const text = parts[0]!;
  assert.match(text, /^#Англия10 · Дедлайн сегодня 18:30 МСК/);
  assert.match(text, /Состав Sports: опубликованный тур 9, загружен 08:02\./);
  assert.match(text, /⚠ Игрок А \(К\) — ALT 0 — проверьте игрока\./);
  assert.match(text, /<pre>Хозяева\s+\| дата и время МСК \| Гости\s+\n/);
  assert.match(text, /Arsenal\s+\| 18:30 25\.09\s+\| Liverpool\s+/);
  assert.match(text, /Популярность Sports: найдено 10 · <a href="https:\/\/www\.sports\.ru/);
  assert.match(text, /Статистика 08:32 · Кэфы 08:18\./);
  assert.match(text, /Открыть состав ↗/);
});

test("report escapes HTML from dynamic values", () => {
  const { parts } = renderDeadlineReport(
    reportInput({
      findings: [
        { playerId: "1", name: "<script>alert(1)</script>", teamName: null, bench: false, captain: false, viceCaptain: false, reasons: [{ code: "ALT_ZERO", text: "ALT 0 — проверьте игрока" }] }
      ]
    })
  );
  assert.ok(!parts[0]!.includes("<script>"));
  assert.match(parts[0]!, /&lt;script&gt;/);
  assert.equal(escapeHtml("a & b < c"), "a &amp; b &lt; c");
});

test("missing kickoff renders as pending time, not a fabricated one", () => {
  const block = renderScheduleBlock([{ home: "A", away: "B", kickoffAt: null, status: null }]);
  assert.match(block, /уточняется/);
});

test("long reports split deterministically with the same tag and part numbers", () => {
  const findings = Array.from({ length: 120 }, (_, index) => ({
    playerId: String(index),
    name: `Очень длинное имя игрока ${index}`,
    teamName: "Клуб",
    bench: false,
    captain: false,
    viceCaptain: false,
    reasons: [{ code: "ALT_ZERO" as const, text: "ALT 0 — проверьте игрока; вне прогноза XI; бланк команды в этом туре" }]
  }));
  const first = renderDeadlineReport(reportInput({ findings }));
  const second = renderDeadlineReport(reportInput({ findings }));
  assert.ok(first.partsCount > 1);
  assert.deepEqual(first.parts, second.parts);
  first.parts.forEach((part, index) => {
    assert.ok(part.length <= 4096, `part ${index} length ${part.length}`);
    assert.match(part, new RegExp(`^#Англия10 · Дедлайн сегодня 18:30 МСК · часть ${index + 1}/${first.partsCount}`));
  });
});
