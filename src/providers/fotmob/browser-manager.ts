import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

type AnyRecord = Record<string, unknown>;

type PlaywrightBrowserContext = {
  newPage: () => Promise<PlaywrightPage>;
  cookies: (urls?: string | string[]) => Promise<Array<{ name: string; value: string; domain: string }>>;
  addInitScript: (script: string | { content: string } | ((arg: unknown) => unknown), arg?: unknown) => Promise<void>;
  close: () => Promise<void>;
};

type PlaywrightResponse = {
  url: () => string;
  status: () => number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

type PlaywrightRequest = {
  url: () => string;
  method: () => string;
};

type PlaywrightPage = {
  goto: (url: string, options?: AnyRecord) => Promise<{ status: () => number } | null>;
  evaluate: <T, A = void>(fn: (arg: A) => T | Promise<T>, arg?: A) => Promise<T>;
  waitForTimeout: (ms: number) => Promise<void>;
  waitForResponse: (urlOrPredicate: string | RegExp | ((response: PlaywrightResponse) => boolean | Promise<boolean>), options?: { timeout?: number }) => Promise<PlaywrightResponse>;
  waitForLoadState: (state?: "load" | "domcontentloaded" | "networkidle", options?: { timeout?: number }) => Promise<void>;
  on: (event: "request" | "response", listener: (eventArg: PlaywrightRequest | PlaywrightResponse) => void) => void;
  isClosed: () => boolean;
  close: () => Promise<void>;
  context: () => PlaywrightBrowserContext;
  url: () => string;
  title: () => Promise<string>;
};

type ChromiumLaunchOptions = {
  headless?: boolean;
  viewport?: { width: number; height: number } | null;
  locale?: string;
  timezoneId?: string;
  userAgent?: string;
  args?: string[];
  ignoreDefaultArgs?: string[] | boolean;
  acceptDownloads?: boolean;
};

type PlaywrightModule = {
  chromium: {
    launchPersistentContext: (userDataDir: string, options?: ChromiumLaunchOptions) => Promise<PlaywrightBrowserContext>;
  };
};

const FOTMOB_SITE = process.env.MACHETE_FOTMOB_SITE_URL || "https://www.fotmob.com";
const READY_POLL_MS = 1_000;
const READY_TIMEOUT_MS = Number(process.env.MACHETE_FOTMOB_BROWSER_READY_TIMEOUT_MS || 60_000);
const REQUEST_TIMEOUT_MS = Number(process.env.MACHETE_FOTMOB_BROWSER_REQUEST_TIMEOUT_MS || 30_000);
const MATCH_DETAILS_TIMEOUT_MS = Number(process.env.MACHETE_FOTMOB_BROWSER_MATCH_DETAILS_TIMEOUT_MS || 20_000);
const CANONICAL_GRACE_MS = Number(process.env.MACHETE_FOTMOB_BROWSER_CANONICAL_GRACE_MS || 3_000);

// Dynamic import that the TypeScript compiler and webpack cannot statically
// follow. Playwright is an optional runtime dependency — prod images skip it
// with npm install --omit=optional, and a static import would fail the build
// with "module not found" even though the code is guarded by a try/catch.
const importByName = new Function("specifier", "return import(specifier)") as <T = unknown>(specifier: string) => Promise<T>;

async function loadPlaywright(): Promise<PlaywrightModule> {
  try {
    return await importByName<PlaywrightModule>("playwright");
  } catch {
    throw new Error(
      "Browser FotMob mode requires playwright. Run: npm install playwright && npx playwright install chromium"
    );
  }
}

class FotMobBrowserManager {
  private context: PlaywrightBrowserContext | null = null;
  private page: PlaywrightPage | null = null;
  private launching: Promise<void> | null = null;

  async ensurePage(): Promise<PlaywrightPage> {
    if (this.page && !this.page.isClosed()) return this.page;
    if (!this.launching) this.launching = this.launch().finally(() => { this.launching = null; });
    await this.launching;
    if (!this.page) throw new Error("FotMob browser session failed to start.");
    return this.page;
  }

  private async launch(): Promise<void> {
    const { chromium } = await loadPlaywright();
    const userDataDir = resolve(
      process.env.MACHETE_FOTMOB_BROWSER_PROFILE_DIR || ".cache/fotmob-browser-profile"
    );
    mkdirSync(userDataDir, { recursive: true });

    const headless = process.env.MACHETE_FOTMOB_BROWSER_HEADLESS !== "false";
    const userAgent =
      process.env.MACHETE_FOTMOB_BROWSER_UA ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

    this.context = await chromium.launchPersistentContext(userDataDir, {
      headless,
      viewport: { width: 1280, height: 800 },
      locale: "en-GB",
      timezoneId: process.env.MACHETE_FOTMOB_TIMEZONE || "Europe/London",
      userAgent,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
      ignoreDefaultArgs: ["--enable-automation"],
      acceptDownloads: false
    });

    await this.context.addInitScript(`
      try {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        Object.defineProperty(navigator, "languages", { get: () => ["en-GB", "en"] });
        Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
        window.chrome = window.chrome || { runtime: {} };
      } catch (_) {}
    `);

    this.page = await this.context.newPage();
    await this.page.goto(FOTMOB_SITE, { waitUntil: "domcontentloaded", timeout: REQUEST_TIMEOUT_MS });
    await this.waitForReady(this.page);
    console.info(`[fotmob:browser] Session ready (headless=${headless}, profile=${userDataDir}).`);
  }

  private async waitForReady(page: PlaywrightPage): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const challenged = await this.isChallengePage(page);
      if (!challenged) {
        const live = await page.evaluate(() => {
          return typeof document !== "undefined" && (
            document.title.toLowerCase().includes("fotmob") ||
            !!document.querySelector("a[href*='/leagues']") ||
            !!document.querySelector("[data-testid]")
          );
        });
        if (live) return;
      }
      await page.waitForTimeout(READY_POLL_MS);
    }
    if (process.env.MACHETE_FOTMOB_BROWSER_HEADLESS === "false") {
      console.warn(
        "[fotmob:browser] Still on challenge page after timeout. Solve the challenge in the visible window, then re-run; cookies will persist."
      );
    } else {
      console.warn(
        "[fotmob:browser] Could not confirm FotMob page is live. Re-run once with MACHETE_FOTMOB_BROWSER_HEADLESS=false to solve Turnstile manually; cookies will then persist for headless runs."
      );
    }
  }

  private async isChallengePage(page: PlaywrightPage): Promise<boolean> {
    return page.evaluate(() => {
      if (typeof document === "undefined") return false;
      const title = document.title.toLowerCase();
      if (title.includes("just a moment") || title.includes("attention required") || title.includes("checking")) return true;
      const challengeForm = document.querySelector("form[action*='__cf_chl']");
      const turnstile = document.querySelector("[data-sitekey], #challenge-form, iframe[src*='challenges.cloudflare']");
      return !!(challengeForm || turnstile);
    });
  }

  async fetchJson(url: string): Promise<unknown> {
    return this.runFetch(url, { kind: "json" });
  }

  async fetchText(url: string): Promise<string> {
    const result = await this.runFetch(url, { kind: "text" });
    if (typeof result !== "string") throw new Error("Expected text response from FotMob page request.");
    return result;
  }

  // Navigate to a FotMob match page and capture the matchDetails JSON that the
  // SPA itself fetches once the hash-id is hydrated. This works around two
  // FotMob behaviours:
  //   1. Direct /api/data/matchDetails calls return 403 unless the request is
  //      decorated with FotMob's signed `x-mas` header, which is added by their
  //      runtime — we cannot reproduce it via raw `fetch` from the page.
  //   2. The SSR HTML on a slug-collision URL (e.g. two Liverpool vs Bournemouth
  //      legs sharing /matches/<slug>/<round>) only contains one of the two
  //      matches, so parsing __NEXT_DATA__ from the initial HTML always loses
  //      the non-canonical leg.
  // By navigating with the right `#id` hash and waiting for the SPA's own
  // network request, we get FotMob to make the authenticated, id-correct call
  // for us and read it back.
  async fetchMatchDetailsByNavigation(matchId: string, pagePath: string): Promise<unknown> {
    await this.ensurePage();
    const context = this.context;
    if (!context) throw new Error("FotMob browser context is not initialized.");

    const fullUrl = new URL(pagePath, FOTMOB_SITE).toString();
    const canonicalUrl = withoutHash(fullUrl);
    const newPage = await context.newPage();
    const seenApiUrls: string[] = [];
    const ignoredMatchDetailsUrls: string[] = [];
    const exactBlockedUrls: string[] = [];
    const debug = process.env.MACHETE_FOTMOB_BROWSER_DEBUG === "true";
    let resolveCanonicalMatchDetails: ((url: string) => void) | null = null;
    const canonicalMatchDetailsPromise = new Promise<string>((resolve) => {
      resolveCanonicalMatchDetails = resolve;
    });

    newPage.on("response", (event) => {
      const response = event as PlaywrightResponse;
      const url = response.url();
      if (url.includes("/api/data/")) {
        seenApiUrls.push(`${response.status()} ${url}`);
        if (debug) console.info(`[fotmob:browser] response ${response.status()} ${url}`);
      }
      if (url.includes("/api/data/matchDetails")) {
        const status = response.status();
        if (isMatchDetailsUrlForMatch(url, matchId) && status >= 400) {
          exactBlockedUrls.push(`${status} ${url}`);
        } else if (!isMatchDetailsUrlForMatch(url, matchId)) {
          ignoredMatchDetailsUrls.push(`${status} ${url}`);
          if (resolveCanonicalMatchDetails) {
            resolveCanonicalMatchDetails(url);
            resolveCanonicalMatchDetails = null;
          }
        }
      }
    });

    try {
      const matchPredicate = (response: PlaywrightResponse): boolean => {
        const url = response.url();
        return response.status() < 400 && isMatchDetailsUrlForMatch(url, matchId);
      };

      const responsePromise = newPage
        .waitForResponse(matchPredicate, { timeout: MATCH_DETAILS_TIMEOUT_MS })
        .then((response) => ({ response }))
        .catch((error: unknown) => ({ error }));

      console.info(`[fotmob:browser] Match ${matchId}: opening ${canonicalUrl}.`);
      await newPage.goto(canonicalUrl, { waitUntil: "domcontentloaded", timeout: REQUEST_TIMEOUT_MS });
      console.info(`[fotmob:browser] Match ${matchId}: page DOM loaded.`);
      try {
        await newPage.waitForLoadState("networkidle", { timeout: REQUEST_TIMEOUT_MS });
        console.info(`[fotmob:browser] Match ${matchId}: page network idle.`);
      } catch {
        // Networkidle is a readiness hint, not a hard requirement.
        console.info(`[fotmob:browser] Match ${matchId}: network idle not reached, continuing.`);
      }

      // Hydrate the canonical page first, then navigate to the exact hash URL.
      // A real navigation lets FotMob's own router/API layer decide what to
      // fetch. Manually dispatching HashChangeEvent or raw fetch calls can
      // bypass their request wrapper and produce bogus matchId=[object Object]
      // or unsigned 403s, which tells us nothing useful.
      if (fullUrl !== canonicalUrl) {
        console.info(`[fotmob:browser] Match ${matchId}: navigating exact hash ${fullUrl}.`);
        await newPage.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: REQUEST_TIMEOUT_MS });
        console.info(`[fotmob:browser] Match ${matchId}: exact hash page DOM loaded.`);
      }

      console.info(`[fotmob:browser] Match ${matchId}: waiting up to ${MATCH_DETAILS_TIMEOUT_MS}ms for exact matchDetails response.`);
      const responseResult = await Promise.race([
        responsePromise.then((result) => ({ kind: "exact" as const, result })),
        canonicalMatchDetailsPromise.then(async (canonicalUrl) => {
          await newPage.waitForTimeout(CANONICAL_GRACE_MS);
          return { kind: "canonical" as const, canonicalUrl };
        })
      ]);

      if (responseResult.kind === "canonical") {
        const sample = seenApiUrls.slice(0, 25).join("\n  ");
        const ignored = ignoredMatchDetailsUrls.slice(0, 10).join("\n  ");
        const blocked = exactBlockedUrls.slice(0, 10).join("\n  ");
        throw new Error(
          `FotMob stayed on canonical matchDetails for ${matchId}; exact matchDetails was not observed within ${CANONICAL_GRACE_MS}ms after ${responseResult.canonicalUrl}.\n` +
            `Blocked exact matchDetails responses:\n  ${blocked || "(none)"}\n` +
            `Ignored paired/canonical matchDetails responses:\n  ${ignored || "(none)"}\n` +
            `Observed /api/data/* responses on the page:\n  ${sample || "(none)"}`
        );
      }

      let response: PlaywrightResponse;
      if ("response" in responseResult.result) {
        response = responseResult.result.response;
        console.info(`[fotmob:browser] Match ${matchId}: exact matchDetails response captured (${response.status()}).`);
      } else {
        try {
          await newPage.waitForTimeout(250);
        } catch {
          // ignore
        }
        const sample = seenApiUrls.slice(0, 25).join("\n  ");
        const ignored = ignoredMatchDetailsUrls.slice(0, 10).join("\n  ");
        const blocked = exactBlockedUrls.slice(0, 10).join("\n  ");
        throw new Error(
          `Successful FotMob matchDetails XHR was not observed for exact match ${matchId} within ${MATCH_DETAILS_TIMEOUT_MS}ms.\n` +
            `Blocked exact matchDetails responses:\n  ${blocked || "(none)"}\n` +
            `Ignored paired/canonical matchDetails responses:\n  ${ignored || "(none)"}\n` +
            `Observed /api/data/* responses on the page:\n  ${sample || "(none)"}\n` +
            `Original error: ${responseResult.result.error instanceof Error ? responseResult.result.error.message : String(responseResult.result.error)}`
        );
      }

      const status = response.status();
      if (status >= 400) {
        const body = await response.text().catch(() => "");
        throw new Error(`FotMob matchDetails returned ${status} for ${matchId}: ${body.slice(0, 200)}`);
      }
      return await response.json();
    } finally {
      try {
        await newPage.close();
      } catch {
        // ignore page close errors
      }
    }
  }

  private async runFetch(url: string, opts: { kind: "json" | "text" }): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const page = await this.ensurePage();
      try {
        const result = (await page.evaluate(
          async ([target, kind, timeout]) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), Number(timeout));
            try {
              const res = await fetch(target as string, {
                credentials: "include",
                signal: controller.signal,
                headers: {
                  Accept: kind === "json" ? "application/json, text/plain, */*" : "text/html,application/xhtml+xml"
                }
              });
              const body = await res.text();
              return {
                ok: res.ok,
                status: res.status,
                statusText: res.statusText,
                contentType: res.headers.get("content-type") || "",
                body
              };
            } catch (err) {
              return { error: err instanceof Error ? err.message : String(err) };
            } finally {
              clearTimeout(timer);
            }
          },
          [url, opts.kind, REQUEST_TIMEOUT_MS] as [string, "json" | "text", number]
        )) as
          | { ok: boolean; status: number; statusText: string; contentType: string; body: string }
          | { error: string };

        if ("error" in result) throw new Error(`Browser fetch failed: ${result.error}`);

        if (result.status === 403 || result.status === 429) {
          throw new Error(
            `FotMob browser request blocked with ${result.status}; rerun with MACHETE_FOTMOB_BROWSER_HEADLESS=false to refresh the session.`
          );
        }
        if (!result.ok) {
          throw new Error(`FotMob browser request failed with ${result.status} ${result.statusText}`);
        }

        if (opts.kind === "json") {
          if (!result.contentType.includes("application/json")) {
            const snippet = result.body.slice(0, 200);
            throw new Error(`FotMob returned ${result.contentType || "non-JSON"} for ${url}: ${snippet}`);
          }
          const parsed = JSON.parse(result.body);
          const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as AnyRecord) : null;
          if (record && (record.code === "TURNSTILE_REQUIRED" || record.error === "Verification required")) {
            throw new Error(
              "FotMob verification is required; rerun with MACHETE_FOTMOB_BROWSER_HEADLESS=false to solve the challenge once, then headless runs will reuse the cookies."
            );
          }
          return parsed;
        }
        return result.body;
      } catch (error) {
        lastError = error;
        const fatal = error instanceof Error && (
          error.message.includes("403") ||
          error.message.includes("429") ||
          error.message.toLowerCase().includes("verification") ||
          error.message.includes("TURNSTILE")
        );
        if (fatal) throw error;
        if (attempt === 2) break;
        await sleep(2 ** attempt * 750);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("FotMob browser fetch failed.");
  }

  async close(): Promise<void> {
    const ctx = this.context;
    this.context = null;
    this.page = null;
    this.launching = null;
    if (ctx) {
      try {
        await ctx.close();
      } catch (error) {
        console.warn("[fotmob:browser] Error while closing context:", error instanceof Error ? error.message : error);
      }
    }
  }
}

