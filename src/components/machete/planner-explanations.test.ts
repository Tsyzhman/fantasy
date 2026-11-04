/** @spec spec://common/PROP-002-editorial-sport-design#contracts */
import assert from "node:assert/strict";
import test from "node:test";

import type { FantasyPlannerPlayer } from "@/machete/squad_logic";
import { alternativeFiveRoundFpTitle, playerPrimaryHorizonForecastTitle } from "./planner-explanations";

function forecastPlayer(roundPoints: Array<number | null>) {
  // Deliberately exercise incomplete provider payloads as well as the typed DTO.
  return { roundPoints, forecastModelVersion: "fixture-model" } as unknown as FantasyPlannerPlayer;
}

for (const language of ["en", "ru"] as const) {
  for (const horizon of [3, 5]) {
    for (const [name, values, expectedValues] of [
      ["leading missing", [null, 4, 8], [null, 4, 8, null, null]],
      ["interior missing", [4, null, 8, 0, 2], [4, null, 8, 0, 2]],
      ["zero and nonfinite", [0, NaN, Infinity, -Infinity, 4], [0, null, null, null, 4]]
    ] as const) {
      test(`primary horizon keeps original round numbers: ${language}/${horizon}/${name}`, () => {
        const title = playerPrimaryHorizonForecastTitle(forecastPlayer([...values]), language, null, horizon);
        const lines = title.split("\n");
        const roundLines = lines.filter((line) => /^(Round|Тур) \d+:/.test(line));
        assert.deepEqual(roundLines, expectedValues.slice(0, horizon).map((value, index) => language === "en"
          ? `Round ${index + 1}: ${value === null ? "unavailable" : `${value} FP`}`
          : `Тур ${index + 1}: ${value === null ? "нет прогноза" : `${value} ФО`}`));
        assert.ok(!title.includes("NaN") && !title.includes("Infinity") && !title.includes("∞"));
        assert.match(title, /fixture-model/);
      });
    }

    test(`alternative horizon header names the selected horizon: ${language}/${horizon}`, () => {
      const title = alternativeFiveRoundFpTitle(language, horizon);
      assert.ok(title.includes(String(horizon)));
      assert.ok(!title.includes(String(horizon === 3 ? 5 : 3)));
      assert.ok(!title.includes("пять"));
    });
  }

  test(`primary horizon reports all missing rounds without inventing zeros: ${language}`, () => {
    const title = playerPrimaryHorizonForecastTitle(forecastPlayer([null, NaN]), language, null, 3);
    assert.equal(title.split("\n").filter((line) => line.endsWith(language === "en" ? "unavailable" : "нет прогноза")).length, 3);
    assert.ok(title.includes(language === "en" ? "No round-by-round values available yet." : "Значений по отдельным турам пока нет."));
    assert.ok(!title.includes(language === "en" ? ": 0 FP" : ": 0 ФО"));
  });

  test(`alternative horizon defaults to five rounds: ${language}`, () => {
    assert.ok(alternativeFiveRoundFpTitle(language).includes("5"));
  });
}
