(() => {
  "use strict";

  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const fantasyOrigin = "https://fantasy.tsyzhman.ru";
  const sessionCookieName = "fantasy_session";
  const requestTimeoutMs = 15_000;
  const tournamentPattern = /^[a-z0-9-]{1,64}$/;
  const sportsFantasyUrlPattern = /^https:\/\/www\.sports\.ru\/fantasy\/football\/[a-z0-9-]+(?:\/|$)/i;

  extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "FANTASY_GET_SPORTS_TRANSFER_PLAN") return false;

    const senderUrl = sender.url ?? sender.tab?.url;
    if (!senderUrl || !sportsFantasyUrlPattern.test(senderUrl)) {
      sendResponse(failure("FORBIDDEN_PAGE", "Откройте страницу футбольного фэнтези Sports.ru."));
      return false;
    }

    void loadTransferPlan(message.tournamentHru)
      .then(sendResponse)
      .catch(() => sendResponse(failure("REQUEST_FAILED", "Не удалось связаться с fantasy.tsyzhman.ru.")));
    return true;
  });

  async function loadTransferPlan(rawTournamentHru) {
    const tournamentHru = typeof rawTournamentHru === "string" ? rawTournamentHru.trim().toLowerCase() : "";
    if (!tournamentPattern.test(tournamentHru)) {
      return failure("INVALID_TOURNAMENT", "Не удалось определить лигу Sports.ru.");
    }

    const sessionCookie = await readFantasySessionCookie();
    if (!sessionCookie?.value) {
      return failure(
        "FANTASY_LOGIN_REQUIRED",
        "Сначала войдите на fantasy.tsyzhman.ru.",
        `${fantasyOrigin}/login`
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const url = new URL("/api/browser-extension/sports-squad", fantasyOrigin);
      url.searchParams.set("tournamentHru", tournamentHru);
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        headers: {
          Authorization: `Bearer ${sessionCookie.value}`,
          "X-Fantasy-Extension-Version": extensionApi.runtime.getManifest().version
        },
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.plan) {
        const code = payload?.error?.code || (response.status === 401 ? "FANTASY_LOGIN_REQUIRED" : "PLAN_REQUEST_FAILED");
        const message = response.status === 401
          ? "Сначала войдите на fantasy.tsyzhman.ru."
          : payload?.error?.message || "Не удалось получить сохранённый состав.";
        return failure(code, message, response.status === 401 ? `${fantasyOrigin}/login` : null);
      }
      return { ok: true, plan: payload.plan };
    } finally {
      clearTimeout(timeout);
    }
  }

  function readFantasySessionCookie() {
    const details = {
      url: fantasyOrigin,
      name: sessionCookieName
    };
    if (globalThis.browser?.cookies) return globalThis.browser.cookies.get(details);

    return new Promise((resolve, reject) => {
      globalThis.chrome.cookies.get(details, (cookie) => {
        const lastError = globalThis.chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(cookie ?? null);
      });
    });
  }

  function failure(code, message, loginUrl = null) {
    return {
      ok: false,
      error: { code, message, loginUrl }
    };
  }
})();
