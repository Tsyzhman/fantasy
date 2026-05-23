import { cn } from "@/lib/cn";

type LeagueFlagInput = {
  id?: string | null;
  name?: string | null;
  code?: string | null;
  country?: string | null;
};

type FlagShape =
  | { kind: "h-stripes"; colors: string[] }
  | { kind: "v-stripes"; colors: string[] }
  | { kind: "cross-h"; bg: string; fg: string; thickness?: number }
  | { kind: "cross-d"; bg: string; fg: string }
  | { kind: "solid"; color: string; symbol?: string; symbolColor?: string }
  | { kind: "trophy" };

const flags: Record<string, FlagShape> = {
  england: { kind: "cross-h", bg: "#ffffff", fg: "#cf142b", thickness: 0.18 },
  scotland: { kind: "cross-d", bg: "#0065bd", fg: "#ffffff" },
  germany: { kind: "h-stripes", colors: ["#000000", "#dd0000", "#ffce00"] },
  france: { kind: "v-stripes", colors: ["#0055a4", "#ffffff", "#ef4135"] },
  italy: { kind: "v-stripes", colors: ["#009246", "#ffffff", "#ce2b37"] },
  spain: { kind: "h-stripes", colors: ["#aa151b", "#f1bf00", "#aa151b"] },
  portugal: { kind: "v-stripes", colors: ["#006600", "#cc0000"] },
  netherlands: { kind: "h-stripes", colors: ["#ae1c28", "#ffffff", "#21468b"] },
  russia: { kind: "h-stripes", colors: ["#ffffff", "#0036a6", "#d52b1e"] },
  turkey: { kind: "solid", color: "#e30a17", symbol: "★", symbolColor: "#ffffff" },
  belgium: { kind: "v-stripes", colors: ["#000000", "#fdda24", "#ef3340"] },
  switzerland: { kind: "solid", color: "#d52b1e", symbol: "+", symbolColor: "#ffffff" },
  austria: { kind: "h-stripes", colors: ["#ed2939", "#ffffff", "#ed2939"] },
  greece: { kind: "h-stripes", colors: ["#0d5eaf", "#ffffff", "#0d5eaf", "#ffffff", "#0d5eaf"] },
  denmark: { kind: "cross-h", bg: "#c8102e", fg: "#ffffff", thickness: 0.18 },
  sweden: { kind: "cross-h", bg: "#006aa7", fg: "#fecc00", thickness: 0.18 },
  norway: { kind: "cross-h", bg: "#ef2b2d", fg: "#ffffff", thickness: 0.18 },
  poland: { kind: "h-stripes", colors: ["#ffffff", "#dc143c"] },
  ukraine: { kind: "h-stripes", colors: ["#005bbb", "#ffd500"] },
  argentina: { kind: "h-stripes", colors: ["#74acdf", "#ffffff", "#74acdf"] },
  brazil: { kind: "solid", color: "#009c3b", symbol: "♦", symbolColor: "#ffdf00" },
  chile: { kind: "h-stripes", colors: ["#ffffff", "#d52b1e"] },
  colombia: { kind: "h-stripes", colors: ["#ffcd00", "#ffcd00", "#003893", "#ce1126"] },
  uruguay: { kind: "h-stripes", colors: ["#ffffff", "#0038a8", "#ffffff", "#0038a8"] },
  paraguay: { kind: "h-stripes", colors: ["#d52b1e", "#ffffff", "#0038a8"] },
  peru: { kind: "v-stripes", colors: ["#d91023", "#ffffff", "#d91023"] },
  ecuador: { kind: "h-stripes", colors: ["#ffd700", "#ffd700", "#0072bb", "#ed1c24"] },
  bolivia: { kind: "h-stripes", colors: ["#d52b1e", "#f9e300", "#007934"] },
  venezuela: { kind: "h-stripes", colors: ["#ffcc00", "#003893", "#cf142b"] },
  "united states": { kind: "h-stripes", colors: ["#b22234", "#ffffff", "#b22234", "#ffffff", "#b22234"] },
  "saudi arabia": { kind: "solid", color: "#006c35", symbol: "✦", symbolColor: "#ffffff" },
  international: { kind: "trophy" }
};

