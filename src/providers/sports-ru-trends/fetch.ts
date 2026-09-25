import { createHash } from "node:crypto";

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#errors
 * @spec spec://modules/machete/FEAT-006-sports-popularity#contracts
 */
export const SPORTS_TRENDS_ALLOWED_HOSTS = ["www.sports.ru", "sports.ru", "m.sports.ru"];
export const SPORTS_TRENDS_MAX_BODY_BYTES = 2 * 1024 * 1024;
export const SPORTS_TRENDS_TIMEOUT_MS = 20_000;
export const SPORTS_TRENDS_USER_AGENT = "MacheteFantasyTrends/1.0";

export type SportsTrendsFetchErrorCode =
  | "INVALID_URL"
  | "NETWORK"
  | "HTTP"
  | "RATE_LIMITED"
  | "FORBIDDEN"
  | "TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE";

export class SportsTrendsFetchError extends Error {
  readonly code: SportsTrendsFetchErrorCode;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(code: SportsTrendsFetchErrorCode, message: string, options?: { status?: number | null; retryAfterSeconds?: number | null }) {
    super(message);
    this.name = "SportsTrendsFetchError";
    this.code = code;
    this.status = options?.status ?? null;
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
  }
}

export interface SportsTrendsFetchResult {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  fetchedAt: Date;
  contentHash: string;
}

export interface SportsTrendsFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  userAgent?: string;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}

export function isAllowedSportsTrendUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && SPORTS_TRENDS_ALLOWED_HOSTS.includes(url.host);
  } catch {
    return false;
  }
}

function retryAfterSecondsFromHeader(value: string | null): number | null {
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber;
  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  return null;
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * @spec spec://modules/machete/FEAT-006-sports-popularity#errors
 * @spec spec://modules/machete/FEAT-006-sports-popularity#contracts
 */
export async function fetchSportsTrendsHtml(url: string, options: SportsTrendsFetchOptions = {}): Promise<SportsTrendsFetchResult> {
  if (!isAllowedSportsTrendUrl(url)) {
    throw new SportsTrendsFetchError("INVALID_URL", `URL is not an allowed Sports host: ${url}`);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? SPORTS_TRENDS_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? SPORTS_TRENDS_MAX_BODY_BYTES;
  const retries = Math.max(0, options.retries ?? 3);
  const userAgent = options.userAgent ?? SPORTS_TRENDS_USER_AGENT;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;
  for (;;) {
    attempt += 1;
    let response: Response | null = null;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (attempt > retries) {
        throw new SportsTrendsFetchError("NETWORK", error instanceof Error ? error.message : "Sports request failed");
      }
      await sleep(500 * 2 ** (attempt - 1));
      continue;
    }

    const finalUrl = response.url || url;
    if (!isAllowedSportsTrendUrl(finalUrl)) {
      throw new SportsTrendsFetchError("INVALID_URL", `Redirect left the allowed Sports hosts: ${finalUrl}`);
    }

    if (response.status === 429) {
      const retryAfterSeconds = retryAfterSecondsFromHeader(response.headers.get("retry-after"));
      if (attempt > retries) {
        throw new SportsTrendsFetchError("RATE_LIMITED", "Sports rate limit exceeded", { status: 429, retryAfterSeconds });
      }
      await sleep((retryAfterSeconds ?? 1) * 1000);
      continue;
    }

    if (response.status === 403) {
      throw new SportsTrendsFetchError("FORBIDDEN", "Sports returned a protection page", {
        status: 403,
        retryAfterSeconds: retryAfterSecondsFromHeader(response.headers.get("retry-after"))
      });
    }

    if (response.status >= 500 || (response.status >= 400 && response.status !== 429)) {
      if (attempt > retries) {
        throw new SportsTrendsFetchError("HTTP", `Sports request failed with status ${response.status}`, {
          status: response.status,
          retryAfterSeconds: retryAfterSecondsFromHeader(response.headers.get("retry-after"))
        });
      }
      await sleep(500 * 2 ** (attempt - 1));
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new SportsTrendsFetchError("UNSUPPORTED_CONTENT_TYPE", `Unexpected content type ${contentType}`, { status: response.status });
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new SportsTrendsFetchError("TOO_LARGE", "Sports response is larger than the bounded limit");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new SportsTrendsFetchError("TOO_LARGE", "Sports response is larger than the bounded limit");
    }

    const html = buffer.toString("utf8");
    return {
      url,
      finalUrl,
      status: response.status,
      html,
      fetchedAt: now(),
      contentHash: createHash("sha256").update(buffer).digest("hex")
    };
  }
}
