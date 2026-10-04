/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#style */
export type Fact = {
  franchise: number;
  slug: string;
  round: number;
  manager: string;
  team: string;
  [key: string]: unknown;
};
export type FreezePerson = { manager: string; score: number | null };
export type FreezeEvent = {
  franchise: number;
  slug: string;
  round: number;
  n: number;
  valid: boolean;
  finished: boolean;
  board_verified: boolean;
  gain: number | null;
  source: string;
  frozen: FreezePerson[];
  substitutes: FreezePerson[];
};
export type Snapshot = {
  version: number;
  personalHistory?: boolean;
  xfoCaptainMultiplier?: 1 | 2;
  season: string;
  generated: string;
  acquisition: { from: string; to: string };
  franchises: { id: number; name: string; kind?: "virtual" }[];
  leagues: Record<string, string>;
  rounds: {
    slug: string;
    round: number;
    finished: boolean;
    cutoff: string | null;
    date?: string | null;
  }[];
  squads: Fact[];
  purchases: Fact[];
  xfoExamples: Fact[];
  freeze: {
    events: FreezeEvent[];
    basis: {
      franchise: number;
      slug: string;
      round: number;
      n_active: number;
    }[];
  };
  checks: Record<string, unknown>;
};
export type Filters = {
  from: string;
  to: string;
  leagues: string[];
  completed: boolean;
};
export type Summary = {
  id: string;
  name: string;
  franchise: number | null;
  count: number;
  leagues: number;
  buys: number;
  metrics: Record<string, number | null>;
  rarity: number | null;
  rank: number | null;
  xfoComplete: number;
  xfoEligible: number;
  xfoCoverage: number | null;
  xfoFilled: number;
  activeRounds: number;
  reserveRounds: number;
  personalRounds: number;
  missingLineups: number;
  virtual?: boolean;
};
export const METRICS = [
  "own",
  "own_gap",
  "own_cohort_gap",
  "diff_share",
  "cap",
  "cap_gap",
  "rare_cap",
  "buy_delta",
  "buy_delta_gap",
  "buy_form",
  "buy_form_gap",
  "buy_peak",
  "buy_cold",
  "fo_xi_pct",
  "alt_xi_pct",
  "ffo_xi_pct",
  "fo_buy_pct",
  "alt_buy_pct",
  "ffo_buy_pct",
  "triple_cap_disagree",
  "current_fo",
  "current_alt",
  "current_ffo",
  "xfo",
  "xfo_actual",
  "xfo_gap",
] as const;
export function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function mean(values: (number | null)[]): number | null {
  const ok = values.filter((v): v is number => v !== null);
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
}
function group<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(item);
  }
  return out;
}
function balanced(groups: Fact[][], key: string) {
  return mean(
    groups.map((g) =>
      mean(g.map((r) => number(r[key]))),
    ),
  );
}
export function parseFilters(
  params: URLSearchParams,
  leagues: Record<string, string>,
): Filters {
  const read = (name: string, fallback: string) => {
    const s = params.get(name);
    if (s === null) return fallback;
    if (!validDate(s))
      throw new Error("Укажите календарную дату в формате ГГГГ-ММ-ДД.");
    return s;
  };
  const from = read("from", "2026-07-01"),
    to = read("to", "2027-06-30");
  if (from > to)
    throw new Error(
      "Начальная дата не может быть позже конечной.",
    );
  const selected = [
    ...new Set(
      params
        .getAll("league")
        .flatMap((s) => s.split(","))
        .filter(Boolean),
    ),
  ];
  if (selected.some((s) => !Object.hasOwn(leagues, s)))
    throw new Error("Неизвестный чемпионат.");
  const season = params.get("season");
  if (season && season !== "2026/2027")
    throw new Error("Доступен сезон 2026/27.");
  if (params.has("completed") && !["0", "1"].includes(params.get("completed")!))
    throw new Error("Некорректный фильтр завершения.");
  return {
    from,
    to,
    leagues: selected,
    completed: params.get("completed") === "1",
  };
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}

