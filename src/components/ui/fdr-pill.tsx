import { cn } from "@/lib/cn";

/**
 * FDR — fixture difficulty rating, 1 (easiest) to 5 (hardest).
 * Accepts either an explicit difficulty number, a numeric opponent rank, or null.
 */
export function FdrPill({
  difficulty,
  label,
  title,
  className
}: {
  difficulty: number | null | undefined;
  label?: string;
  title?: string;
  className?: string;
}) {
  const safe = clampDifficulty(difficulty);
  const klass = safe === null ? "fdr-na" : `fdr-${safe}`;
  return (
    <span className={cn("fdr-pill", klass, className)} aria-label={title ?? label}>
      {label ?? (safe ?? "—")}
    </span>
  );
}

export function FdrRow({
  fixtures,
  className
}: {
  fixtures: Array<{ label: string; difficulty: number | null | undefined; title?: string }>;
  className?: string;
}) {
  if (fixtures.length === 0) return null;
  return (
    <div className={cn("inline-flex flex-wrap gap-1", className)}>
      {fixtures.map((fixture, index) => (
        <FdrPill
          key={`${fixture.label}-${index}`}
          difficulty={fixture.difficulty}
          label={fixture.label}
          title={fixture.title ?? fixture.label}
        />
      ))}
    </div>
  );
}

function clampDifficulty(value: number | null | undefined): 1 | 2 | 3 | 4 | 5 | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const rounded = Math.round(value);
  if (rounded <= 1) return 1;
  if (rounded === 2) return 2;
  if (rounded === 3) return 3;
  if (rounded === 4) return 4;
  return 5;
}
