import assert from "node:assert/strict";
import test from "node:test";

import { buildShotHeatField, heatColor } from "./shot-heatmap";

const AREA = { left: 18, top: 18, width: 644, height: 300 };

test("Empty shot list produces an empty heat field", () => {
  const field = buildShotHeatField([], AREA);
  assert.equal(field.cells.length, 0);
});

test("A single shot peaks at its own cell with decaying neighbors", () => {
  const field = buildShotHeatField([{ x: 320, y: 160, weight: 0.5 }], AREA);
  assert.ok(field.cells.length > 0);
  const peak = field.cells.reduce((best, cell) => (cell.intensity > best.intensity ? cell : best));
  assert.equal(peak.intensity, 1);
  // Peak sits within one cell of the shot location.
  assert.ok(Math.abs(peak.cx - 320) <= field.cellSize);
  assert.ok(Math.abs(peak.cy - 160) <= field.cellSize);
});

test("xG weighting concentrates the hot zone on the heavier shot", () => {
  const big = { x: 200, y: 150, weight: 0.9 };
  const small = { x: 500, y: 250, weight: 0.05 };
  const field = buildShotHeatField([big, small], AREA);
  const nearBig = field.cells
    .filter((cell) => Math.abs(cell.cx - big.x) < 20 && Math.abs(cell.cy - big.y) < 20)
    .reduce((max, cell) => Math.max(max, cell.intensity), 0);
  const nearSmall = field.cells
    .filter((cell) => Math.abs(cell.cx - small.x) < 20 && Math.abs(cell.cy - small.y) < 20)
    .reduce((max, cell) => Math.max(max, cell.intensity), 0);
  assert.ok(nearBig > nearSmall);
});

test("Intensities stay normalized to [0, 1]", () => {
  const points = Array.from({ length: 40 }, (_, index) => ({
    x: 100 + (index % 8) * 15,
    y: 120 + Math.floor(index / 8) * 15,
    weight: 0.3
  }));
  const field = buildShotHeatField(points, AREA);
  for (const cell of field.cells) {
    assert.ok(cell.intensity > 0 && cell.intensity <= 1);
  }
});

test("Heat color ramps from warm yellow to red", () => {
  assert.equal(heatColor(0), "rgb(253, 230, 138)");
  assert.equal(heatColor(1), "rgb(220, 38, 38)");
  assert.equal(heatColor(0.55), "rgb(249, 115, 22)");
});
