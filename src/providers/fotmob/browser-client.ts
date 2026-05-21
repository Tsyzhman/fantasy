import { FotMobFixtureDetailsUnavailableError, UnofficialFotMobClient, validatedMatchDetailsPayload } from "./client";
import { getFotMobBrowser, registerBrowserShutdownHooks } from "./browser-manager";

export class BrowserFotMobClient extends UnofficialFotMobClient {
  constructor() {
    super();
    registerBrowserShutdownHooks();
  }

  protected async getJson(
    path: string,
    params: Record<string, string | number | undefined>
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return getFotMobBrowser().fetchJson(url.toString());
  }

  protected async getText(url: string): Promise<string> {
    return getFotMobBrowser().fetchText(url);
  }

  // The base implementation parses __NEXT_DATA__ from the initial HTML, which
  // always returns FotMob's "canonical" match for slug-collision URLs (e.g.
  // home and reverse fixture sharing one /matches/<slug>/<round> path). Instead,
  // navigate with the right hash and capture the matchDetails XHR the SPA itself
  // makes — that request goes through FotMob's signed `x-mas` interceptor and
  // returns the actual id we asked for.
  protected async getMatchPageProps(fixtureId: string, summaryPayload: unknown): Promise<unknown> {
    const pageUrl = readStringField(summaryPayload, "pageUrl");
    if (!pageUrl) {
      throw new FotMobFixtureDetailsUnavailableError(fixtureId, "match page URL missing from summary payload");
    }

    const path = ensureHashId(pageUrl, fixtureId);
    const payload = await getFotMobBrowser().fetchMatchDetailsByNavigation(fixtureId, path);
    return validatedMatchDetailsPayload(fixtureId, payload, "browser navigation");
  }
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  if (typeof field === "string" && field.length > 0) return field;
  if (typeof field === "number" && Number.isFinite(field)) return String(field);
  return undefined;
}

function ensureHashId(pageUrl: string, fixtureId: string): string {
  if (pageUrl.includes("#")) return pageUrl;
  return `${pageUrl}#${fixtureId}`;
}
