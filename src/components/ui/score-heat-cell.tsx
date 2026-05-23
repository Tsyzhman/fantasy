import { formatScore } from "@/lib/format";
import { cn } from "@/lib/cn";

type Tone = "emerald" | "sky" | "amber" | "brand";

const toneColor: Record<Tone, string> = {
  emerald: "#10b981",
  sky: "#0ea5e9",
  amber: "#f59e0b",
  brand: "#6366f1"
};

const toneText: Record<Tone, string> = {
  emerald: "text-emerald-700",
  sky: "text-sky-700",
  amber: "text-amber-700",
  brand: "text-brand-700"
};

export function ScoreHeatCell({
  value,
  rank,
  tone = "emerald",
  className
}: {
  value: number | null | undefined;
  /** percentile 0..1 within the visible set */
  rank: number | null;
  tone?: Tone;
  className?: string;
}) {
  const fill = clamp01(rank ?? 0);
  const style = {
    "--heat-color": toneColor[tone],
    "--heat-fill": String(fill)
  } as React.CSSProperties;
  return (
    <span
      className={cn(
        "score-heat inline-flex w-full justify-end px-2 py-1 text-right font-semibold num-tabular",
        toneText[tone],
        className
      )}
      style={style}
    >
      {formatScore(value ?? null)}
    </span>
  );
}

export function computeRanks(values: Array<number | null | undefined>): Array<number | null> {
  const numeric = values
    .map((v, i) => ({ v, i }))
    .filter((entry): entry is { v: number; i: number } => typeof entry.v === "number" && Number.isFinite(entry.v));
  if (numeric.length === 0) return values.map(() => null);
  numeric.sort((a, b) => a.v - b.v);
  const ranks = new Array<number | null>(values.length).fill(null);
  numeric.forEach((entry, sortedIndex) => {
    const percentile = numeric.length === 1 ? 1 : sortedIndex / (numeric.length - 1);
    ranks[entry.i] = percentile;
  });
  return ranks;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
