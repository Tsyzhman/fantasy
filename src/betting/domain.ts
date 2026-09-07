/** @spec spec://modules/betting/FEAT-001-virtual-league#algorithms */
export const INITIAL_COINS = 100_000;
export const STRATEGY_VERSION = "2026-09-07.1";
export const BOTS = [
  { name: "Mia", window: 20, xg: .5, edge: .06, rest: false, description: "Баланс: 50% голы + 50% xG, 20 игр, EV от 6%" },
  { name: "Abella", window: 20, xg: .75, edge: .09, rest: false, description: "Качество моментов: 75% xG, 20 игр, EV от 9%" },
  { name: "Lana", window: 8, xg: .5, edge: .10, rest: false, description: "Короткая форма: 8 игр, EV от 10%" },
  { name: "Riley", window: 20, xg: 0, edge: .09, rest: true, description: "Голы и отдых: 20 игр, EV от 9%" },
  { name: "Adriana", window: 20, xg: .5, edge: .10, rest: false, description: "Консенсус длинной и короткой формы, EV от 10%" }
] as const;
export type Rule = { kind: "result" | "double" | "total" | "handicap" | "btts"; side: string; line?: number };
export type Selection = { key: string; eventId: number; factorId: number; parameter: string; label: string; group: string; odds: number; rule: Rule | null; manual: boolean; enabled: boolean };
export type HistoryRow = { at: string; home: boolean; goals: number; conceded: number; xg: number | null; xga: number | null };
export type ModelInput = { home: HistoryRow[]; away: HistoryRow[]; leagueHome: number; leagueAway: number; kickoff: string };
export type Recommendation = { name: string; version: string; probability: number | null; ev: number | null; decision: "BET" | "SKIP"; reason: string; lambdaHome?: number; lambdaAway?: number };

// Settlement uses only explicit factor contracts, never guessed market labels.
export function factorRule(id: number, parameter: string): Rule | null {
  const line = Number(parameter);
  if ([921,922,923].includes(id)) return { kind: "result", side: String(id - 921) };
  if ([924,925,1571].includes(id)) return { kind: "double", side: id === 924 ? "1X" : id === 925 ? "X2" : "12" };
  if ([4241,4242].includes(id)) return { kind: "btts", side: id === 4241 ? "yes" : "no" };
  if (!parameter || !Number.isFinite(line) || Math.abs(line) > 100 || Math.abs(line * 4 - Math.round(line * 4)) > .00001) return null;
  const overs = [930,1696,1727,1730,1733,1736,1739,1793,1796];
  const unders = [931,1697,1728,1731,1734,1737,1791,1794,1797];
  if (overs.includes(id) || unders.includes(id)) return { kind: "total", side: overs.includes(id) ? "over" : "under", line };
  const ho = [1809,1812,1815,1818,1821,1824,1827,1830];
  const hu = [1810,1813,1816,1819,1822,1825,1828,1831];
  const ao = [1854,1873,1880,1883,1886,1893,1896,1899];
  const au = [1871,1874,1881,1884,1887,1894,1897,1900];
  if (ho.includes(id) || hu.includes(id)) return { kind: "total", side: ho.includes(id) ? "homeOver" : "homeUnder", line };
  if (ao.includes(id) || au.includes(id)) return { kind: "total", side: ao.includes(id) ? "awayOver" : "awayUnder", line };
  const hh = [910,927,989,1569,1672]; const ah = [912,928,991,1572,1675];
  if (hh.includes(id) || ah.includes(id)) return { kind: "handicap", side: hh.includes(id) ? "home" : "away", line };
  return null;
}

/** Gross payout multiplier; quarters split into adjacent half-lines. */
export function payoutMultiplier(rule: Rule, home: number, away: number, odds: number): number {
  const decide = (v: number) => v > 0 ? odds : v === 0 ? 1 : 0;
  if (rule.kind === "result") return ((home > away ? "0" : home === away ? "1" : "2") === rule.side) ? odds : 0;
  if (rule.kind === "double") return (rule.side === "1X" ? home >= away : rule.side === "X2" ? away >= home : home !== away) ? odds : 0;
  if (rule.kind === "btts") return ((home > 0 && away > 0) === (rule.side === "yes")) ? odds : 0;
  const line = rule.line!;
  const at = (l: number) => rule.kind === "handicap"
    ? decide((rule.side === "home" ? home - away : away - home) + l)
    : decide(((rule.side.startsWith("home") ? home : rule.side.startsWith("away") ? away : home + away) - l) * (rule.side.toLowerCase().endsWith("under") ? -1 : 1));
  return Math.abs(line * 2 - Math.round(line * 2)) > .00001 ? (at(line - .25) + at(line + .25)) / 2 : at(line);
}

