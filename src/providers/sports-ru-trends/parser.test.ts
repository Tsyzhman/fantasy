import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { discoverSportsTrendArticleLinks, parseSportsTrendArticle } from "./parser";
import { SportsTrendsFetchError, fetchSportsTrendsHtml } from "./fetch";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#acceptance
 */
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

function articleWithParagraphs(paragraphs: string[]) {
  return `<!doctype html><html><body><div class="news-content">${paragraphs.map((text) => `<p>${text}</p>`).join("")}</div></body></html>`;
}

test("real Sports article parses 10 buys and 10 sells with signed popularity change", () => {
  const article = parseSportsTrendArticle(fixture("article-buys-sells.html"), {
    url: "https://www.sports.ru/football/1117257620-populyarnost-kiliana-mbappe-pered-2-m-turom-fentezi-chm-vyrosla-na-9-6.html"
  });
  const buys = article.sections.find((section) => section.category === "BUYS");
  const sells = article.sections.find((section) => section.category === "SELLS");
  assert.ok(buys, "buys section");
  assert.ok(sells, "sells section");
  assert.equal(buys.entries.length, 10);
  assert.equal(sells.entries.length, 10);
  assert.equal(buys.metricKind, "reported_popularity_change");
  assert.equal(buys.unit, "percent");
  assert.equal(buys.entries[0]?.name, "Килиан Мбаппе");
  assert.equal(buys.entries[0]?.position, "FWD");
  assert.equal(buys.entries[0]?.team, "Франция");
  assert.equal(buys.entries[0]?.value, 9.6);
  assert.equal(buys.entries[0]?.valueText, "+9,6%");
  assert.equal(sells.entries[0]?.name, "Бруну Фернандеш");
  assert.equal(sells.entries[0]?.value, -4.7);
  assert.equal(article.roundLabel, "2");
  assert.equal(article.tournamentHint, "ЧМ");
  assert.equal(article.publishedAt, "2026-06-18T17:25:00+03:00");
  assert.match(article.canonicalUrl, /sports\.ru\/football\/1117257620/);
});

test("short JSON-LD articleBody does not replace real HTML lists", () => {
  const article = parseSportsTrendArticle(fixture("article-buys-sells.html"), { url: "https://www.sports.ru/football/1117257620-x.html" });
  const total = article.sections.reduce((sum, section) => sum + section.entries.length, 0);
  assert.equal(total, 20);
});

test("position ownership article keeps separate position sections and comma decimals", () => {
  const article = parseSportsTrendArticle(fixture("article-popularity-le.html"), {
    url: "https://www.sports.ru/football/1117372286-patrik-shik-samyj-populyarnyj-v-fentezi-le-pered-1-m-turom.html"
  });
  const ownership = article.sections.filter((section) => section.category === "OWNERSHIP");
  const positions = ownership.map((section) => section.position);
  assert.deepEqual(positions, ["GK", "DEF", "MID", "FWD"]);
  const goalkeepers = ownership[0]!;
  assert.equal(goalkeepers.entries[0]?.value, 15.29);
  assert.equal(goalkeepers.entries[0]?.team, "Ювентус");
  assert.equal(goalkeepers.availableCount, 7);
  const forwards = ownership[3]!;
  assert.equal(forwards.entries[0]?.name, "Патрик Шик");
  assert.equal(forwards.entries[0]?.value, 45.73);
  assert.equal(article.roundLabel, "1");
  assert.equal(article.tournamentHint, "Лига Европы");
});

test("top-1000 article is marked with the manager population scope and parses 15 entries", () => {
  const article = parseSportsTrendArticle(fixture("article-top1000.html"), {
    url: "https://www.sports.ru/football/1117357818-kejn-samyj-populyarnyj-igrok-v-fentezi-lch-sredi-pervoj-1000-komand-ra.html"
  });
  const ownership = article.sections.find((section) => section.category === "OWNERSHIP");
  assert.ok(ownership);
  assert.equal(ownership.populationScope, "TOP_1000_MANAGERS");
  assert.equal(ownership.entries.length, 15);
  assert.equal(ownership.entries[0]?.name, "Харри Кейн");
  assert.equal(ownership.entries[0]?.position, "FWD");
  assert.equal(ownership.entries[14]?.name, "Джуд Беллингем");
});

