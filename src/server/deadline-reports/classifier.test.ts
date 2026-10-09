import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

/** @spec spec://modules/telegram/FEAT-007-deadline-assistant#signals */
test("an absent forecast is unavailable, while a stale forecast cannot establish out-of-XI", () => {
  const unavailable = classifyDeadlinePlayers({
    players: [player({ predictedXi: { available: false, inXi: false, coveredFixtures: 0, stale: true, source: null } })],
    scheduleKnown: true, scheduleComplete: true
  });
  assert.equal(unavailable.findings[0]?.reasons[0]?.text, "Нет надёжных данных: прогноз основы недоступен");
  const stale = classifyDeadlinePlayers({
    players: [player({ predictedXi: { available: true, inXi: false, coveredFixtures: 1, stale: true, source: "SORAREINSIDE" } })],
    scheduleKnown: true, scheduleComplete: true
  });
  assert.deepEqual(stale.findings[0]?.reasons.map((reason) => reason.code), ["UNKNOWN_DATA"]);
  assert.match(stale.findings[0]!.reasons[0]!.text, /устарел/);
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
    squadSource: { kind: "SPORTS_PUBLISHED", tourLabel: "9", note: "Последние замены на тур 10 могут отсутствовать." },
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
    squadUrl: "https://fantasy.example/machete/squad",
    degraded: [],
    ...overrides
  };
}

