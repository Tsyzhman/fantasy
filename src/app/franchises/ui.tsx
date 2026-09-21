"use client";
/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#ui */
import { useEffect, useState, type ReactNode } from "react";
import type { Analytics, Summary } from "@/franchises/analytics";
import { number } from "@/franchises/analytics";
import styles from "./ui.module.css";

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
const palette = [
  "#4777bb",
  "#9267b5",
  "#3c826b",
  "#b45165",
  "#ad7917",
  "#2f8592",
  "#9f578e",
  "#6075a3",
  "#658642",
  "#b96943",
  "#3a866a",
  "#7374c2",
];

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
  function download() {
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
        ...visible.map((r) => columns.map((c) => escape(r[c.key])).join(";")),
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
        <button className="ui-button" onClick={download}>
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
  onSelect: (s: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const valid = rows.filter(
    (r) => metric(r, x) !== null && metric(r, y) !== null,
  );
  if (!valid.length) return <p>Недостаточно данных для графика.</p>;
  const xs = valid.map((r) => metric(r, x)!),
    ys = valid.map((r) => metric(r, y)!);
  const dx = Math.max(0.1, Math.max(...xs) - Math.min(...xs)),
    dy = Math.max(0.1, Math.max(...ys) - Math.min(...ys));
  const loX = Math.min(...xs) - dx * 0.13,
    hiX = Math.max(...xs) + dx * 0.13,
    loY = Math.min(...ys) - dy * 0.15,
    hiY = Math.max(...ys) + dy * 0.15;
  const points = valid.map((r, i) => ({
    r,
    i,
    px: 62 + ((metric(r, x)! - loX) / (hiX - loX)) * 710,
    py: 330 - ((metric(r, y)! - loY) / (hiY - loY)) * 290,
  }));
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const labels = new Map<string, { x: number; y: number }>();
  const overlaps = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) =>
    a.x < b.x + b.w + 4 &&
    a.x + a.w + 4 > b.x &&
    a.y < b.y + b.h + 4 &&
    a.y + a.h + 4 > b.y;
  for (const p of [...points].sort(
    (a, b) =>
      Math.min(
        ...points
          .filter((q) => q !== a)
          .map((q) => Math.hypot(q.px - a.px, q.py - a.py)),
      ) -
      Math.min(
        ...points
          .filter((q) => q !== b)
          .map((q) => Math.hypot(q.px - b.px, q.py - b.py)),
      ),
  )) {
    const w = p.r.name.length * 6.8;
    let chosen: { x: number; y: number; w: number; h: number } | undefined;
    for (const gap of [10, 18, 28, 40]) {
      for (const [ox, oy] of [
        [gap, -7],
        [-w - gap, -7],
        [gap, -24],
        [-w - gap, -24],
        [gap, 11],
        [-w - gap, 11],
        [-w / 2, -28],
        [-w / 2, 15],
      ]) {
        const b = { x: p.px + ox, y: p.py + oy, w, h: 16 };
        if (
          b.x < 63 ||
          b.x + w > 788 ||
          b.y < 31 ||
          b.y + 16 > 337 ||
          boxes.some((a) => overlaps(a, b)) ||
          points.some(
            (q) =>
              Math.hypot(
                Math.max(b.x - q.px, 0, q.px - b.x - w),
                Math.max(b.y - q.py, 0, q.py - b.y - 16),
              ) < 8,
          )
        )
          continue;
        chosen = b;
        break;
      }
      if (chosen) break;
    }
    chosen ??= { x: p.px + 10, y: p.py - 20, w, h: 16 };
    boxes.push(chosen);
    labels.set(p.r.id, { x: chosen.x, y: chosen.y + 12 });
  }
  return (
    <>
      <div className={styles.scatter}>
        <svg
          viewBox="0 0 800 390"
          role="img"
          aria-label={`${xlabel}; ${ylabel}`}
        >
          <text x="62" y="19">
            {ylabel}
          </text>
          {Array.from({ length: 5 }, (_, i) => (
            <g key={i}>
              <line x1={62 + i * 177.5} y1="40" x2={62 + i * 177.5} y2="330" />
              <line x1="62" y1={330 - i * 72.5} x2="772" y2={330 - i * 72.5} />
              <text x={62 + i * 177.5} y="352" textAnchor="middle">
                {fmt(loX + ((hiX - loX) * i) / 4)}
              </text>
              <text x="52" y={334 - i * 72.5} textAnchor="end">
                {fmt(loY + ((hiY - loY) * i) / 4)}
              </text>
            </g>
          ))}
          <text x="410" y="382" textAnchor="middle">
            {xlabel}
          </text>
          {points.map((p) => (
            <a
              key={p.r.id}
              href={`#franchise-${p.r.id}`}
              onClick={(e) => {
                e.preventDefault();
                onSelect(p.r.id);
              }}
              onMouseEnter={() => setHover(p.r.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.r.id)}
              onBlur={() => setHover(null)}
              style={{ opacity: hover && hover !== p.r.id ? 0.28 : 1 }}
            >
              <title>
                {p.r.name}: {fmt(metric(p.r, x), 2)}; {fmt(metric(p.r, y), 2)}
              </title>
              <circle
                cx={p.px}
                cy={p.py}
                r={hover === p.r.id ? 7 : 5}
                fill={palette[p.i % palette.length]}
              />
              <text
                className={styles.plotLabel}
                x={labels.get(p.r.id)!.x}
                y={labels.get(p.r.id)!.y}
              >
                {p.r.name}
              </text>
            </a>
          ))}
        </svg>
      </div>
      <div className={styles.mobilePlot}>
        <Table
          rows={valid.map((r) => ({
            id: r.id,
            name: r.name,
            x: metric(r, x),
            y: metric(r, y),
          }))}
          columns={[
            { key: "name", label: "Франшиза" },
            { key: "x", label: xlabel },
            { key: "y", label: ylabel },
          ]}
          onSelect={onSelect}
        />
      </div>
    </>
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
    ...r.metrics,
  }));

