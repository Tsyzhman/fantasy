/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#ui */
import test from "node:test";
import assert from "node:assert/strict";
import { chartLabels } from "./chart-labels";

test("75 overlapping franchise points retain bounded, separate name labels", () => {
  const points = Array.from({ length: 75 }, (_, i) => ({
    id: String(i),
    name: `Франшиза с длинным именем ${i}`,
    x: 720,
    y: 120,
  }));
  const labels = chartLabels(points, {
    left: 63,
    right: 788,
    top: 31,
    bottom: 1090,
  });
  assert.equal(labels.size, 75);
  const boxes = [...labels.values()];
  for (const [i, a] of boxes.entries()) {
    assert.ok(a.x >= 63 && a.x + a.w <= 788 && a.y >= 31 && a.y + a.h <= 1090);
    for (const b of boxes.slice(i + 1))
      assert.ok(
        a.x + a.w <= b.x ||
          b.x + b.w <= a.x ||
          a.y + a.h <= b.y ||
          b.y + b.h <= a.y,
      );
  }
});

test("labels leave the actual point locations clear for profile selection", () => {
  const points = Array.from({ length: 75 }, (_, i) => ({
    id: String(i),
    name: `Команда ${i}`,
    x: 100 + i * 8,
    y: 80 + i * 12,
  }));
  for (const box of chartLabels(points, {
    left: 63,
    right: 788,
    top: 31,
    bottom: 1090,
  }).values()) {
    for (const p of points)
      assert.ok(
        p.x < box.x - 8 ||
          p.x > box.x + box.w + 8 ||
          p.y < box.y - 8 ||
          p.y > box.y + box.h + 8,
      );
  }
});