/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#contracts */
export function roundDate(round: Snapshot["rounds"][number]): string | null {
  if (round.date && validDate(round.date)) return round.date;
  if (!round.cutoff) return null;
  // Version 1 exported naive UTC timestamps. Never interpret them in the host timezone.
  const cutoff = /(?:Z|[+-]\d{2}:\d{2})$/.test(round.cutoff)
    ? round.cutoff : round.cutoff + "Z";
  const time = Date.parse(cutoff);
  return Number.isFinite(time)
    ? new Date(time + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
}
function summary(
  id: string,
  name: string,
  rows: Fact[],
  franchise: number | null,
): Summary {
  const eligible = rows.filter((r) => r.finished === true);
  const complete = eligible.filter((r) => r.xfo_complete === true);
  const metrics: Record<string, number | null> = {};
  const latest = [...group(rows, (r) => `${r.slug}:${r.team}`).values()].map(
    (g) => g.reduce((a, b) => (a.round > b.round ? a : b)),
  );
  // The membership of these groups is identical for every metric. Preserve
  // insertion and summation order, while grouping each population only once.
  const allGroups = [...group(rows, (r) => r.slug).values()];
  const completeGroups = [...group(complete, (r) => r.slug).values()];
  const latestGroups = [...group(latest, (r) => r.slug).values()];
  for (const key of METRICS)
    metrics[key] = balanced(
      key.startsWith("xfo")
        ? completeGroups
        : key.startsWith("current_")
          ? latestGroups
          : allGroups,
      key,
    );
  return {
    id,
    name,
    franchise,
    count: rows.length,
    leagues: new Set(rows.map((r) => r.slug)).size,
    buys: rows.reduce((n, r) => n + (number(r.n_buy) ?? 0), 0),
    metrics,
    rarity: null,
    rank: null,
    xfoComplete: complete.length,
    xfoEligible: eligible.length,
    xfoFilled: eligible.reduce((n, r) => n + (number(r.xfo_filled) ?? 0), 0),
    activeRounds: rows.filter((r) => r.active === true).length,
    reserveRounds: rows.filter((r) => r.active === false).length,
    personalRounds: rows.filter((r) => r.personal_only === true).length,
    missingLineups: rows.filter((r) => r.lineup_missing === true).length,
    xfoCoverage: eligible.length
      ? (eligible.reduce((n, r) => n + (number(r.xfo_known) ?? 0), 0) /
          (eligible.length * 11)) *
        100
      : null,
  };
}
function rankStyle(rows: Summary[]) {
  const keys = ["own_cohort_gap", "cap_gap", "buy_delta_gap"];
  const eligible = rows.filter((r) => keys.every((k) => r.metrics[k] !== null));
  for (const row of eligible) {
    row.rarity = keys.reduce((sum, k, i) => {
      const value = row.metrics[k]!;
      const below = eligible.filter((x) => x.metrics[k]! < value).length;
      const equal = eligible.filter((x) => x.metrics[k] === value).length;
      const rank = below + (equal + 1) / 2;
      const score =
        eligible.length > 1
          ? ((eligible.length - rank) / (eligible.length - 1)) * 100
          : 50;
      return sum + score * [0.4, 0.3, 0.3][i];
    }, 0);
  }
  rows.sort(
    (a, b) =>
      (b.rarity ?? -1) - (a.rarity ?? -1) || a.name.localeCompare(b.name, "ru"),
  );
  for (const row of eligible)
    row.rank =
      1 + eligible.filter((x) => x.rarity! > row.rarity! + 1e-9).length;
  return rows;
}
function hypothesisContext(purchases: Fact[]) {
  const unique = [
    ...group(
      purchases,
      (r) => `${r.franchise}:${r.slug}:${r.round}:${r.h2h_id}`,
    ).values(),
  ].map((g) => g[0]);
  const controls = [
    ...group(
      unique.filter((r) => r.triple_model_low === 0),
      (r) => `${r.slug}:${r.round}:${r.h2h_id}`,
    ).values(),
  ].map((g) => g[0]);
  const groups = group(controls, (r) => `${r.slug}:${r.round}:${r.pos}`);
  return { groups, byFranchise: group(unique, (r) => String(r.franchise)) };
}

function hypotheses(context: ReturnType<typeof hypothesisContext>, franchise: number) {
  const { groups } = context;
  const unique = context.byFranchise.get(String(franchise)) ?? [];
  const flags = [
    {
      key: "trend",
      limit: 2,
      label: "Рост формы минимум на 2 очка",
      low: false,
    },
    { key: "own", limit: 10, label: "Владение ниже 10%", low: true },
    {
      key: "fdr_pre",
      limit: 4,
      label: "Сложный ближайший соперник (FDR ≥4)",
      low: false,
    },
    {
      key: "minutes_change",
      limit: 15,
      label: "Рост игрового времени минимум на 15 минут",
      low: false,
    },
    {
      key: "attack_change",
      limit: 0.15,
      label: "Рост xG+xA/90 минимум на 0,15",
      low: false,
    },
    {
      key: "underreturn",
      limit: 1,
      label: "Недореализация: xG+xA выше голов и передач минимум на 1",
      low: false,
    },
  ];
  return flags.map((flag) => {
    const pairs: { value: number; control: number }[] = [];
    for (const r of unique.filter(
      (r) => r.franchise === franchise && r.triple_model_low === 1,
    )) {
      const v = number(r[flag.key]);
      if (v === null) continue;
      const peers = (groups.get(`${r.slug}:${r.round}:${r.pos}`) ?? [])
        .filter((c) => c.h2h_id !== r.h2h_id)
        .map((c) => number(c[flag.key]))
        .filter((v): v is number => v !== null);
      if (peers.length < 3) continue;
      const check = (n: number) =>
        flag.low ? n < flag.limit : n >= flag.limit;
      pairs.push({
        value: Number(check(v)) * 100,
        control: mean(peers.map((n) => Number(check(n)) * 100))!,
      });
    }
    return {
      label: flag.label,
      n: pairs.length,
      share: mean(pairs.map((p) => p.value)),
      control: mean(pairs.map((p) => p.control)),
    };
  });
}
export function aggregate(snapshot: Snapshot, filters: Filters) {
  const scope = (r: Snapshot["rounds"][number]) => {
    const date = roundDate(r);
    return date !== null && date >= filters.from && date <= filters.to &&
      (!filters.leagues.length || filters.leagues.includes(r.slug));
  };
  const rounds = snapshot.rounds
    .filter(scope)
    .filter((r) => !filters.completed || r.finished);
  const keys = new Set(rounds.map((r) => `${r.slug}:${r.round}`));
  const rows = snapshot.squads.filter((r) => keys.has(`${r.slug}:${r.round}`));
  const virtual = new Set(snapshot.franchises.filter((f) => f.kind === "virtual").map((f) => f.id));
  const franchiseScope = (r: Fact) => !r.personal_only || virtual.has(r.franchise);
  const franchiseRows = rows.filter(franchiseScope);
  const purchases = snapshot.purchases.filter((r) =>
    keys.has(`${r.slug}:${r.round}`) && franchiseScope(r),
  );
  const controls = hypothesisContext(purchases);
  const rowsByFranchise = group(franchiseRows, (r) => String(r.franchise));
  const purchasesByFranchise = group(purchases, (r) => String(r.franchise));
  const examplesByFranchise = group(
    snapshot.xfoExamples.filter((r) => keys.has(`${r.slug}:${r.round}`) && franchiseScope(r)),
    (r) => String(r.franchise),
  );
  const franchises = rankStyle(
    snapshot.franchises
      .map((f) =>
        ({...summary(
          String(f.id),
          f.name,
          rowsByFranchise.get(String(f.id)) ?? [],
          f.id,
        ), virtual: f.kind === "virtual"}),
      ),
  );
  const managers = rankStyle(
    [...group(rows, (r) => `${r.franchise}:${r.manager}`).entries()].map(
      ([id, g]) => ({ ...summary(id, g[0].manager, g, g[0].franchise), virtual: virtual.has(g[0].franchise) }),
    ),
  );
  const byLeague = [
    ...group(franchiseRows, (r) => `${r.franchise}:${r.slug}`).entries(),
  ].map(([id, g]) => ({
    ...summary(id, snapshot.leagues[g[0].slug], g, g[0].franchise),
    slug: g[0].slug,
  }));
  const timeline = [
    ...group(franchiseRows, (r) => `${r.franchise}:${r.slug}:${r.round}`).entries(),
  ].map(([id, g]) => ({
    ...summary(id, String(g[0].round), g, g[0].franchise),
    slug: g[0].slug,
    round: g[0].round,
  }));
  const events = snapshot.freeze.events.filter((r) =>
    keys.has(`${r.slug}:${r.round}`),
  );
  const freezes = snapshot.franchises.filter((f) => f.kind !== "virtual").map((f) => {
    const selected = events.filter((r) => r.franchise === f.id);
    const complete = selected.filter(
      (r) => r.valid && r.finished && r.board_verified && r.gain !== null,
    );
    const basis = snapshot.freeze.basis.filter(
      (r) =>
        r.franchise === f.id &&
        keys.has(`${r.slug}:${r.round}`) &&
        r.n_active >= 5,
    );
    return {
      id: f.id,
      name: f.name,
      episodes: selected.length,
      slots: selected.reduce((n, r) => n + r.n, 0),
      rounds: basis.length,
      frequency: basis.length ? (selected.length / basis.length) * 100 : null,
      completed: complete.length,
      success: complete.filter((r) => r.gain! > 0).length,
      gain: complete.reduce((n, r) => n + r.gain!, 0),
    };
  });
  return {
    season: snapshot.season,
    xfoCaptainMultiplier: snapshot.xfoCaptainMultiplier ?? 2,
    generated: snapshot.generated,
    acquisition: snapshot.acquisition,
    personalHistory: snapshot.personalHistory === true,
    filters,
    leagues: snapshot.leagues,
    availableRounds: snapshot.rounds,
    rounds: rounds.length,
    squads: franchiseRows.length,
    managerSquads: rows.length,
    undatedRounds: snapshot.rounds.filter((r) => roundDate(r) === null && (!filters.leagues.length || filters.leagues.includes(r.slug))).length,
    buys: purchases.length,
    franchises,
    managers,
    byLeague,
    timeline,
    freezes,
    events,
    models: snapshot.franchises.map((f) => ({
      id: f.id,
      hypotheses: hypotheses(controls, f.id),
      examples: (purchasesByFranchise.get(String(f.id)) ?? [])
        .filter((r) => r.triple_model_low === 1)
        .slice(0, 20),
    })),
    xfoExamples: snapshot.franchises.flatMap((f) =>
      (examplesByFranchise.get(String(f.id)) ?? [])
        .slice(0, 40),
    ),
  };
}
export type Analytics = ReturnType<typeof aggregate>;
