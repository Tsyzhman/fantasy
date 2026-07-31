(() => {
  "use strict";

  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const widgetId = "fantasy-tsyzhman-sports-transfer";
  const sportsGraphqlEndpoint = "https://www.sports.ru/gql/graphql/";
  const sportsRequestHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "X-Appname": "frontend-fantasy",
    "X-Appversion": "v1.0.6"
  };
  const tournamentPathPattern = /^\/fantasy\/football\/([a-z0-9-]+)(?:\/|$)/i;

  if (document.getElementById(widgetId)) return;

  const host = document.createElement("div");
  host.id = widgetId;
  host.style.cssText = "all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .card {
        width: min(320px, calc(100vw - 28px));
        box-sizing: border-box;
        border: 1px solid rgba(15, 23, 42, .14);
        border-radius: 16px;
        background: rgba(255, 255, 255, .98);
        box-shadow: 0 18px 48px rgba(15, 23, 42, .22);
        color: #0f172a;
        font: 13px/1.4 Arial, sans-serif;
        padding: 12px;
      }
      .brand {
        align-items: center;
        display: flex;
        gap: 9px;
        margin-bottom: 9px;
      }
      .mark {
        align-items: center;
        background: #111827;
        border-radius: 10px;
        color: #fff;
        display: inline-flex;
        font-size: 12px;
        font-weight: 800;
        height: 30px;
        justify-content: center;
        letter-spacing: -.03em;
        width: 30px;
      }
      .title { font-size: 13px; font-weight: 700; }
      .subtitle { color: #64748b; font-size: 11px; }
      .button {
        appearance: none;
        background: #16a34a;
        border: 0;
        border-radius: 11px;
        color: #fff;
        cursor: pointer;
        display: block;
        font: 700 13px/1 Arial, sans-serif;
        min-height: 40px;
        padding: 0 14px;
        transition: background .15s ease, transform .15s ease;
        width: 100%;
      }
      .button:hover:not(:disabled) { background: #15803d; transform: translateY(-1px); }
      .button:disabled { cursor: wait; opacity: .72; }
      .status {
        color: #475569;
        display: none;
        margin: 9px 2px 0;
        overflow-wrap: anywhere;
      }
      .status[data-visible="true"] { display: block; }
      .status[data-tone="error"] { color: #be123c; }
      .status[data-tone="success"] { color: #15803d; }
      .login {
        color: #166534;
        display: none;
        font-weight: 700;
        margin: 7px 2px 0;
      }
      .login[data-visible="true"] { display: inline-block; }
    </style>
    <section class="card" aria-label="Перенос состава Fantasy">
      <div class="brand">
        <span class="mark">F→S</span>
        <span>
          <span class="title">Fantasy → Sports.ru</span><br>
          <span class="subtitle">Последний сохранённый вариант</span>
        </span>
      </div>
      <button class="button" type="button">Перенести состав</button>
      <div class="status" role="status" aria-live="polite"></div>
      <a class="login" href="https://fantasy.tsyzhman.ru/login" target="_blank" rel="noreferrer">Войти на fantasy.tsyzhman.ru</a>
    </section>
  `;
  document.documentElement.append(host);

  const button = shadow.querySelector(".button");
  const status = shadow.querySelector(".status");
  const login = shadow.querySelector(".login");
  button.addEventListener("click", transferSquad);

  async function transferSquad() {
    const tournamentHru = currentTournamentHru();
    if (!tournamentHru) {
      showStatus("Не удалось определить лигу Sports.ru.", "error");
      return;
    }

    setPending(true);
    login.dataset.visible = "false";
    showStatus("Загружаю последний сохранённый состав…", "progress");
    try {
      const planResponse = await sendExtensionMessage({
        type: "FANTASY_GET_SPORTS_TRANSFER_PLAN",
        tournamentHru
      });
      if (!planResponse?.ok) {
        if (planResponse?.error?.loginUrl) {
          login.href = planResponse.error.loginUrl;
          login.dataset.visible = "true";
        }
        throw new Error(planResponse?.error?.message || "Не удалось получить состав.");
      }

      const plan = validateTransferPlan(planResponse.plan, tournamentHru);
      showStatus("Сбрасываю локальный черновик замен Sports.ru…", "progress");
      const sportsSquad = await loadCurrentSportsSquad(tournamentHru);
      if (!sportsSquad) {
        throw new Error("Сначала войдите на Sports.ru и создайте команду в этой лиге.");
      }
      if (sportsSquad.seasonId !== plan.sportsRuSeasonId) {
        throw new Error("Сезон Sports.ru не совпадает с сезоном сохранённого состава.");
      }

      const transferCount = countPlayerChanges(sportsSquad.players, plan.players);
      showStatus(
        transferCount === null
          ? `Применяю состав «${plan.squadName}»…`
          : `Применяю состав «${plan.squadName}»: ${transferCount} замен…`,
        "progress"
      );
      await updateSportsSquad(sportsSquad.squadId, plan.players);
      showStatus("Состав сохранён на Sports.ru. Обновляю страницу…", "success");
      setTimeout(() => window.location.reload(), 1_200);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Перенос не выполнен.", "error");
      setPending(false);
    }
  }

  async function loadCurrentSportsSquad(tournamentHru) {
    const payload = await sportsGraphql(
      `query FantasyTransferCurrentSquad($tournamentHru: ID!) {
        fantasyQueries {
          tournament(id: $tournamentHru, source: HRU) {
            currentSeason {
              id
              currentSquad {
                id
                name
                currentTourInfo {
                  players {
                    seasonPlayer { id }
                  }
                }
              }
            }
          }
        }
      }`,
      { tournamentHru }
    );
    const season = payload?.fantasyQueries?.tournament?.currentSeason;
    const squad = season?.currentSquad;
    if (!season?.id || !squad?.id) return null;
    return {
      seasonId: String(season.id),
      squadId: String(squad.id),
      players: Array.isArray(squad.currentTourInfo?.players)
        ? squad.currentTourInfo.players
          .map((row) => row?.seasonPlayer?.id)
          .filter((value) => typeof value === "string")
        : []
    };
  }

  async function updateSportsSquad(squadId, players) {
    const payload = await sportsGraphql(
      `mutation FantasyTransferUpdateSquad($input: FantasyUpdateSquadInput!) {
        fantasyMutations {
          updateSquad(input: $input) {
            status
            message
            squad { id name }
          }
        }
      }`,
      {
        input: {
          squadID: squadId,
          playersOnly: true,
          players: players.map((player) => {
            const input = {
              playerID: player.providerPlayerId,
              isStarting: player.isStarting,
              isCaptain: player.isCaptain,
              isViceCaptain: player.isViceCaptain
            };
            if (Number.isInteger(player.substitutePriority)) {
              input.SubstitutePriority = player.substitutePriority;
            }
            return input;
          })
        }
      }
    );
    const result = payload?.fantasyMutations?.updateSquad;
    if (!result?.status) {
      throw new Error(result?.message || "Sports.ru отклонил сохранение состава.");
    }
  }

  async function sportsGraphql(query, variables) {
    const response = await fetch(sportsGraphqlEndpoint, {
      method: "POST",
      credentials: "include",
      headers: sportsRequestHeaders,
      body: JSON.stringify({ query, variables })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Sports.ru вернул ошибку ${response.status}.`);
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      throw new Error(payload.errors[0]?.message || "GraphQL-запрос Sports.ru завершился ошибкой.");
    }
    return payload?.data;
  }

  function validateTransferPlan(plan, expectedTournamentHru) {
    if (
      !plan
      || plan.tournamentHru !== expectedTournamentHru
      || typeof plan.sportsRuSeasonId !== "string"
      || typeof plan.squadName !== "string"
      || !Array.isArray(plan.players)
      || plan.players.length !== 15
      || plan.players.some((player) => typeof player?.providerPlayerId !== "string")
    ) {
      throw new Error("Сервер вернул неполный план переноса.");
    }
    return plan;
  }

  function countPlayerChanges(currentPlayerIds, desiredPlayers) {
    if (!Array.isArray(currentPlayerIds) || currentPlayerIds.length === 0) return null;
    const current = new Set(currentPlayerIds);
    return desiredPlayers.reduce(
      (count, player) => count + Number(!current.has(player.providerPlayerId)),
      0
    );
  }

  function currentTournamentHru() {
    return window.location.pathname.match(tournamentPathPattern)?.[1]?.toLowerCase() ?? null;
  }

  function sendExtensionMessage(message) {
    if (globalThis.browser?.runtime) return globalThis.browser.runtime.sendMessage(message);

    return new Promise((resolve, reject) => {
      globalThis.chrome.runtime.sendMessage(message, (response) => {
        const lastError = globalThis.chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function showStatus(message, tone) {
    status.textContent = message;
    status.dataset.tone = tone;
    status.dataset.visible = "true";
  }

  function setPending(pending) {
    button.disabled = pending;
    button.textContent = pending ? "Переношу…" : "Перенести состав";
  }
})();
