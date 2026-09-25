import assert from "node:assert/strict";
import test from "node:test";
import { computeTransferDeltas } from "./transfers";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#acceptance
 */
function player(id: string, name: string, team: string, chart: Array<[string, string, number]>) {
  return {
    id,
    name,
    price: 6.5,
    team: { name: team },
    status: {
      selectedBy: chart[0]?.[2] ?? null,
      chartSelectedBy: chart.map(([tourId, tourName, selectedBy]) => ({
        selectedBy,
        tour: { id: tourId, name: tourName }
      }))
    }
  };
}

test("deltas use the requested tour against the previous one and rank both directions", () => {
  const players = [
    player("1", "Рост Первый", "Клуб A", [["10", "10 тур", 15.56], ["9", "9 тур", 6.63], ["8", "8 тур", 2.86]]),
    player("2", "Рост Второй", "Клуб B", [["10", "10 тур", 20.0], ["9", "9 тур", 15.0]]),
    player("3", "Падение", "Клуб C", [["10", "10 тур", 5.0], ["9", "9 тур", 12.5]]),
    player("4", "Без графика", "Клуб D", [])
  ];
  const result = computeTransferDeltas(players, "10");
  assert.equal(result.tourId, "10");
  assert.equal(result.tourLabel, "10 тур");
  assert.equal(result.chartedPlayers, 3);
  assert.deepEqual(result.gainers.map((entry) => [entry.rank, entry.name, entry.valueText]), [
    [1, "Рост Первый", "+8.93 п.п."],
    [2, "Рост Второй", "+5.00 п.п."]
  ]);
  assert.deepEqual(result.losers.map((entry) => [entry.rank, entry.name, entry.valueText]), [[1, "Падение", "-7.50 п.п."]]);
});

test("without a requested tour the newest published tour is used", () => {
  const players = [player("1", "Игрок", "Клуб", [["2291", "9 тур", 10], ["2290", "8 тур", 4]])];
  const result = computeTransferDeltas(players, null);
  assert.equal(result.tourId, "2291");
  assert.equal(result.tourLabel, "9 тур");
  assert.equal(result.gainers[0]?.valueText, "+6.00 п.п.");
});

test("players without the previous tour are not invented", () => {
  const players = [player("1", "Новичок", "Клуб", [["10", "10 тур", 12]])];
  const result = computeTransferDeltas(players, "10");
  assert.equal(result.gainers.length, 0);
  assert.equal(result.losers.length, 0);
});

test("zero deltas and entries above the top-10 are skipped", () => {
  const players = [
    player("0", "Ноль", "Клуб", [["10", "10", 7], ["9", "9", 7]]),
    ...Array.from({ length: 12 }, (_, index) => player(String(index + 1), `Игрок ${index + 1}`, "Клуб", [["10", "10", index + 1], ["9", "9", 0]]))
  ];
  const result = computeTransferDeltas(players, "10");
  assert.equal(result.gainers.length, 10);
  assert.equal(result.gainers[0]?.name, "Игрок 12");
  assert.ok(!result.gainers.some((entry) => entry.name === "Ноль"));
});