test("report contains the tag, source, risks, plain schedule and popularity", () => {
  const { parts, partsCount } = renderDeadlineReport(reportInput());
  assert.equal(partsCount, 1);
  const text = parts[0]!;
  assert.match(text, /^#Англия10 · Дедлайн сегодня 18:30 МСК/);
  assert.match(text, /Состав Sports: 9 тур \(опубликованный\)\. Последние замены/);
  assert.ok(!text.includes("загружен"), "no data-age timestamps in the message");
  assert.match(text, /⚠ Игрок А \(К\) — ALT 0\./);
  assert.match(text, /Матчи тура\nArsenal - Liverpool\n/);
  assert.match(text, /Популярные продажи Sports \(топ-2\):/);
  assert.match(text, /1\. Бруну Фернандеш, Португалия — -4,7%/);
  assert.match(text, /2\. Эрлинг Холанд, Норвегия — -4,6%/);
  assert.match(text, /<a href="https:\/\/www\.sports\.ru/);
  assert.ok(!text.includes("Статистика"), "no freshness footer");
  assert.match(text, /Открыть состав ↗/);
});

/** @spec spec://modules/telegram/FEAT-007-deadline-assistant#message */
test("the Russia example groups identical causes without repeating player degradation", () => {
  const stale = { available: false, inXi: false, coveredFixtures: 0, stale: true, source: "SORAREINSIDE" };
  const outside = { available: true, inXi: false, coveredFixtures: 1, stale: false, source: "SORAREINSIDE" };
  const classified = classifyDeadlinePlayers({
    players: [
      player({ playerId: "1", name: "Хуссем Мрезиг", predictedXi: stale }),
      player({ playerId: "2", name: "Мирлинд Даку", isCaptain: true, alt: null, predictedXi: outside }),
      player({ playerId: "3", name: "Андрес Аларкон", isStarter: false, predictedXi: stale }),
      player({ playerId: "4", name: "Александр Беляев", isStarter: false, alt: null, predictedXi: outside }),
      player({ playerId: "5", name: "Александр Сандрачук", isStarter: false, predictedXi: stale }),
      player({ playerId: "6", name: "Егор Любаков", isStarter: false, alt: null, predictedXi: outside })
    ],
    scheduleKnown: true,
    scheduleComplete: true
  });
  const text = renderDeadlineReport(reportInput({
    tag: "#Россия10",
    deadlineAt: new Date("2026-10-09T16:30:00.000Z"),
    squadSource: { kind: "SPORTS_PUBLISHED", tourLabel: "9 тур", note: "Последние замены на 10 тур могут отсутствовать." },
    ...classified
  })).parts[0]!;
  assert.match(text, /^#Россия10 · Дедлайн сегодня 19:30 МСК/);
  assert.ok(text.includes("Состав Sports: 9 тур (опубликованный). Последние замены на 10 тур могут отсутствовать."));
  assert.ok(text.includes("Проверьте основу:\n? Хуссем Мрезиг — прогноз основы недоступен.\n⚠ Мирлинд Даку (К) — вне основы по прогнозу."));
  assert.ok(text.includes("Проверьте скамейку:\n? Андрес Аларкон, Александр Сандрачук — прогноз основы недоступен.\n⚠ Александр Беляев, Егор Любаков — вне основы по прогнозу."));
  assert.equal(text.split("\n").filter((line) => /^[?⚠] /.test(line)).length, 4);
  for (const finding of classified.findings) assert.equal(text.split(finding.name).length - 1, 1);
  assert.ok(!text.includes("Нет надёжных данных"));
  assert.ok(!text.includes("Не хватает данных"));
  assert.ok(!text.includes("ALT недоступен"));
  assert.ok(classified.findings.some((finding) => finding.reasons.some((reason) => reason.text.includes("ALT недоступен"))));
});

/** @spec spec://modules/telegram/FEAT-007-deadline-assistant#message */
test("out-of-XI groups by visible reasons and hides only missing ALT", () => {
  const outside = { available: true, inXi: false, coveredFixtures: 1, stale: false, source: "SORAREINSIDE" };
  const classified = classifyDeadlinePlayers({
    players: [
      player({ name: "Капитан", isCaptain: true, predictedXi: outside }),
      player({ playerId: "2", name: "Вице", isViceCaptain: true, alt: null, predictedXi: outside }),
      player({ playerId: "3", name: "Без ALT", alt: null }),
      player({ playerId: "4", name: "Ноль", alt: 0, predictedXi: outside }),
      player({ playerId: "5", name: "Не сопоставлен", mappingComplete: false, predictedXi: outside })
    ], scheduleKnown: true, scheduleComplete: true
  });
  const before = JSON.stringify(classified);
  const text = renderDeadlineReport(reportInput(classified)).parts[0]!;
  assert.ok(text.includes("⚠ Капитан (К), Вице (В) — вне основы по прогнозу."));
  assert.ok(text.includes("? Без ALT — ALT недоступен."));
  assert.ok(text.includes("⚠ Ноль — вне основы по прогнозу; ALT 0."));
  assert.ok(text.includes("? Не сопоставлен — вне основы по прогнозу; неполный маппинг игрока."));
  assert.equal(JSON.stringify(classified), before, "presentation must preserve raw diagnostics");
  assert.equal(text.split("Вице").length - 1, 1);
});

/** @spec spec://modules/telegram/FEAT-007-deadline-assistant#message */
test("grouped findings preserve lineup roles and partial coverage without duplicate summaries", () => {
  const classified = classifyDeadlinePlayers({
    players: [
      player({ playerId: "1", name: "Капитан", isCaptain: true, fixtureCount: 0, alt: 0 }),
      player({ playerId: "2", name: "Вице", isViceCaptain: true, fixtureCount: 0, alt: 0 }),
      player({ playerId: "3", name: "Запасной", isStarter: false, fixtureCount: 0, alt: 0 }),
      player({ playerId: "4", name: "Двойной тур", fixtureCount: 2, predictedXi: { available: true, inXi: false, coveredFixtures: 1, stale: false, source: "SORAREINSIDE" } })
    ],
    scheduleKnown: true,
    scheduleComplete: true
  });
  const text = renderDeadlineReport(reportInput(classified)).parts.join("\n");
  assert.ok(text.includes("⛔ Капитан (К), Вице (В) — нет матча в туре; ALT 0."));
  assert.ok(text.includes("Проверьте скамейку:\n⛔ Запасной — нет матча в туре; ALT 0."));
  assert.ok(text.includes("? Двойной тур — прогноз основы есть не для всех матчей."));
  assert.equal(text.split("Двойной тур").length - 1, 1);
  assert.ok(!text.includes("Не хватает данных"));
});

/** @spec spec://modules/telegram/FEAT-007-deadline-assistant#message */
test("general degradation stays visible once and never implies a completed risk check", () => {
  const text = renderDeadlineReport(reportInput({
    findings: [],
    degraded: ["опубликованный состав Sports не найден", "не сопоставлено игроков: 2", "не сопоставлено игроков: 2"]
  })).parts.join("\n");
  assert.ok(text.includes("Проверка неполная"));
  assert.ok(text.includes("Не хватает данных: опубликованный состав Sports не найден; не сопоставлено игроков: 2"));
  assert.equal(text.split("не сопоставлено игроков: 2").length - 1, 1);
  assert.ok(!text.includes("Рисков не найдено"));
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

test("transfer popularity sections render the official top without points and without ownership deltas", () => {
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
        }
      ]
    })
  );
  const text = parts[0]!;
  assert.match(text, /Популярные трансферы Sports \(топ-2\):/);
  assert.match(text, /1\. Жилсон Беншимол, Акрон\n/);
  assert.match(text, /2\. Иван Обляков, ЦСКА\n/);
  assert.ok(!text.includes("48 очков"), "points stay out of the message");
  assert.ok(!text.includes("очков"));
  const buildSource = readFileSync(new URL("./build.ts", import.meta.url), "utf8");
  assert.match(buildSource, /const official = bestByKey\.get\("BUYS:TRANSFERS_OFFICIAL"\)/);
  assert.match(buildSource, /key\.endsWith\(":TRANSFERS_GAIN"\) \|\| key\.endsWith\(":TRANSFERS_DROP"\)/);
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

test("missing kickoff no longer needs a fabricated time column", () => {
  const block = renderScheduleBlock([{ home: "A", away: "B", kickoffAt: null, status: null }]);
  assert.equal(block, "Матчи тура\nA - B");
});

test("long reports split deterministically with the same tag and part numbers", () => {
  const findings = Array.from({ length: 240 }, (_, index) => ({
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
  const playerIds = [...first.parts.join("\n").matchAll(/Очень длинное имя игрока (\d+)/g)].map((match) => match[1]);
  assert.equal(playerIds.length, 240);
  assert.equal(new Set(playerIds).size, 240);
  const shorter = renderDeadlineReport(reportInput({ findings, maxLength: 512 }));
  assert.ok(shorter.parts.every((part) => part.length <= 512));
  assert.equal([...shorter.parts.join("\n").matchAll(/Очень длинное имя игрока (\d+)/g)].length, 240);
});
