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
): Map<string, Label> {
  const names = compactNames(points);
  const placed: Label[] = [];
  const output = new Map<string, Label>();
  const overlap = (a: Label, b: Label) =>
    Math.max(
      0,
      Math.min(a.x + a.width + 2, b.x + b.width + 2) - Math.max(a.x, b.x),
    ) *
    Math.max(
      0,
      Math.min(a.y + a.height + 2, b.y + b.height + 2) - Math.max(a.y, b.y),
    );
  const density = (p: Point) =>
    points.filter((q) => Math.hypot(p.x - q.x, p.y - q.y) < 70).length;
  const ordered = [...points].sort(
    (a, b) => density(b) - density(a) || a.y - b.y || a.id.localeCompare(b.id),
  );
  for (const p of ordered) {
    const text = names.get(p.id)!;
    const w =
      [...text].reduce(
        (n, c) =>
          n + (/[ilI1.,· ]/.test(c) ? 3.2 : /[MWШЩЮЖ]/.test(c) ? 9 : 6.3),
        0,
      ) + 4;
    const candidates: (Label & { cost: number })[] = [];
    for (let radius = 6; radius <= 18; radius += 4) {
      for (let angle = 0; angle < 16; angle++) {
        const dx = Math.cos((angle * Math.PI) / 8),
          dy = Math.sin((angle * Math.PI) / 8);
        const box = {
          text,
          x: Math.max(
            6,
            Math.min(
              width - w - 6,
              p.x + dx * radius - (dx < -0.25 ? w : dx > 0.25 ? 0 : w / 2),
            ),
          ),
          y: Math.max(8, Math.min(370, p.y + dy * radius - 7)),
          width: w,
          height: 13,
        };
        const collisions = placed.reduce((n, b) => n + overlap(box, b), 0);
        const dots = points.reduce(
          (n, q) =>
            n +
            (q.x > box.x - 5 &&
            q.x < box.x + w + 5 &&
            q.y > box.y - 5 &&
            q.y < box.y + 18
              ? 1
              : 0),
          0,
        );
        candidates.push({
          ...box,
          cost: collisions * 10000 + dots * 100000 + radius + Math.abs(dy) * 2,
        });
      }
    }
    const best = candidates.reduce((a, b) => (a.cost <= b.cost ? a : b));
    placed.push(best);
    output.set(p.id, best);
  }
  return output;
}
