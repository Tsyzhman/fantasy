import assert from "node:assert/strict";
import test from "node:test";

import {
  FOTMOB_PITCH_LENGTH_METERS,
  FOTMOB_PITCH_WIDTH_METERS,
  normalized_shot_axis_coordinate,
  normalize_fotmob_pitch_coordinates
} from "./shot-coordinates";

test("normalizes FotMob metric pitch coordinates to percentages", () => {
  const [x, y] = normalize_fotmob_pitch_coordinates(94, 34);

  assert.equal(x?.toFixed(3), "89.524");
  assert.equal(y?.toFixed(3), "50.000");
});

test("stored normalized coordinates are authoritative for drawing", () => {
  assert.equal(normalized_shot_axis_coordinate(90, 90, FOTMOB_PITCH_LENGTH_METERS), 90);
  assert.equal(normalized_shot_axis_coordinate(50, 50, FOTMOB_PITCH_WIDTH_METERS), 50);
});

test("raw FotMob coordinates are normalized only when stored percentages are missing", () => {
  assert.equal(normalized_shot_axis_coordinate(null, 94, FOTMOB_PITCH_LENGTH_METERS)?.toFixed(3), "89.524");
  assert.equal(normalized_shot_axis_coordinate(null, 34, FOTMOB_PITCH_WIDTH_METERS)?.toFixed(3), "50.000");
});

test("fractional stored normalized coordinates are accepted as 0 to 1 percentages", () => {
  assert.equal(normalized_shot_axis_coordinate(0.9, 94, FOTMOB_PITCH_LENGTH_METERS), 90);
  assert.equal(normalized_shot_axis_coordinate(0.5, 34, FOTMOB_PITCH_WIDTH_METERS), 50);
});