const idToCountry: Record<string, string> = {
  "premier-league": "england",
  championship: "england",
  bundesliga: "germany",
  "ligue-1": "france",
  "serie-a": "italy",
  "la-liga": "spain",
  "primeira-liga": "portugal",
  eredivisie: "netherlands",
  "russian-premier-league": "russia",
  "turkish-super-lig": "turkey",
  "world-cup-2026": "international"
};

const codeToCountry: Record<string, string> = {
  EPL: "england",
  CHA: "england",
  BUN: "germany",
  L1: "france",
  SA: "italy",
  LL: "spain",
  POR: "portugal",
  ERE: "netherlands",
  RPL: "russia",
  TSL: "turkey",
  WC26: "international"
};

export function LeagueFlag({
  league,
  size = 28,
  className,
  title
}: {
  league: LeagueFlagInput;
  size?: number;
  className?: string;
  title?: string;
}) {
  const country = resolveCountry(league);
  const shape: FlagShape = country ? flags[country] ?? { kind: "trophy" } : { kind: "trophy" };
  const labelTitle = title ?? league.name ?? league.country ?? "Flag";

  return (
    <span
      className={cn("inline-block overflow-hidden rounded-sm border border-black/10 align-middle", className)}
      style={{ width: size, height: Math.round(size * 0.64) }}
      role="img"
      aria-label={labelTitle}
      title={labelTitle}
    >
      <svg
        viewBox="0 0 30 20"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {renderShape(shape)}
      </svg>
    </span>
  );
}

function renderShape(shape: FlagShape) {
  if (shape.kind === "h-stripes") {
    const h = 20 / shape.colors.length;
    return shape.colors.map((color, i) => (
      <rect key={i} x={0} y={i * h} width={30} height={h} fill={color} />
    ));
  }
  if (shape.kind === "v-stripes") {
    const w = 30 / shape.colors.length;
    return shape.colors.map((color, i) => (
      <rect key={i} x={i * w} y={0} width={w} height={20} fill={color} />
    ));
  }
  if (shape.kind === "cross-h") {
    const t = (shape.thickness ?? 0.18) * 20;
    return (
      <>
        <rect x={0} y={0} width={30} height={20} fill={shape.bg} />
        <rect x={0} y={(20 - t) / 2} width={30} height={t} fill={shape.fg} />
        <rect x={(30 - t * 1.5) / 2} y={0} width={t * 1.5} height={20} fill={shape.fg} />
      </>
    );
  }
  if (shape.kind === "cross-d") {
    return (
      <>
        <rect x={0} y={0} width={30} height={20} fill={shape.bg} />
        <line x1={0} y1={0} x2={30} y2={20} stroke={shape.fg} strokeWidth={3} />
        <line x1={30} y1={0} x2={0} y2={20} stroke={shape.fg} strokeWidth={3} />
      </>
    );
  }
  if (shape.kind === "solid") {
    return (
      <>
        <rect x={0} y={0} width={30} height={20} fill={shape.color} />
        {shape.symbol ? (
          <text
            x={15}
            y={14}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={shape.symbolColor ?? "#ffffff"}
          >
            {shape.symbol}
          </text>
        ) : null}
      </>
    );
  }
  return (
    <>
      <rect x={0} y={0} width={30} height={20} fill="#0f172a" />
      <text x={15} y={15} textAnchor="middle" fontSize={13} fontWeight={700} fill="#f1f5f9">
        ★
      </text>
    </>
  );
}

function resolveCountry(league: LeagueFlagInput): string | null {
  const id = league.id?.toLowerCase();
  if (id && idToCountry[id]) return idToCountry[id];
  const code = league.code?.toUpperCase();
  if (code && codeToCountry[code]) return codeToCountry[code];
  const country = league.country?.toLowerCase();
  if (country && flags[country]) return country;
  const name = league.name?.toLowerCase() ?? "";
  if (name.includes("championship") && country?.includes("england")) return "england";
  if (name.includes("premier league") && country?.includes("england")) return "england";
  if (country) return country;
  return null;
}
