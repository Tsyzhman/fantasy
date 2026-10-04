/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#ui */
import test from "node:test";
import assert from "node:assert/strict";
import { compactLabels, compactNames } from "./compact-labels";

test("display abbreviations remove whole filler words, preserving canonical names", () => {
  const rows = [
    { id: "a", name: "The Avengers" },
    { id: "b", name: "FC Viking" },
    { id: "c", name: "Theatre" },
    { id: "d", name: "Red Wings" },
  ];
  const labels = compactNames(rows);
  assert.equal(labels.get("a"), "Avengers");
  assert.equal(labels.get("b"), "Viking");
  assert.equal(labels.get("c"), "Theatre");
  assert.equal(labels.get("d"), "Red Wings");
  assert.equal(rows[0].name, "The Avengers");
});

test("ambiguous abbreviations fall back to distinguishable full names", () => {
  const names = compactNames([
    { id: "a", name: "The Avengers" },
    { id: "b", name: "Avengers" },
  ]);
  assert.equal(new Set(names.values()).size, 2);
});

test("bounded layout keeps every label and never mutates chart coordinates", () => {
  const points = Array.from({ length: 75 }, (_, i) => ({
    id: String(i),
    name: `Team ${i}`,
    x: 80 + (i % 15) * 38,
    y: 50 + Math.floor(i / 15) * 58,
  }));
  const before = structuredClone(points);
  const labels = compactLabels(points, 720);
  assert.equal(labels.size, 75);
  assert.deepEqual(points, before);
  for (const label of labels.values()) {
    assert.ok(label.x >= 0 && label.x + label.width <= 720);
    assert.ok(label.y >= 0 && label.y + label.height <= 390);
  }
  const boxes = [...labels.values()];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      assert.ok(
        !(
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y
        ),
      );
    }
});

test("dense labels stay close to their own point without moving data", () => {
  const points = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    name: `Team ${i}`,
    x: 250 + (i % 5) * 3,
    y: 150 + Math.floor(i / 5) * 3,
  }));
  const before = structuredClone(points);
  const labels = compactLabels(points, 720);
  for (const p of points) {
    const b = labels.get(p.id)!;
    const dx = Math.max(b.x - p.x, p.x - b.x - b.width, 0);
    const dy = Math.max(b.y - p.y, p.y - b.y - b.height, 0);
    assert.ok(Math.hypot(dx, dy) <= 19, `Detached label ${p.id}`);
  }
  assert.deepEqual(points, before);
});
