import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

type AnyRecord = Record<string, unknown>;

type PlaywrightBrowserContext = {
  newPage: () => Promise<PlaywrightPage>;
  cookies: (urls?: string | string[]) => Promise<Array<{ name: string; value: string; domain: string }>>;
  addInitScript: (script: string | { content: string } | ((arg: unknown) => unknown), arg?: unknown) => Promise<void>;
  close: () => Promise<void>;
};

type PlaywrightPage = {
  goto: (url: string, options?: AnyRecord) => Promise<{ status: () => number } | null>;
  evaluate: <T, A = void>(fn: (arg: A) => T | Promise<T>, arg?: A) => Promise<T>;
  waitForTimeout: (ms: number) => Promise<void>;
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
