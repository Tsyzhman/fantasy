import assert from "node:assert/strict";
import test from "node:test";

import { getSportsRuCalendarSource } from "./sports-ru-calendar";

test("Championship calendar uses the canonical Sports.ru fantasy route", () => {
  assert.equal(
    getSportsRuCalendarSource("championship")?.fantasyUrl,
    "https://www.sports.ru/fantasy/football/championship/",
  );
});
