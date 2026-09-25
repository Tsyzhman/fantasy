import assert from "node:assert/strict";
import test from "node:test";
import { contestTagAlias, deadlineTag } from "./tags";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#message
 */
test("deadline tags recognise Russian and English contest names", () => {
  assert.equal(deadlineTag("Sports.ru Championship", 9), "#Чемпиошип9");
  assert.equal(deadlineTag("Sports.ru Premier League", 10), "#Англия10");
  assert.equal(deadlineTag("Sports.ru Champions League", 2), "#ЛигаЧемпионов2");
  assert.equal(deadlineTag("Sports.ru Europa League", 3), "#ЛигаЕвропы3");
  assert.equal(deadlineTag("Sports.ru LaLiga", 8), "#Испания8");
  assert.equal(deadlineTag("Sports.ru Bundesliga", 5), "#Германия5");
  assert.equal(deadlineTag("Sports.ru Serie A", 6), "#Италия6");
  assert.equal(deadlineTag("Sports.ru Ligue 1", 6), "#Франция6");
  assert.equal(deadlineTag("Sports.ru Eredivisie", 8), "#Нидерланды8");
  assert.equal(deadlineTag("Sports.ru Liga Portugal", 8), "#Португалия8");
  assert.equal(deadlineTag("Sports.ru Super Lig", 7), "#Турция7");
});

test("unknown contests require an explicit alias instead of a guessed tag", () => {
  assert.equal(contestTagAlias("Sports.ru Mystery Cup"), null);
  assert.equal(deadlineTag("Sports.ru Mystery Cup", 1), null);
});
