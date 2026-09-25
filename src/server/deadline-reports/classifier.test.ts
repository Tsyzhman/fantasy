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
    popularitySections: [
      {
        kind: "SELLS",
        entries: [
          { rank: 1, name: "Бруну Фернандеш", team: "Португалия", valueText: "-4,7%" },
          { rank: 2, name: "Эрлинг Холанд", team: "Норвегия", valueText: "-4,6%" }
        ],
        sourceUrl: "https://www.sports.ru/football/1117357818-x.html",
        sourcePublishedAt: "2026-09-25T05:00:00.000Z"
      }
    ],
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
  assert.match(text, /Популярные продажи Sports \(топ-2\):/);
  assert.match(text, /1\. Бруну Фернандеш, Португалия — -4,7%/);
  assert.match(text, /2\. Эрлинг Холанд, Норвегия — -4,6%/);
  assert.match(text, /<a href="https:\/\/www\.sports\.ru/);
  assert.match(text, /Статистика 08:32 · Кэфы 08:18\./);
  assert.match(text, /Открыть состав ↗/);
});

test("published buys and sells are included up to 10 with source; missing publication omits the block", () => {
  const sells = {
    kind: "SELLS" as const,
    entries: Array.from({ length: 12 }, (_, index) => ({ rank: index + 1, name: `Продажа ${index + 1}`, team: "Клуб", valueText: `-${index + 1}%` })),
    sourceUrl: "https://www.sports.ru/football/1-x.html",
    sourcePublishedAt: "2026-09-25T05:00:00.000Z"
  };
  const { parts } = renderDeadlineReport(reportInput({ popularitySections: [sells] }));
  const text = parts[0]!;
  assert.match(text, /Популярные продажи Sports \(топ-10\):/);
  assert.match(text, /10\. Продажа 10, Клуб — -10%/);
  assert.ok(!text.includes("11. Продажа 11"), "entries above the published top-10 stay out");
  const empty = renderDeadlineReport(reportInput({ popularitySections: [] }));
  assert.ok(!empty.parts[0]!.includes("Популярные"), "no fabricated popularity block");
});

test("transfer popularity sections render official top-3 and ownership-delta top-10", () => {
  const { parts } = renderDeadlineReport(
    reportInput({
      popularitySections: [
        {
          kind: "TRANSFERS_OFFICIAL",
          entries: [
            { rank: 1, name: "Жилсон Беншимол", team: "Акрон", valueText: "48 очков" },
            { rank: 2, name: "Иван Обляков", team: "ЦСКА", valueText: "56 очков" }
          ],
          sourceUrl: null,
          sourcePublishedAt: null
        },
        {
          kind: "TRANSFERS_GAIN",
          entries: [{ rank: 1, name: "Жилсон Беншимол", team: "Акрон", valueText: "+8.93 п.п." }],
          sourceUrl: null,
          sourcePublishedAt: null
        },
        {
          kind: "TRANSFERS_DROP",
          entries: [{ rank: 1, name: "Кто-то", team: "Клуб", valueText: "-3.10 п.п." }],
          sourceUrl: null,
          sourcePublishedAt: null
        }
      ]
    })
  );
  const text = parts[0]!;
  assert.match(text, /Популярные трансферы Sports \(топ-2\):/);
  assert.match(text, /1\. Жилсон Беншимол, Акрон — 48 очков/);
  assert.match(text, /Трансферы Sports: рост доли выбора \(топ-1\):/);
  assert.match(text, /1\. Жилсон Беншимол, Акрон — \+8\.93 п\.п\./);
  assert.match(text, /Трансферы Sports: падение доли выбора \(топ-1\):/);
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