test("lists longer than 15 keep the first 15 in source order and report the available count", () => {
  const rows = Array.from({ length: 17 }, (_, index) => `<p>${index + 1}. Игрок ${index + 1}, «Клуб» (5) – ${(index + 1) * 1.5}%</p>`);
  const article = parseSportsTrendArticle(articleWithParagraphs(["Топ-15 самых популярных игроков:", ...rows]), { url: "https://www.sports.ru/football/1-test.html" });
  const section = article.sections[0]!;
  assert.equal(section.entries.length, 15);
  assert.equal(section.availableCount, 17);
  assert.equal(section.entries[14]?.name, "Игрок 15");
});

test("zero published lists produce no sections", () => {
  const article = parseSportsTrendArticle(articleWithParagraphs(["Фэнтези стартует завтра.", "Составьте команду заранее."]), {
    url: "https://www.sports.ru/football/2-test.html"
  });
  assert.deepEqual(article.sections, []);
});

test("a repeated player inside one category is rejected once and counted as duplicate", () => {
  const article = parseSportsTrendArticle(
    articleWithParagraphs([
      "Так выглядит топ покупок перед дедлайном:",
      "1) Игрок А, нп, Клуб +5% (Соперник)",
      "2) Игрок А, нп, Клуб +5% (Соперник)",
      "3) Игрок Б, зщ, Клуб +2% (Соперник)"
    ]),
    { url: "https://www.sports.ru/football/3-test.html" }
  );
  const section = article.sections[0]!;
  assert.equal(section.entries.length, 2);
  assert.equal(section.duplicates, 1);
});

test("feed discovery keeps only fantasy-tagged Sports articles", () => {
  const links = discoverSportsTrendArticleLinks(fixture("feed-news.html"), "https://www.sports.ru/fantasy-sports/news/");
  assert.ok(links.length >= 10, `expected at least 10 fantasy links, got ${links.length}`);
  assert.ok(links.every((link) => link.url.startsWith("https://www.sports.ru/")));
  assert.ok(links.some((link) => link.url.includes("1117372286-patrik-shik")));
  assert.ok(links.some((link) => link.url.includes("1117357818-kejn")));
  assert.ok(!links.some((link) => link.url.includes("/figure-skating/")));
});

test("unknown Sports list formats are ignored without inventing entries", () => {
  const article = parseSportsTrendArticle(
    articleWithParagraphs(["Так выглядит топ-10 покупок перед дедлайном:", "Мбаппе, нападающий", "1) Неполная строка без процента"]),
    { url: "https://www.sports.ru/football/4-test.html" }
  );
  assert.equal(article.sections[0]?.entries.length ?? 0, 0);
});

test("fetch rejects hosts outside Sports before any HTTP call", async () => {
  let calls = 0;
  await assert.rejects(
    fetchSportsTrendsHtml("https://example.com/article.html", {
      fetchImpl: (async () => {
        calls += 1;
        return new Response("nope");
      }) as typeof fetch
    }),
    (error: unknown) => error instanceof SportsTrendsFetchError && error.code === "INVALID_URL"
  );
  assert.equal(calls, 0);
});

test("fetch waits for Retry-After on 429 and then succeeds", async () => {
  const sleeps: number[] = [];
  let attempts = 0;
  const result = await fetchSportsTrendsHtml("https://www.sports.ru/football/1-test.html", {
    fetchImpl: (async () => {
      attempts += 1;
      if (attempts === 1) return new Response("slow down", { status: 429, headers: { "retry-after": "2" } });
      return new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch,
    sleep: async (milliseconds: number) => {
      sleeps.push(milliseconds);
    }
  });
  assert.equal(result.status, 200);
  assert.deepEqual(sleeps, [2000]);
  assert.equal(result.contentHash.length, 64);
});

test("fetch does not retry a protection page and reports FORBIDDEN", async () => {
  let attempts = 0;
  await assert.rejects(
    fetchSportsTrendsHtml("https://www.sports.ru/football/2-test.html", {
      fetchImpl: (async () => {
        attempts += 1;
        return new Response("captcha", { status: 403 });
      }) as typeof fetch,
      sleep: async () => undefined
    }),
    (error: unknown) => error instanceof SportsTrendsFetchError && error.code === "FORBIDDEN"
  );
  assert.equal(attempts, 1);
});

test("fetch rejects bodies above the bounded limit", async () => {
  await assert.rejects(
    fetchSportsTrendsHtml("https://www.sports.ru/football/3-test.html", {
      fetchImpl: (async () => new Response("x".repeat(4096), { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch,
      maxBytes: 1024
    }),
    (error: unknown) => error instanceof SportsTrendsFetchError && error.code === "TOO_LARGE"
  );
});