function means(rows: HistoryRow[], window: number, xgWeight: number, baseFor: number, baseAgainst: number) {
  const usable = rows.slice(0, window);
  if (usable.length < 5 || (xgWeight > 0 && usable.filter(r => r.xg !== null && r.xga !== null).length < 5)) return null;
  let scored = baseFor * 5, conceded = baseAgainst * 5, weight = 5;
  usable.forEach((r, i) => {
    const w = Math.pow(.5, i / (window / 2));
    const mix = r.xg === null || r.xga === null ? 0 : xgWeight;
    // Remove historic venue advantage before applying target venue.
    const venue = r.home ? 1.1 : .9;
    scored += w * ((1 - mix) * r.goals + mix * (r.xg ?? 0)) / venue;
    conceded += w * ((1 - mix) * r.conceded + mix * (r.xga ?? 0)) * venue;
    weight += w;
  });
  return { attack: scored / weight, defence: conceded / weight };
}
function lambdas(input: ModelInput, bot: typeof BOTS[number]) {
  const base = (input.leagueHome + input.leagueAway) / 2;
  const h = means(input.home, bot.window, bot.xg, base, base), a = means(input.away, bot.window, bot.xg, base, base);
  if (!h || !a) return null;
  let home = input.leagueHome * h.attack / base * a.defence / base;
  let away = input.leagueAway * a.attack / base * h.defence / base;
  if (bot.rest) {
    const rest = (rows: HistoryRow[]) => (Date.parse(input.kickoff) - Date.parse(rows[0].at)) / 86400000;
    home *= rest(input.home) < 4 ? .95 : 1;
    away *= rest(input.away) < 4 ? .95 : 1;
  }
  return { home: Math.max(.2, Math.min(4.5, home)), away: Math.max(.2, Math.min(4.5, away)) };
}
function poisson(lambda: number) { const p = [Math.exp(-lambda)]; for (let i=1;i<=24;i++) p.push(p[i-1]*lambda/i); return p; }
function expectation(rule: Rule, odds: number, rates: { home: number; away: number }) {
  const h = poisson(rates.home), a = poisson(rates.away);
  let expected = 0, win = 0, mass = 0;
  h.forEach((ph,i) => a.forEach((pa,j) => { const p = ph*pa, m = payoutMultiplier(rule,i,j,odds); expected += p*m; if(m>1) win+=p; mass+=p; }));
  return { ev: expected / mass - 1, probability: win / mass };
}
export function recommend(selection: Selection, input: ModelInput | null): Recommendation[] {
  return BOTS.map(bot => {
    const skip = (reason: string): Recommendation => ({ name: bot.name, version: STRATEGY_VERSION, probability: null, ev: null, decision: "SKIP", reason });
    if (!selection.rule || selection.manual) return skip("Нет модели для этого рынка");
    if (!input) return skip("Матч не сопоставлен со статистикой");
    const rates = lambdas(input, bot);
    if (!rates) return skip("Недостаточно истории: нужно минимум 5 матчей");
    let e = expectation(selection.rule, selection.odds, rates);
    if(bot.name === "Adriana") {
      const short = lambdas(input, BOTS[2]);
      if (!short) return skip("Недостаточно данных для консенсуса");
      const other = expectation(selection.rule, selection.odds, short);
      if (other.ev < e.ev) e = other;
    }
    const bet = e.ev >= bot.edge && selection.odds >= 1.2 && selection.odds <= 6 && selection.enabled;
    return { name: bot.name, version: STRATEGY_VERSION, ...e, lambdaHome: rates.home, lambdaAway: rates.away, decision: bet ? "BET" : "SKIP", reason: bet ? `EV выше порога ${bot.edge*100}%` : selection.odds > 6 ? "Коэффициент выше лимита 6" : `Нет преимущества от ${bot.edge*100}%` };
  });
}
