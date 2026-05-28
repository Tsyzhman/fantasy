import { cn } from "@/lib/cn";

type SparkLineProps = {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  ariaLabel?: string;
};

export function SparkLine({ values, width = 64, height = 20, className, ariaLabel }: SparkLineProps) {
  const cleaned = values.filter((value) => Number.isFinite(value));
  if (cleaned.length === 0) {
    return (
      <span className={cn("inline-block text-slate-400 num-tabular", className)} title={ariaLabel}>
        —
      </span>
    );
  }

  const min = Math.min(...cleaned, 0);
  const max = Math.max(...cleaned, 0);
  const range = max - min || 1;
  const stepX = cleaned.length > 1 ? width / (cleaned.length - 1) : 0;
  const pointX = (i: number) => (cleaned.length > 1 ? i * stepX : width / 2);
  const pointY = (value: number) => height - 2 - ((value - min) / range) * (height - 4);

  const polyline = cleaned.map((value, i) => `${pointX(i).toFixed(2)},${pointY(value).toFixed(2)}`).join(" ");
  const lastIndex = cleaned.length - 1;
  const trendUp = cleaned.length > 1 && cleaned[lastIndex] >= cleaned[lastIndex - 1];
  const stroke = trendUp ? "var(--brand-500, #6366f1)" : "rgb(244, 114, 182)";
  const fill = trendUp ? "rgb(99, 102, 241)" : "rgb(244, 114, 182)";

  const label = ariaLabel ?? `FP: ${cleaned.map((v) => v.toFixed(1)).join(", ")}`;

  return (
    <span
      className={cn("inline-block align-middle", className)}
      style={{ width, height }}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
        {cleaned.length > 1 ? (
          <polyline
            points={polyline}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        <circle cx={pointX(lastIndex)} cy={pointY(cleaned[lastIndex])} r={2} fill={fill} />
      </svg>
    </span>
  );
}
