"use client";
/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#ui */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Analytics, Summary } from "@/franchises/analytics";
import { calendarRangeError, number } from "@/franchises/analytics";
import styles from "./ui.module.css";
import { compactLabels } from "@/franchises/compact-labels";

type Row = Record<string, string | number | null>;
type Column = { key: string; label: string; digits?: number; suffix?: string };
const fmt = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined
    ? "—"
    : v.toLocaleString("ru-RU", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      });
const metric = (r: Summary, key: string) => r.metrics[key] ?? null;
const dateLabel = (value: string) => value.split("-").reverse().join(".");

function downloadCsv(rows: Row[], columns: Column[]) {
  const escape = (v: unknown) =>
    '"' +
    (typeof v === "string" && /^[=+@-]/.test(v)
      ? "'" + v
      : String(v ?? "")
    ).replaceAll('"', '""') +
    '"';
  const csv =
    "\ufeff" +
    [
      columns.map((c) => escape(c.label)).join(";"),
      ...rows.map((r) => columns.map((c) => escape(r[c.key])).join(";")),
    ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "franchises.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Table({
  rows,
  columns,
  onSelect,
  initialSort,
}: {
  rows: Row[];
  columns: Column[];
  onSelect?: (id: string) => void;
  initialSort?: string;
}) {
  const [sort, setSort] = useState(initialSort ?? "");
  const [descending, setDescending] = useState(true);
  const [search, setSearch] = useState("");
  const visible = rows
    .filter((r) =>
      Object.values(r).some((v) =>
        String(v ?? "")
          .toLocaleLowerCase("ru")
          .includes(search.toLocaleLowerCase("ru")),
      ),
    )
    .sort((a, b) => {
      if (!sort) return 0;
      const x = a[sort],
        y = b[sort];
      if (x === null || x === undefined)
        return y === null || y === undefined ? 0 : 1;
      if (y === null || y === undefined) return -1;
      return (
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "ru")) * (descending ? -1 : 1)
      );
    });

  return (
    <div className={styles.tableBlock}>
      <div className={styles.tableTools}>
        <input
          aria-label="Поиск по таблице"
          placeholder="Найти имя…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span>{visible.length} строк</span>
        <button
          className="ui-button"
          onClick={() => downloadCsv(visible, columns)}
        >
          Скачать CSV
        </button>
      </div>
      <div className={styles.tableScroll}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>
                  <button
                    onClick={() => {
                      setDescending(sort === c.key ? !descending : true);
                      setSort(c.key);
                    }}
                  >
                    {c.label}
                    {sort === c.key ? (descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={String(r.id ?? i)}>
                {columns.map((c, j) => (
                  <td key={c.key}>
                    {j === 0 && onSelect ? (
                      <button
                        className={styles.textButton}
                        onClick={() => onSelect(String(r.id))}
                      >
                        {r[c.key]}
                      </button>
                    ) : typeof r[c.key] === "number" ? (
                      fmt(r[c.key] as number, c.digits ?? 1) + (c.suffix ?? "")
                    ) : (
                      (r[c.key] ?? "—")
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && (
        <p className={styles.note}>На выбранной дистанции нет данных.</p>
      )}
    </div>
  );
}
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      {description && <p className={styles.note}>{description}</p>}
      {children}
    </section>
  );
}
function Stats({
  items,
}: {
  items: { label: string; value: string; detail: string }[];
}) {
  return (
    <div className={styles.stats}>
      {items.map((x) => (
        <div className={styles.card} key={x.label}>
          <div className={styles.note}>{x.label}</div>
          <strong>{x.value}</strong>
          <small>{x.detail}</small>
        </div>
      ))}
    </div>
  );
}

/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#ui */
function Scatter({
  rows,
  x,
  y,
  xlabel,
  ylabel,
  onSelect,
}: {
  rows: Summary[];
  x: string;
  y: string;
  xlabel: string;
  ylabel: string;
  onSelect: (id: string) => void;
}) {
  const plotHeight = rows.length > 40 ? 490 : 390;
  const plotBottom = plotHeight - 40;
  const plotSpan = plotHeight - 80;
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(960);
  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setPlotWidth(
        Math.max(
          rows.length > 40 ? 960 : 720,
          Math.round(entry.contentRect.width),
        ),
      ),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rows.length]);
  const geometry = useMemo(() => {
    const valid = rows.filter(
      (r) => metric(r, x) !== null && metric(r, y) !== null,
    );
    if (!valid.length) return null;
    const xs = valid.map((r) => metric(r, x)!);
    const ys = valid.map((r) => metric(r, y)!);
    const dx = Math.max(0.1, Math.max(...xs) - Math.min(...xs));
    const dy = Math.max(0.1, Math.max(...ys) - Math.min(...ys));
    const loX = Math.min(...xs) - dx * 0.13,
      hiX = Math.max(...xs) + dx * 0.13;
    const loY = Math.min(...ys) - dy * 0.15,
      hiY = Math.max(...ys) + dy * 0.15;
    return {
      loX,
      hiX,
      loY,
      hiY,
      points: valid.map((r) => ({
        r,
        px: 56 + ((metric(r, x)! - loX) / (hiX - loX)) * (plotWidth - 80),
        py: plotBottom - ((metric(r, y)! - loY) / (hiY - loY)) * plotSpan,
      })),
    };
  }, [rows, x, y, plotWidth, plotBottom, plotSpan]);
  const labels = useMemo(() => {
    const context =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
    if (context) context.font = "10px Arial";
    return compactLabels(
      geometry?.points.map((p) => ({
        id: p.r.id,
        name: p.r.name,
        x: p.px,
        y: p.py,
      })) ?? [],
      plotWidth,
      context ? (text) => context.measureText(text).width : undefined,
      plotHeight,
    );
  }, [geometry, plotWidth, plotHeight]);
  const pointColors = useMemo(() => {
    const points = geometry?.points ?? [];
    const proximity = (
      a: (typeof points)[number],
      b: (typeof points)[number],
    ) => {
      const la = labels.get(a.r.id)!,
        lb = labels.get(b.r.id)!;
      const leftA = Math.min(a.px - 4, la.x),
        rightA = Math.max(a.px + 4, la.x + la.width);
      const leftB = Math.min(b.px - 4, lb.x),
        rightB = Math.max(b.px + 4, lb.x + lb.width);
      const topA = Math.min(a.py - 4, la.y),
        bottomA = Math.max(a.py + 4, la.y + la.height);
      const topB = Math.min(b.py - 4, lb.y),
        bottomB = Math.max(b.py + 4, lb.y + lb.height);
      return Math.hypot(
        Math.max(leftA - rightB, leftB - rightA, 0),
        Math.max(topA - bottomB, topB - bottomA, 0),
      );
    };
    const assigned = new Map<string, number>();
    const remaining = [...points];
    while (remaining.length) {
      remaining.sort((a, b) => {
        const saturation = (p: typeof a) =>
          new Set(
            points
              .filter((q) => assigned.has(q.r.id) && proximity(p, q) < 35)
              .map((q) => assigned.get(q.r.id)),
          ).size;
        return saturation(b) - saturation(a) || a.r.id.localeCompare(b.r.id);
      });
      const point = remaining.shift()!;
      let color = 0,
        best = -1;
      for (let candidate = 0; candidate < 8; candidate++) {
        const distance = Math.min(
          Infinity,
          ...points
            .filter((p) => assigned.get(p.r.id) === candidate)
            .map((p) => proximity(point, p)),
        );
        if (distance > best) {
          best = distance;
          color = candidate;
        }
      }
      assigned.set(point.r.id, color);
    }
    return new Map(
      [...assigned].map(([id, color]) => [id, `var(--plot-color-${color})`]),
    );
  }, [geometry, labels]);
  const matches = rows
    .filter((r) =>
      r.name
        .toLocaleLowerCase("ru")
        .includes(search.trim().toLocaleLowerCase("ru")),
    )
    .sort((a, b) => {
      if (sort === "name" || sort === "name:desc")
        return a.name.localeCompare(b.name, "ru") * (sort === "name" ? 1 : -1);
      const [key, direction] = sort.split(":");
      const av = metric(a, key),
        bv = metric(b, key);
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      return (av - bv) * (direction === "asc" ? 1 : -1);
    });
  const matchIds = new Set(matches.map((r) => r.id));
  const active = rows.find((r) => r.id === (hover ?? selected));
  const activePoint = geometry?.points.find((p) => p.r.id === active?.id);
  return (
    <div className={styles.comparison}>
      <div className={styles.plotPanel} ref={plotRef}>
        <div className={styles.plotCaption}>
          <span>{ylabel} ↑</span>
          <span>
            {geometry?.points.length ?? 0} из {rows.length} на графике
          </span>
        </div>
        <div className={styles.plotViewport}>
          {geometry ? (
            <svg
              className={styles.scatter}
              viewBox={`0 0 ${plotWidth} ${plotHeight}`}
              style={{ width: plotWidth, height: plotHeight }}
              role="group"
              aria-label={`${xlabel}; ${ylabel}`}
            >
              {Array.from({ length: 5 }, (_, i) => (
                <g key={i}>
                  <line
                    x1="56"
                    y1={plotBottom - (i * plotSpan) / 4}
                    x2={plotWidth - 24}
                    y2={plotBottom - (i * plotSpan) / 4}
                    className={styles.gridLine}
                  />
                  <text
                    x="46"
                    y={plotBottom + 4 - (i * plotSpan) / 4}
                    textAnchor="end"
                  >
                    {fmt(
                      geometry.loY + ((geometry.hiY - geometry.loY) * i) / 4,
                      geometry.hiY - geometry.loY < 2 ? 2 : 1,
                    )}
                  </text>
                  <text
                    x={56 + (i * (plotWidth - 80)) / 4}
                    y={plotHeight - 12}
                    textAnchor="middle"
                  >
                    {fmt(
                      geometry.loX + ((geometry.hiX - geometry.loX) * i) / 4,
                      geometry.hiX - geometry.loX < 2 ? 2 : 1,
                    )}
                  </text>
                </g>
              ))}
              {geometry.loY < 0 && geometry.hiY > 0 && (
                <line
                  className={styles.zeroLine}
                  x1="56"
                  x2={plotWidth - 24}
                  y1={
                    plotBottom +
                    (geometry.loY / (geometry.hiY - geometry.loY)) * plotSpan
                  }
                  y2={
                    plotBottom +
                    (geometry.loY / (geometry.hiY - geometry.loY)) * plotSpan
                  }
                />
              )}
              {geometry.points.map(({ r, px, py }) => (
                <g
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${r.name}: ${xlabel} ${fmt(metric(r, x), 2)}; ${ylabel} ${fmt(metric(r, y), 2)}`}
                  aria-pressed={selected === r.id}
                  className={styles.plotPoint}
                  style={{
                    color: pointColors.get(r.id),
                    opacity:
                      (active && active.id !== r.id) || !matchIds.has(r.id)
                        ? 0.45
                        : 1,
                  }}
                  onMouseEnter={() => setHover(r.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(r.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => {
                    setSelected(r.id);
                    setHover(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(r.id);
                    }
                  }}
                >
                  <title>{r.name}</title>
                  <circle cx={px} cy={py} r="10" fill="transparent" />
                  <circle cx={px} cy={py} r="3.5" className={styles.dot} />
                  <text
                    className={styles.pointLabel}
                    textAnchor={
                      labels.get(r.id)!.x + labels.get(r.id)!.width <= px
                        ? "end"
                        : "start"
                    }
                    x={
                      labels.get(r.id)!.x + labels.get(r.id)!.width <= px
                        ? labels.get(r.id)!.x + labels.get(r.id)!.width - 2
                        : labels.get(r.id)!.x + 2
                    }
                    y={labels.get(r.id)!.y + 10}
                  >
                    {labels.get(r.id)!.text}
                  </text>
                </g>
              ))}
              {activePoint && (
                <g
                  pointerEvents="none"
                  aria-hidden="true"
                  style={{ color: pointColors.get(activePoint.r.id) }}
                >
                  <line
                    className={styles.crosshair}
                    x1="56"
                    x2={activePoint.px}
                    y1={activePoint.py}
                    y2={activePoint.py}
                  />
                  <line
                    className={styles.crosshair}
                    x1={activePoint.px}
                    x2={activePoint.px}
                    y1={activePoint.py}
                    y2={plotBottom}
                  />
                  <circle
                    cx={activePoint.px}
                    cy={activePoint.py}
                    r="5"
                    className={styles.activeDot}
                  />
                </g>
              )}
            </svg>
          ) : (
            <p className={styles.emptyPlot}>Недостаточно данных для графика.</p>
          )}
        </div>
        <div className={styles.axisCaption}>{xlabel} →</div>
        <div className={styles.plotDetail} aria-live="polite">
          {active ? (
            <>
              <div>
                <strong>{active.name}</strong>
                <button
                  className={styles.textButton}
                  onClick={() => onSelect(active.id)}
                >
                  Открыть профиль →
                </button>
              </div>
              <dl>
                <div>
                  <dt>{xlabel}</dt>
                  <dd>{fmt(metric(active, x), 2)}</dd>
                </div>
                <div>
                  <dt>{ylabel}</dt>
                  <dd>{fmt(metric(active, y), 2)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p>
              Выберите точку или название в списке.
              <br />
              <span>Здесь появятся точные значения и переход в профиль.</span>
            </p>
          )}
        </div>
        <p className={styles.plotHint}>
          Точка и её подпись одного цвета. Полное название — при наведении. На
          узком экране график можно прокрутить вбок.
        </p>
      </div>
      <details className={styles.plotDirectory}>
        <summary>Полные названия, поиск и CSV</summary>
        <div className={styles.directoryTools}>
          <input
            type="search"
            aria-label={`Найти франшизу: ${xlabel}`}
            placeholder="Найти франшизу…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label>
            Порядок
            <select
              aria-label={`Порядок франшиз: ${xlabel}`}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">По названию</option>
              <option value="name:desc">По названию Я–А</option>
              <option value={x}>{xlabel} ↓</option>
              <option value={`${x}:asc`}>{xlabel} ↑</option>
              <option value={y}>{ylabel} ↓</option>
              <option value={`${y}:asc`}>{ylabel} ↑</option>
            </select>
          </label>
        </div>
        <div className={styles.directoryCaption}>
          <span>Франшизы · {matches.length}</span>
          {selected && (
            <button
              onClick={() => {
                setSelected(null);
                setHover(null);
              }}
            >
              Снять выделение
            </button>
          )}
        </div>
        <div
          className={styles.directoryList}
          aria-label={`Франшизы на графике: ${xlabel}`}
        >
          {matches.map((r) => (
            <button
              key={r.id}
              className={styles.directoryRow}
              aria-pressed={selected === r.id}
              onClick={() => {
                setSelected(r.id);
                setHover(null);
              }}
            >
              <span>{r.name}</span>
              <small>
                {fmt(metric(r, x), 2)} <span>/</span> {fmt(metric(r, y), 2)}
              </small>
            </button>
          ))}
          {!matches.length && (
            <p className={styles.note}>Франшиза не найдена. Измените поиск.</p>
          )}
        </div>
        <button
          className={styles.textButton}
          onClick={() =>
            downloadCsv(
              matches.map((r) => ({
                name: r.name,
                x: metric(r, x),
                y: metric(r, y),
              })),
              [
                { key: "name", label: "Франшиза" },
                { key: "x", label: xlabel },
                { key: "y", label: ylabel },
              ],
            )
          }
        >
          Скачать CSV
        </button>
        <p className={styles.directoryKey}>
          Значения: горизонталь / вертикаль.
          <br />
          «—» — нет данных; такая точка не строится.
        </p>
      </details>
    </div>
  );
}

const choiceColumns: Column[] = [
  { key: "name", label: "Франшиза / менеджер" },
  { key: "rank", label: "Место по редкости", digits: 0 },
  { key: "rarity", label: "Редкость, 0–100", digits: 0 },
  { key: "own", label: "Владение основы", suffix: "%" },
  { key: "own_gap", label: "К общему полю, п.п.", digits: 2 },
  { key: "cap", label: "Популярность капитана", suffix: "%" },
  { key: "buy_delta", label: "H2h-Δ покупок", digits: 2 },
  { key: "buy_form_gap", label: "Δ формы, очки", digits: 2 },
  { key: "buy_peak", label: "На росте формы", suffix: "%" },
  { key: "count", label: "Составов", digits: 0 },
];
const asRows = (rows: Summary[]): Row[] =>
  rows.map((r) => ({
    id: r.id,
    name: r.name,
    rank: r.rank,
    rarity: r.rarity,
    count: r.count,
    activeRounds: r.virtual ? null : r.activeRounds,
    reserveRounds: r.virtual ? null : r.reserveRounds,
    personalRounds: r.virtual ? null : r.personalRounds,
    missingLineups: r.missingLineups,
    ...r.metrics,
  }));

export function FranchiseAnalytics({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const initial = new URLSearchParams(initialQuery);
  const [data, setData] = useState<Analytics | null>(null);
  const [settled, setSettled] = useState<{
    query: string;
    requestId: number;
    error: string;
  } | null>(null);
  const [requestId, setRequestId] = useState(0);
  const hasRequested = useRef(false);
  const immediate = useRef(false);
  const [from, setFrom] = useState(initial.get("from") ?? "2026-07-01");
  const [to, setTo] = useState(initial.get("to") ?? "2027-06-30");
  const [leagues, setLeagues] = useState<string[]>(
    [...new Set(initial.getAll("league").flatMap((s) => s.split(",")).filter(Boolean))],
  );
  const [completed, setCompleted] = useState(initial.get("completed") === "1");
  const [selected, setSelected] = useState(initial.get("franchise") ?? "");
  const [tab, setTab] = useState("choices");
  const dateError = calendarRangeError(from, to);
  const query = useMemo(() => {
    const q = new URLSearchParams({ from, to, completed: completed ? "1" : "0" });
    leagues.forEach((league) => q.append("league", league));
    return q.toString();
  }, [from, to, completed, leagues]);
  const matches = settled?.query === query && settled.requestId === requestId;
  const error = matches ? settled.error : "";
  const busy = !dateError && !matches;
  useEffect(() => {
    if (dateError) return;
    const controller = new AbortController();
    const delay = !hasRequested.current || immediate.current ? 0 : 350;
    immediate.current = false;
    const timer = setTimeout(() => {
      hasRequested.current = true;
      const q = new URLSearchParams(query);
      const franchise = new URLSearchParams(window.location.search).get("franchise");
      if (franchise) q.set("franchise", franchise);
      window.history.replaceState(null, "", "/franchises?" + q);
      fetch("/api/franchises?" + query, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok)
            throw new Error(
              typeof v.error === "string"
                ? v.error
                : (v.error?.message ?? "Не удалось загрузить аналитику."),
            );
          return v as Analytics;
        })
        .then((value) => {
          if (!controller.signal.aborted) {
            setData(value);
            setSettled({ query, requestId, error: "" });
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setSettled({ query, requestId, error: e.message });
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, requestId, dateError]);
  function apply() {
    immediate.current = true;
    setRequestId((v) => v + 1);
  }
  function select(value: string) {
    setSelected(value);
    const q = new URLSearchParams(window.location.search);
    if (value) q.set("franchise", value);
    else q.delete("franchise");
    history.replaceState(null, "", "/franchises?" + q);
  }
  const ownershipGroups = useMemo(
    () =>
      data
        ? [
            {
              title: "Основной состав и капитан · владение от 35%",
              rows: data.franchises.filter(
                (r) => metric(r, "own") !== null && metric(r, "own")! >= 35,
              ),
            },
            {
              title: "Основной состав и капитан · владение ниже 35%",
              rows: data.franchises.filter(
                (r) => metric(r, "own") !== null && metric(r, "own")! < 35,
              ),
            },
          ]
        : [],
    [data],
  );
  const purchaseGroups = useMemo(
    () =>
      data
        ? [
            {
              title: "Покупки и форма до тура · от 12 п.п.",
              rows: data.franchises.filter(
                (r) =>
                  metric(r, "buy_delta") !== null &&
                  metric(r, "buy_delta")! >= 12,
              ),
            },
            {
              title: "Покупки и форма до тура · ниже 12 п.п.",
              rows: data.franchises.filter(
                (r) =>
                  metric(r, "buy_delta") !== null &&
                  metric(r, "buy_delta")! < 12,
              ),
            },
          ]
        : [],
    [data],
  );
  const f = data?.franchises.find((f) => f.id === selected);
  const names = new Map(data?.franchises.map((f) => [f.franchise, f.name]));
  const shown = data ? (f ? [f] : data.franchises) : [];
  const events =
    data?.events.filter((e) => !f || e.franchise === f.franchise) ?? [];
  const freezeRows =
    data?.freezes.filter((e) => !f || e.id === f.franchise) ?? [];
  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>FANTASY · СЕЗОН 2026/27</span>
        <h1>Франшизы</h1>
        <p>
          Как выбирают игроков, когда покупают и что получают по качеству
          моментов.
        </p>
        {data && (
          <small>
            Источники:{" "}
            {new Date(data.acquisition.from).toLocaleDateString("ru-RU")} —{" "}
            {new Date(data.acquisition.to).toLocaleDateString("ru-RU")}. Расчёт:{" "}
            {new Date(data.generated).toLocaleString("ru-RU")}.
          </small>
        )}
      </div>
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label>
          С даты
          <input
            type="date"
            required
            aria-invalid={Boolean(dateError)}
            aria-describedby={dateError ? "franchise-filter-error" : "franchise-filter-note"}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          По дату
          <input
            type="date"
            required
            aria-invalid={Boolean(dateError)}
            aria-describedby={dateError ? "franchise-filter-error" : "franchise-filter-note"}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => setCompleted(e.target.checked)}
          />
          Только завершённые
        </label>
        {data && (
          <fieldset className={styles.leagues}>
            <legend>Лиги команд</legend>
            <div className={styles.leagueTools}>
              <span>Выбрано {leagues.length || Object.keys(data.leagues).length} из {Object.keys(data.leagues).length}</span>
              <select
                aria-label="Выбрать одну лигу"
                value={leagues.length === 1 ? leagues[0] : ""}
                onChange={(e) => {
                  if (e.target.value) setLeagues([e.target.value]);
                }}
              >
                <option value="" disabled>Выбрать одну лигу…</option>
                {Object.entries(data.leagues).map(([slug, name]) => (
                  <option key={slug} value={slug}>{name}</option>
                ))}
              </select>
              <button
                type="button"
                className="ui-button"
                onClick={() => setLeagues([])}
                disabled={!leagues.length}
              >
                Все лиги
              </button>
            </div>
            <div className={styles.leagueChoices}>
              {Object.entries(data.leagues).map(([slug, name]) => (
                <label key={slug} className={styles.leagueOption}>
                  <input
                    type="checkbox"
                    checked={!leagues.length || leagues.includes(slug)}
                    disabled={leagues.length === 1 && leagues[0] === slug}
                    onChange={(e) => {
                      const current = leagues.length
                        ? leagues
                        : Object.keys(data.leagues);
                      const next = e.target.checked
                        ? [...new Set([...current, slug])]
                        : current.filter((x) => x !== slug);
                      if (next.length) setLeagues(next);
                    }}
                  />
                  {name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <button className="ui-button" type="submit" disabled={Boolean(dateError)}>
          Показать дистанцию
        </button>
      </form>
      <p className={styles.note} id="franchise-filter-note">
        Лиги и даты применяются автоматически. Можно выбрать несколько лиг; минимум одну. {" "}
        Общий календарный отрезок для всех чемпионатов. Обе даты включены. Тур
        входит целиком по дате первого матча в Москве.
      </p>
      {(dateError || error) && (
        <div role="alert" className={styles.error} id="franchise-filter-error">
          {dateError || error}
        </div>
      )}
      {busy && <p role="status">Считаем выбранную дистанцию…</p>}
      {data && !busy && !error && !dateError && (
        <>
          <div className={styles.context}>
            <label>
              Франшиза
              <select
                aria-label="Франшиза"
                value={selected}
                onChange={(e) => select(e.target.value)}
              >
                <option value="">Все франшизы · сравнение</option>
                {data.franchises.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {dateLabel(data.filters.from)}–{dateLabel(data.filters.to)} ·{" "}
              {data.rounds} туров чемпионатов ·{" "}
              {data.squads.toLocaleString("ru-RU")} составов
            </span>
          </div>
          {!data.personalHistory && (
            <p className={styles.note}>
              Полная личная история менеджеров ещё обновляется.
            </p>
          )}
          {data.undatedRounds > 0 && (
            <p className={styles.note}>
              Туров без известной даты: {data.undatedRounds}. Они не включены в
              календарный отрезок.
            </p>
          )}
          {f?.virtual && (
            <p className={styles.note}>
              «{f.name}» — группа отдельных участников. Здесь учитываются все их
              личные туры. Основы, резерва и заморозок у группы нет.
            </p>
          )}
          <details className={styles.coverage}>
            <summary>Какие чемпионаты вошли в расчёт</summary>
            <ul>
              {Object.entries(data.leagues)
                .filter(
                  ([slug]) =>
                    !data.filters.leagues.length ||
                    data.filters.leagues.includes(slug),
                )
                .map(([slug, name]) => {
                  const rows = data.byLeague.filter(
                    (r) =>
                      r.slug === slug && (!f || r.franchise === f.franchise),
                  );
                  const count = rows.reduce((n, r) => n + r.count, 0);
                  return (
                    <li key={slug}>
                      <b>{name}</b>: {count.toLocaleString("ru-RU")} составов
                      {!count ? " · нет данных на выбранной дистанции" : ""}
                    </li>
                  );
                })}
            </ul>
          </details>
          <nav className={styles.tabs} aria-label="Разделы аналитики">
            {[
              ["choices", "Выборы и форма"],
              ["xfo", "Рейтинг xФО"],
              ["freezes", "Заморозки"],
              ["method", "Как это считается"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-current={tab === key ? "page" : undefined}
                className={tab === key ? styles.active : ""}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          {f && <h2 className={styles.franchiseTitle}>{f.name}</h2>}
          {!data.squads ? (
            <div className={styles.card}>
              В этом диапазоне составы не найдены. Измените даты или чемпионаты.
            </div>
          ) : (
            <>
              {tab === "choices" && (
                <>
                  <Stats
                    items={[
                      {
                        label: "Составов",
                        value: fmt(f?.count ?? data.squads, 0),
                        detail: "Менеджер × чемпионат × тур",
                      },
                      {
                        label: "Покупок",
                        value: fmt(f?.buys ?? data.buys, 0),
                        detail: "Стартовый набор не учитывается",
                      },
                      {
                        label: "Франшиз",
                        value: fmt(data.franchises.length, 0),
                        detail: "Одинаковый вес выбранных лиг",
                      },
                      {
                        label: "Заморозок",
                        value: fmt(events.length, 0),
                        detail: "Эффективность — только по завершённым",
                      },
                    ]}
                  />
                  <Section
                    title={
                      f ? "Профиль выбора" : "Кто чаще выбирает редких игроков"
                    }
                    description="Место по редкости состава, капитана и покупок. Это рейтинг стиля, а не силы менеджеров."
                  >
                    <Table
                      rows={asRows(shown)}
                      columns={choiceColumns}
                      onSelect={select}
                    />
                  </Section>
                  {!f && (
                    <Section
                      title="Каждая точка — франшиза"
                      description="Сравните стиль выбора всех франшиз. Найдите свою в списке и выделите её на графике."
                    >
                      <div className={styles.charts}>
                        {ownershipGroups.map((group) => (
                          <div className={styles.card} key={group.title}>
                            <h3>{group.title}</h3>
                            <p className={styles.note}>
                              Группа по владению основы (горизонтальная ось).
                              Шкалы подстроены под её значения.
                            </p>
                            <Scatter
                              rows={group.rows}
                              x="own"
                              y="cap"
                              xlabel="Владение основы, %"
                              ylabel="Популярность капитана, %"
                              onSelect={select}
                            />
                          </div>
                        ))}
                        {data.franchises.some(
                          (r) => metric(r, "own") === null,
                        ) && (
                          <div className={styles.note}>
                            Нет оценки владения основы:{" "}
                            {data.franchises
                              .filter((r) => metric(r, "own") === null)
                              .map((r) => (
                                <button
                                  key={r.id}
                                  className={styles.textButton}
                                  onClick={() => select(r.id)}
                                >
                                  {r.name};{" "}
                                </button>
                              ))}
                          </div>
                        )}
                        {purchaseGroups.map((group) => (
                          <div className={styles.card} key={group.title}>
                            <h3>{group.title}</h3>
                            <p className={styles.note}>
                              Группа по H2h-Δ покупки (горизонтальная ось).
                              Шкалы подстроены под её значения.
                            </p>
                            <Scatter
                              rows={group.rows}
                              x="buy_delta"
                              y="buy_form_gap"
                              xlabel="H2h-Δ покупки, п.п."
                              ylabel="Δ формы к покупкам поля, очки"
                              onSelect={select}
                            />
                          </div>
                        ))}
                        {data.franchises.some(
                          (r) => metric(r, "buy_delta") === null,
                        ) && (
                          <div className={styles.note}>
                            Нет оценки H2h-Δ покупки:{" "}
                            {data.franchises
                              .filter((r) => metric(r, "buy_delta") === null)
                              .map((r) => (
                                <button
                                  key={r.id}
                                  className={styles.textButton}
                                  onClick={() => select(r.id)}
                                >
                                  {r.name};{" "}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </Section>
                  )}
                  <div className={styles.explanation}>
                    <p>
                      <b>Δ формы +0,50:</b> купленные игроки до тура набирали на
                      пол-очка за матч больше, чем ориентир покупок поля. Это
                      разница средних за последние 5 сыгранных матчей.
                    </p>
                    <p>
                      <b>На росте формы 30%:</b> примерно 3 покупки из 10
                      сделаны после роста средних очков минимум на 2: последние
                      3 матча против предыдущих 3–7. Будущий результат сюда не
                      входит.
                    </p>
                  </div>
                  {f && (
                    <Section
                      title="Владение относительно общего поля H2H"
                      description="Положительная разница означает более популярных игроков. Ориентир поля учитывает все 15 мест ростера и позиции; это приближение к сравнению основ."
                    >
                      <Table
                        rows={asRows(
                          data.byLeague.filter(
                            (r) => r.franchise === f.franchise,
                          ),
                        )}
                        columns={choiceColumns.filter(
                          (c) => !["rank", "rarity"].includes(c.key),
                        )}
                      />
                    </Section>
                  )}
                  <Section
                    title="Капитаны и покупки относительно поля"
                    description="Плюс означает более массовый выбор или более высокую форму, чем у общего поля H2H. Покупки слабее рынка — форма до тура ниже ориентира минимум на 1 очко; это не доказательство предвидения."
                  >
                    <Table
                      rows={asRows(shown)}
                      columns={[
                        { key: "name", label: "Франшиза" },
                        {
                          key: "diff_share",
                          label: "Игроки с владением <10%",
                          suffix: "%",
                        },
                        {
                          key: "rare_cap",
                          label: "Редкие капитаны",
                          suffix: "%",
                        },
                        {
                          key: "cap_gap",
                          label: "Капитан к полю, п.п.",
                          digits: 2,
                        },
                        {
                          key: "buy_delta_gap",
                          label: "H2h-Δ к рынку, п.п.",
                          digits: 2,
                        },
                        {
                          key: "buy_form",
                          label: "Форма до покупки",
                          digits: 2,
                        },
                        {
                          key: "buy_cold",
                          label: "Покупки слабее рынка",
                          suffix: "%",
                        },
                      ]}
                    />
                  </Section>
                  <Section
                    title="Менеджеры: склонность к редким выборам"
                    description="Все личные туры на выбранных датах, включая резерв и заморозку. Учитываются и личные лиги вне заявки франшизы. Доступные чемпионаты имеют равный вес."
                  >
                    <Table
                      rows={asRows(
                        data.managers.filter(
                          (r) => !f || r.franchise === f.franchise,
                        ),
                      ).map((r) => ({
                        ...r,
                        name:
                          String(r.name) +
                          " · " +
                          names.get(
                            data.managers.find((m) => m.id === r.id)!.franchise,
                          ),
                      }))}
                      columns={[
                        ...choiceColumns,
                        ...(!f?.virtual
                          ? [
                              {
                                key: "reserveRounds",
                                label: "Вне основы",
                                digits: 0,
                              },
                              {
                                key: "personalRounds",
                                label: "Личные вне заявки",
                                digits: 0,
                              },
                            ]
                          : []),
                        {
                          key: "missingLineups",
                          label: "Без состава",
                          digits: 0,
                        },
                      ]}
                    />
                  </Section>
                  <Section
                    title="Согласие с ALT, ФО и FFO"
                    description="Оценка выбранных футболистов внутри своей позиции: 90 означает выше примерно 90% доступного пула. Только снимки до начала тура."
                  >
                    <Table
                      rows={asRows(shown)}
                      columns={[
                        { key: "name", label: "Франшиза" },
                        ...["fo", "alt", "ffo"].flatMap((k) => [
                          {
                            key: k + "_xi_pct",
                            label: k.toUpperCase() + " · основа",
                          },
                          {
                            key: k + "_buy_pct",
                            label: k.toUpperCase() + " · покупки",
                          },
                        ]),
                        {
                          key: "triple_cap_disagree",
                          label: "Капитаны против всех трёх, %",
                        },
                      ]}
                    />
                  </Section>
                  <Section
                    title="Текущие ALT, ФО и FFO выбранных игроков"
                    description="Средние текущие прогнозы для последнего выбранного XI каждого менеджера в заданном диапазоне. Они показывают сегодняшнюю оценку этих игроков и не объясняют прошлые решения."
                  >
                    <Table
                      rows={asRows(shown)}
                      columns={[
                        { key: "name", label: "Франшиза" },
                        { key: "current_alt", label: "ALT сегодня" },
                        { key: "current_fo", label: "ФО сегодня" },
                        { key: "current_ffo", label: "FFO сегодня" },
                      ]}
                    />
                  </Section>
                  {f && (
                    <Section
                      title="Что сопровождает покупки вопреки трём прогнозам"
                      description="Сравнение с другими покупками той же позиции, лиги и тура. Повтор одного футболиста в туре считается один раз. Это гипотезы, а не установленные мотивы."
                    >
                      <Table
                        rows={(
                          data.models.find((m) => m.id === f.franchise)
                            ?.hypotheses ?? []
                        ).map((h) => ({
                          name: h.label,
                          n: h.n,
                          share: h.share,
                          control: h.control,
                          gap:
                            h.share !== null && h.control !== null
                              ? h.share - h.control
                              : null,
                        }))}
                        columns={[
                          { key: "name", label: "Признак до покупки" },
                          { key: "n", label: "Наблюдений", digits: 0 },
                          { key: "share", label: "Среди расхождений, %" },
                          { key: "control", label: "Среди обычных покупок, %" },
                          { key: "gap", label: "Разница, п.п." },
                        ]}
                      />
                    </Section>
                  )}
                </>
              )}
              {tab === "xfo" && data.xfoCaptainMultiplier !== 1 && (
                <p role="status" className={styles.explanation}>
                  Пересчитываем xФО и реальные ФО без капитанского удвоения.
                  Остальные разделы доступны.
                </p>
              )}
              {tab === "xfo" && data.xfoCaptainMultiplier === 1 && (
                <>
                  <div className={styles.explanation}>
                    <p>
                      <b>
                        xФО — оценка сыгранного матча по созданным моментам.
                      </b>{" "}
                      xG и xA заменяют голы и передачи; остальные компоненты —
                      по формуле Excel. Это не прогноз ФО перед туром.
                    </p>
                    <p>
                      Основной рейтинг использует только завершённые туры с
                      оценкой всех 11 игроков и известным фактическим
                      результатом выбранного XI. И xФО, и реальные ФО считаются
                      без капитанского удвоения: каждый из 11 игроков
                      учитывается один раз. Пустые компоненты при наличии
                      подробной статистики матча считаются нулями по правилу
                      Excel, их количество показано отдельно. При низком
                      покрытии сравнение относится лишь к доступной части
                      дистанции.
                    </p>
                    <p>
                      ФО − xФО: плюс означает, что игроки набрали больше
                      реальных очков, чем оценка по моментам; минус — меньше.
                      Это не сравнение с прогнозом ФО перед туром.
                    </p>
                  </div>
                  <Section
                    title="Рейтинг франшиз по xФО XI"
                    description="Выше — больше ожидаемых очков по моментам за один полностью покрытый состав. Факт и разница рассчитаны по тем же выбранным XI, до автозамен."
                  >
                    <Table
                      initialSort="xfo"
                      rows={shown.map((r) => ({
                        id: r.id,
                        name: r.name,
                        xfo: metric(r, "xfo"),
                        actual: metric(r, "xfo_actual"),
                        gap: metric(r, "xfo_gap"),
                        full: r.xfoComplete,
                        eligible: r.xfoEligible,
                        coverage: r.xfoCoverage,
                        filled: r.xfoFilled,
                      }))}
                      columns={[
                        { key: "name", label: "Франшиза" },
                        { key: "xfo", label: "xФО состава", digits: 2 },
                        { key: "actual", label: "Реальные ФО", digits: 2 },
                        { key: "gap", label: "ФО − xФО", digits: 2 },
                        { key: "full", label: "Полных оценок", digits: 0 },
                        {
                          key: "eligible",
                          label: "Завершённых составов",
                          digits: 0,
                        },
                        {
                          key: "coverage",
                          label: "Покрытие футболистов",
                          suffix: "%",
                        },
                        {
                          key: "filled",
                          label: "С нулями по Excel",
                          digits: 0,
                        },
                      ]}
                      onSelect={select}
                    />
                  </Section>
                  <Section
                    title="Менеджеры по xФО"
                    description="Все личные туры менеджера, включая резерв и заморозку. Неполный XI футболистов не получает место по сумме доступных оценок."
                  >
                    <Table
                      initialSort="xfo"
                      rows={data.managers
                        .filter((r) => !f || r.franchise === f.franchise)
                        .map((r) => ({
                          name: r.name + " · " + names.get(r.franchise),
                          xfo: metric(r, "xfo"),
                          actual: metric(r, "xfo_actual"),
                          gap: metric(r, "xfo_gap"),
                          full: r.xfoComplete,
                          eligible: r.xfoEligible,
                          coverage: r.xfoCoverage,
                          filled: r.xfoFilled,
                          count: r.count,
                          reserve: r.virtual ? null : r.reserveRounds,
                          personal: r.virtual ? null : r.personalRounds,
                          missing: r.missingLineups,
                        }))}
                      columns={[
                        { key: "name", label: "Менеджер" },
                        {
                          key: "count",
                          label: "Всего личных туров",
                          digits: 0,
                        },
                        ...(!f?.virtual
                          ? [
                              {
                                key: "reserve",
                                label: "Вне основы",
                                digits: 0,
                              },
                              {
                                key: "personal",
                                label: "Личные вне заявки",
                                digits: 0,
                              },
                            ]
                          : []),
                        { key: "missing", label: "Без состава", digits: 0 },
                        { key: "xfo", label: "xФО состава", digits: 2 },
                        { key: "actual", label: "Реальные ФО", digits: 2 },
                        { key: "gap", label: "ФО − xФО", digits: 2 },
                        { key: "full", label: "Полных оценок", digits: 0 },
                        { key: "eligible", label: "Завершённых", digits: 0 },
                        { key: "coverage", label: "Покрытие, %" },
                      ]}
                    />
                  </Section>
                  {f && (
                    <Section
                      title="xФО по чемпионатам"
                      description="Туры входят по дате начала в общем календарном отрезке. Прочерк означает, что для xФО нет полного XI с известной статистикой и фактическими очками; составы этой лиги остаются в остальных разделах."
                    >
                      <Table
                        rows={data.byLeague
                          .filter((r) => r.franchise === f.franchise)
                          .map((r) => ({
                            name: r.name,
                            xfo: metric(r, "xfo"),
                            actual: metric(r, "xfo_actual"),
                            gap: metric(r, "xfo_gap"),
                            full: r.xfoComplete,
                            eligible: r.xfoEligible,
                            coverage: r.xfoCoverage,
                            status: r.xfoComplete
                              ? `Учтено ${r.xfoComplete} из ${r.xfoEligible} завершённых XI`
                              : r.xfoEligible
                                ? "Недостаточно данных для полного XI"
                                : "Нет завершённых составов",
                          }))}
                        columns={[
                          { key: "name", label: "Чемпионат" },
                          { key: "xfo", label: "xФО основы", digits: 2 },
                          { key: "actual", label: "Реальные ФО", digits: 2 },
                          { key: "gap", label: "ФО − xФО", digits: 2 },
                          { key: "full", label: "Полных XI", digits: 0 },
                          {
                            key: "eligible",
                            label: "Завершённых XI",
                            digits: 0,
                          },
                          { key: "coverage", label: "Покрытие футболистов, %" },
                          { key: "status", label: "Что учтено в xФО" },
                        ]}
                      />
                    </Section>
                  )}
                  <Section
                    title="Примеры оценок футболистов"
                    description="Индивидуальные очки без капитанского множителя. Список показывает доступные примеры, а не полный рейтинг футболистов."
                  >
                    <Table
                      rows={data.xfoExamples
                        .filter((r) => !f || r.franchise === f.franchise)
                        .map((r) => ({
                          name: String(r.name),
                          manager: String(r.manager),
                          league: data.leagues[r.slug],
                          round: r.round,
                          xfo: number(r.xfo),
                          actual: number(r.actual),
                          filled: r.filled
                            ? "Есть подстановка нуля"
                            : "Без подстановок",
                        }))}
                      columns={[
                        { key: "name", label: "Футболист" },
                        { key: "manager", label: "Менеджер" },
                        { key: "league", label: "Чемпионат" },
                        { key: "round", label: "Тур", digits: 0 },
                        { key: "xfo", label: "xФО", digits: 2 },
                        { key: "actual", label: "Факт", digits: 2 },
                        { key: "filled", label: "Компоненты Excel" },
                      ]}
                    />
                  </Section>
                </>
              )}
              {tab === "freezes" && f?.virtual && (
                <Section title="Заморозки">
                  <p>У группы «{f.name}» нет основы, резерва и заморозок.</p>
                </Section>
              )}
              {tab === "freezes" && !f?.virtual && (
                <>
                  <Section
                    title="Частота и успех заморозок"
                    description="Успех: выпущенные фэнтезисты суммарно набрали больше замороженных. Незавершённые туры исключены из эффективности."
                  >
                    <Table
                      rows={freezeRows.map((r) => ({
                        id: String(r.id),
                        name: r.name,
                        frequency: r.frequency,
                        episodes: r.episodes,
                        rounds: r.rounds,
                        completed: r.completed,
                        success: r.completed
                          ? (r.success / r.completed) * 100
                          : null,
                        gain: r.gain,
                      }))}
                      columns={[
                        { key: "name", label: "Франшиза" },
                        {
                          key: "frequency",
                          label: "Туры с заморозкой",
                          suffix: "%",
                        },
                        { key: "episodes", label: "Эпизодов", digits: 0 },
                        { key: "rounds", label: "Туров франшизы", digits: 0 },
                        {
                          key: "completed",
                          label: "Завершено и проверено",
                          digits: 0,
                        },
                        { key: "success", label: "Успешно", suffix: "%" },
                        { key: "gain", label: "Эффект, очки", digits: 0 },
                      ]}
                      onSelect={select}
                    />
                  </Section>
                  <Section title="Кого заморозили и кого выпустили">
                    <div className={styles.events}>
                      {events.map((e, i) => (
                        <div className={styles.card} key={i}>
                          <div className={styles.eventTitle}>
                            <b>
                              {names.get(e.franchise)} · {data.leagues[e.slug]}{" "}
                              · тур {e.round}
                            </b>
                            <span>
                              {e.finished && e.valid && e.board_verified
                                ? fmt(e.gain, 0) + " очков"
                                : "Предварительно / нет полной проверки"}
                            </span>
                          </div>
                          <p>
                            Заморожены:{" "}
                            {e.frozen
                              .map((p) => `${p.manager} (${fmt(p.score, 0)})`)
                              .join(", ")}
                          </p>
                          <p>
                            Выпущены:{" "}
                            {e.substitutes
                              .map((p) => `${p.manager} (${fmt(p.score, 0)})`)
                              .join(", ")}
                          </p>
                          <a
                            href={
                              e.source.startsWith("https://fantasy-h2h.ru/")
                                ? e.source
                                : "https://fantasy-h2h.ru" + e.source
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            Доска матча ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  </Section>
                </>
              )}
            </>
          )}
          {tab === "method" && (
            <Section title="Определения и границы сравнения">
              <div className={styles.method}>
                <h3>Только информация, доступная до тура</h3>
                <p>
                  История футболиста обрывается перед первым матчем тура. Для
                  формы используются завершённые матчи с запасом 3 часа от их
                  начала. Текущие пересчёты прогнозов не подставляются в
                  прошлое. xФО относится к результатам сыгранного тура и не
                  участвует в форме до покупки.
                </p>
                <h3>Общее поле H2H</h3>
                <p>
                  Владение основы — среднее владение 11 футболистами. Ориентир
                  поля взвешен владением и позициями, но исходное владение
                  относится ко всему ростеру из 15 мест. Ориентир капитана
                  взвешен частотой его назначения. Покупки поля приближены
                  положительным приростом владения: полный журнал всех
                  трансферов недоступен.
                </p>
                <h3>Дистанция и рейтинги</h3>
                <p>
                  Один календарный отрезок применяется ко всем чемпионатам по
                  дате первого матча тура в Москве. Обе границы включены.
                  Сначала считаются показатели состава в туре, затем средние
                  внутри лиги, затем выбранные лиги получают одинаковый вес.
                  Редкость выбора: 40% ранг низкого владения, 30% редкого
                  капитана и 30% низкой H2h-Δ покупки. Рейтинг не измеряет
                  результаты менеджера.
                </p>
                <p>
                  Личные сравнения включают все доступные туры менеджера: в
                  основе, резерве, при заморозке и в личных лигах вне заявки
                  франшизы. «шизы» объединяет отдельных участников без турнирной
                  основы и заморозок.
                </p>
                <h3>Формула xФО из Excel</h3>
                <p>
                  xФО = xG × цена гола + 3 × xA + очки времени + карточки +
                  возвраты / сейвы + ожидаемые очки обороны. Гол стоит 6 для
                  вратаря и защитника, 5 для полузащитника, 4 для нападающего.
                  Выход: +1; от 60 минут: ещё +1; полный матч
                  полузащитника/нападающего: ещё +1. Каждые три возврата или
                  сейва: +1. Жёлтая: −1, красная: −3.
                </p>
                <p>
                  При игре меньше 60 минут оборонный компонент равен нулю. Иначе
                  для вратаря/защитника: 4P(0) − P(2) − P(3) − 2P(4); для
                  полузащитника: P(0). P(k) — вероятность k пропущенных по
                  Пуассону с параметром xG соперника. Как в исходной формуле
                  Excel, хвост 5+ не включён. Для двойного тура складываются
                  отдельные матчи.
                </p>
                <p>
                  В исходном Excel сохранённый оборонный компонент расходился с
                  формулой в 72 из 107 строк. Использована формула. Пустые
                  xG/xA, возвраты и сейвы заполняются нулями по правилу IFERROR
                  из Excel только при наличии минут игрока и xG соперника за
                  матч. Количество таких оценок указано отдельно. Матчи без
                  подробной статистики не получают выдуманной оценки. Нет
                  полного покрытия XI — нет суммарной оценки и места по xФО.
                  Карточки без зарегистрированного события считаются нулевыми,
                  как в текущем нормализованном подсчёте проекта.
                </p>
                <h3>Заморозки</h3>
                <p>
                  Учитывается явная отметка exchange. Выпущенные определяются по
                  последним местам игровой шестёрки и проверяются по доске.
                  Эффект — очки выпущенных минус очки замороженных; он не равен
                  числу дополнительных командных побед.
                </p>
                <p>
                  Источник формулы: резы2.xlsx, Лист1, столбцы G, N, P.
                  Источники составов: fantasy-h2h.ru; история, прогнозы и
                  компоненты xФО: база Fantasy. Расчёты выполняются алгоритмами
                  без обращения к ИИ.
                </p>
              </div>
            </Section>
          )}
        </>
      )}
    </main>
  );
}