let instance: FotMobBrowserManager | null = null;

export function getFotMobBrowser(): FotMobBrowserManager {
  if (!instance) instance = new FotMobBrowserManager();
  return instance;
}

export async function closeFotMobBrowser(): Promise<void> {
  if (!instance) return;
  const current = instance;
  instance = null;
  await current.close();
}

export function isMatchDetailsUrlForMatch(url: string, matchId: string): boolean {
  if (!url.includes("/api/data/matchDetails")) {
    try {
      const parsed = new URL(url);
      const nestedUrl = parsed.searchParams.get("url");
      if (!nestedUrl) return false;
      const nested = new URL(nestedUrl, FOTMOB_SITE);
      return nested.pathname.includes("/api/data/matchDetails") && nested.searchParams.get("matchId") === matchId;
    } catch {
      return false;
    }
  }

  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get("matchId") === matchId) return true;
    const nestedUrl = parsed.searchParams.get("url");
    if (nestedUrl) {
      try {
        const nested = new URL(nestedUrl, FOTMOB_SITE);
        if (nested.searchParams.get("matchId") === matchId) return true;
      } catch {
        // Fall through to substring checks below.
      }
    }
  } catch {
    // Fall through to substring checks below.
  }

  return (
    url.includes(`matchId=${matchId}`) ||
    url.includes(`matchId%3D${matchId}`) ||
    url.endsWith(`/${matchId}`)
  );
}

function withoutHash(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split("#")[0] ?? url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let signalsRegistered = false;
export function registerBrowserShutdownHooks(): void {
  if (signalsRegistered) return;
  signalsRegistered = true;
  const shutdown = async () => {
    await closeFotMobBrowser();
  };
  process.once("SIGINT", () => { void shutdown().finally(() => process.exit(130)); });
  process.once("SIGTERM", () => { void shutdown().finally(() => process.exit(143)); });
  process.once("beforeExit", () => { void shutdown(); });
}