export function FranchiseAnalytics({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const initial = new URLSearchParams(initialQuery);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState(initialQuery);
  const [requestId, setRequestId] = useState(0);
  const [from, setFrom] = useState(initial.get("from") ?? "1");
  const [to, setTo] = useState(initial.get("to") ?? "50");
  const [leagues, setLeagues] = useState<string[]>(
    initial
      .getAll("league")
      .flatMap((s) => s.split(","))
      .filter(Boolean),
  );
  const [completed, setCompleted] = useState(initial.get("completed") === "1");
  const [selected, setSelected] = useState(initial.get("franchise") ?? "");
  const [tab, setTab] = useState("choices");
  useEffect(() => {
    const controller = new AbortController();
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
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [query, requestId]);
  function apply() {
    const q = new URLSearchParams({
      from,
      to,
      completed: completed ? "1" : "0",
    });
    leagues.forEach((l) => q.append("league", l));
    if (selected) q.set("franchise", selected);
    history.replaceState(null, "", "/franchises?" + q);
    setBusy(true);
    setError("");
    setQuery(q.toString());
    setRequestId((v) => v + 1);
  }
  function select(value: string) {
    setSelected(value);
    const q = new URLSearchParams(window.location.search);
    if (value) q.set("franchise", value);
    else q.delete("franchise");
    history.replaceState(null, "", "/franchises?" + q);
  }
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
          С тура
          <input
            type="number"
            min="1"
            max="60"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          По тур
          <input
            type="number"
            min="1"
            max="60"
            required
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
        <button className="ui-button" type="submit" disabled={busy}>
          Показать дистанцию
        </button>
        {data && (
          <details className={styles.leagues}>
            <summary>Чемпионаты: {leagues.length || "все"}</summary>
            <div>
              {Object.entries(data.leagues).map(([slug, name]) => (
                <label key={slug}>
                  <input
                    type="checkbox"
                    checked={!leagues.length || leagues.includes(slug)}
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
              <button
                type="button"
                className="ui-button"
                onClick={() => setLeagues([])}
              >
                Все чемпионаты
              </button>
            </div>
          </details>
        )}
      </form>
      <p className={styles.note}>
        Номера туров считаются отдельно в каждом чемпионате по нумерации H2H.
        Например, 1–2 — первый и второй тур каждой выбранной лиги, независимо от
        дат матчей.
      </p>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      {busy && <p role="status">Считаем выбранную дистанцию…</p>}
      {data && !busy && !error && (
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
              Туры {data.filters.from}–{data.filters.to} · {data.rounds} туров
              чемпионатов · {data.squads.toLocaleString("ru-RU")} составов
            </span>
          </div>
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
              В этом диапазоне составы не найдены. Измените номера туров или
              чемпионаты.
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
                      description="Названия стоят рядом с точками. Наведите курсор, чтобы выделить команду; нажмите для подробностей."
                    >
                      <div className={styles.charts}>
                        <div className={styles.card}>
                          <h3>Основной состав и капитан</h3>
                          <Scatter
                            rows={data.franchises}
                            x="own"
                            y="cap"
                            xlabel="Владение основы, %"
                            ylabel="Популярность капитана, %"
                            onSelect={select}
                          />
                        </div>
                        <div className={styles.card}>
                          <h3>Покупки и форма до тура</h3>
                          <Scatter
                            rows={data.franchises}
                            x="buy_delta"
                            y="buy_form_gap"
                            xlabel="H2h-Δ покупки, п.п."
                            ylabel="Δ формы к покупкам поля, очки"
                            onSelect={select}
                          />
                        </div>
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
                    description="Сравнение на той же дистанции, с равным весом доступных чемпионатов."
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
                      columns={choiceColumns}
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
                    title="Рейтинг по xФО основного состава"
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
                    description="Неполный состав не получает место по сумме доступных игроков."
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
                        }))}
                      columns={[
                        { key: "name", label: "Менеджер" },
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
                      description="Туры выбранного диапазона учитываются отдельно в каждой лиге. Прочерк означает, что для xФО нет полного XI с известной статистикой и фактическими очками; составы этой лиги остаются в остальных разделах."
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
              {tab === "freezes" && (
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
                  Выбранные номера туров применяются отдельно к каждому
                  чемпионату. Сначала считаются показатели состава в туре, затем
                  средние внутри лиги, затем выбранные лиги получают одинаковый
                  вес. Редкость выбора: 40% ранг низкого владения, 30% редкого
                  капитана и 30% низкой H2h-Δ покупки. Рейтинг не измеряет
                  результаты менеджера.
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
