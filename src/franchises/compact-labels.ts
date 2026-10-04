/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#ui */
type Point = { id: string; name: string; x: number; y: number };
type Label = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const aliases: Record<string, string> = {
  "3 hundred $$$ from Хамовники": "Хамовники",
  "Орден Красной Звезды": "ОКЗ",
  "Нестандартное положение": "Нестандарт",
  "Закончившие после первого тура": "После 1-го тура",
  "Тёмная лошадка выходит на арену": "Тёмная лошадка",
  "Сборная Гондураса по хоккею": "Гондурас",
  "Алматинский Спартак": "Алм. Спартак",
  "League Football Manager": "LFM",
};

export function compactNames(
  rows: { id: string; name: string }[],
): Map<string, string> {
  const names = rows.map(({ id, name }) => {
    const full = name.trim();
    const words = full
      .split(/\s+/)
      .filter((w) => !/^(the|and|of|from|club|team|fc)$/i.test(w));
    const clean = words.join(" ") || full;
    const short =
      aliases[full] ??
      (clean.length <= 14
        ? clean
        : words.length > 1
          ? `${words[0]} ${words
              .slice(1)
              .map((w) => w[0] + ".")
              .join("")}`
          : clean);
    return { id, full, short };
  });
  // A shortened display name must never silently identify two different teams.
  return new Map(
    names.map((r) => [
      r.id,
      names.some((other) => other.id !== r.id && other.short === r.short)
        ? r.full
        : r.short,
    ]),
  );
}

export function compactLabels(
  points: Point[],
  width: number,
  measure?: (text: string) => number,
): Map<string, Label> {
  const names = compactNames(points);
  const ordered = [...points].sort((a, b) => a.id.localeCompare(b.id));
  const overlap = (a: Label, b: Label) =>
    Math.max(
      0,
      Math.min(a.x + a.width + 1, b.x + b.width + 1) - Math.max(a.x, b.x),
    ) *
    Math.max(
      0,
      Math.min(a.y + a.height + 1, b.y + b.height + 1) - Math.max(a.y, b.y),
    );
  const distance = (p: Point, b: Label) =>
    Math.hypot(
      Math.max(b.x - p.x, p.x - b.x - b.width, 0),
      Math.max(b.y - p.y, p.y - b.y - b.height, 0),
    );
  const shortNames = ordered.map((p) => {
    const name = names.get(p.id)!;
    const words = name.split(/\s+/);
    return words.length > 1
      ? words[0].length <= 10
        ? words[0]
        : words.map((w) => w[0]).join("")
      : name;
  });
  const candidates = ordered.map((p, index) => {
    const full = names.get(p.id)!;
    const short = shortNames[index];
    const variants =
      short !== full &&
      shortNames.filter((n) => n === short).length === 1 &&
      ![...names.values()].some((n) => n === short)
        ? [full, short]
        : [full];
    const result: (Label & { base: number })[] = [];
    for (const [variant, text] of variants.entries()) {
      const w =
        (measure?.(text) ??
          [...text].reduce(
            (n, c) =>
              n + (/[ilI1.,· ]/.test(c) ? 2.7 : /[MWШЩЮЖ]/.test(c) ? 8 : 5.5),
            0,
          )) + 4;
      for (const gap of [6, 10, 14]) {
        const positions = [
          [p.x + gap, p.y - 6],
          [p.x - w - gap, p.y - 6],
          [p.x - w / 2, p.y - 12 - gap],
          [p.x - w / 2, p.y + gap],
          [p.x + gap, p.y - 12 - gap / 2],
          [p.x - w - gap, p.y - 12 - gap / 2],
          [p.x + gap, p.y + gap / 2],
          [p.x - w - gap, p.y + gap / 2],
        ];
        for (const [x, y] of positions) {
          const box = {
            text,
            x: Math.max(6, Math.min(width - w - 6, x)),
            y: Math.max(8, Math.min(370, y)),
            width: w,
            height: 12,
          };
          const ownDistance = distance(p, box);
          const pointPenalty = ordered.reduce((cost, q) => {
            const d = distance(q, box);
            return (
              cost +
              (d < 5 ? (5 - d) * 3000 : 0) +
              (q !== p && d + 2 < ownDistance ? (ownDistance - d) * 2 : 0)
            );
          }, 0);
          result.push({
            ...box,
            base: variant * 12 + ownDistance * 0.7 + pointPenalty,
          });
        }
      }
    }
    return result;
  });
  if (!ordered.length) return new Map();
  const choices = candidates.map((cs) =>
    cs.reduce((best, c, i) => (c.base < cs[best].base ? i : best), 0),
  );
  const localCost = (i: number, c: number) =>
    candidates[i][c].base +
    choices.reduce(
      (cost, selected, j) =>
        cost +
        (i === j
          ? 0
          : overlap(candidates[i][c], candidates[j][selected]) * 1000),
      0,
    );
  const totalCost = () =>
    choices.reduce(
      (sum, c, i) =>
        sum +
        candidates[i][c].base +
        choices
          .slice(0, i)
          .reduce(
            (cost, selected, j) =>
              cost + overlap(candidates[i][c], candidates[j][selected]) * 1000,
            0,
          ),
      0,
    );
  // Revisit every label: early choices must not permanently trap later labels.
  const settle = () => {
    for (let pass = 0; pass < 12; pass++) {
      let changed = false;
      for (let k = 0; k < ordered.length; k++) {
        const i = pass % 2 ? ordered.length - 1 - k : k;
        let best = choices[i],
          cost = localCost(i, best);
        for (let c = 0; c < candidates[i].length; c++) {
          const next = localCost(i, c);
          if (next < cost) {
            cost = next;
            best = c;
          }
        }
        changed ||= best !== choices[i];
        choices[i] = best;
      }
      if (!changed) break;
    }
  };
  settle();
  let best = [...choices],
    bestCost = totalCost(),
    currentCost = bestCost;
  let seed = 137;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Fixed budget and seed give repeatable layouts without a growing cache.
  const iterations = Math.min(40000, ordered.length * 600);
  for (let step = 0; step < iterations; step++) {
    const i = Math.floor(random() * ordered.length),
      c = Math.floor(random() * candidates[i].length);
    const delta = localCost(i, c) - localCost(i, choices[i]);
    const temperature = 1500 * (1 - step / iterations) ** 3 + 0.1;
    if (delta <= 0 || random() < Math.exp(-delta / temperature)) {
      choices[i] = c;
      currentCost += delta;
      if (currentCost < bestCost) {
        bestCost = currentCost;
        best = [...choices];
      }
    }
  }
  choices.splice(0, choices.length, ...best);
  settle();
  return new Map(ordered.map((p, i) => [p.id, candidates[i][choices[i]]]));
}

