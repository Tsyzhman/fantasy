"use client";
/** @spec spec://modules/telegram/FEAT-007-deadline-assistant#linking */
import { useCallback, useEffect, useRef, useState } from "react";
import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";

interface TelegramSubscriptionView {
  contestId: string;
  squadId: string | null;
  sourcePreference: string;
  enabled: boolean;
}

interface TelegramContestOption {
  contestId: string;
  name: string;
  season: string;
  squads: Array<{ id: string; name: string }>;
}

interface TelegramOverview {
  state: "UNLINKED" | "PENDING" | "ACTIVE" | "PAUSED" | "BLOCKED" | "REVOKED";
  botUsername: string | null;
  link: { firstName: string | null; username: string | null; telegramUserIdMasked: string; consentAt: string | null } | null;
  candidate: { firstName: string | null; username: string | null; telegramUserIdMasked: string } | null;
  pendingExpiresAt: string | null;
  subscriptions: TelegramSubscriptionView[];
  contestOptions: TelegramContestOption[];
}

interface TelegramChallenge {
  code: string;
  deepLink: string | null;
  expiresAt: string;
  graceExpiresAt: string;
  slot: number;
}

interface DraftSubscription {
  selected: boolean;
  squadId: string | null;
  sourcePreference: string;
}

function secondsLeft(iso: string | null, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));
}

export function TelegramSettings() {
  const language = useLanguage();
  const [overview, setOverview] = useState<TelegramOverview | null>(null);
  const [challenge, setChallenge] = useState<TelegramChallenge | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftSubscription>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/profile/telegram", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const value = (await response.json()) as TelegramOverview;
    setOverview(value);
    if (!dirtyRef.current) {
      setDraft(
        Object.fromEntries(
          value.contestOptions.map((option) => {
            const existing = value.subscriptions.find((subscription) => subscription.contestId === option.contestId);
            return [
              option.contestId,
              {
                selected: Boolean(existing?.enabled),
                squadId: existing?.squadId ?? (option.squads.length === 1 ? option.squads[0]!.id : null),
                sourcePreference: existing?.sourcePreference ?? "SPORTS_PUBLISHED"
              }
            ];
          })
        )
      );
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (overview?.state !== "PENDING") return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [overview?.state, load]);

  const issueCode = useCallback(async () => {
    const session = await fetch("/api/profile/telegram/link-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store"
    }).catch(() => null);
    if (!session?.ok) {
      setStatus(localizedText(language, "Could not start Telegram linking.", "Не удалось начать привязку Telegram."));
      return;
    }
    const response = await fetch("/api/profile/telegram/link-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store"
    }).catch(() => null);
    if (!response?.ok) {
      const payload = (await response?.json().catch(() => null)) as { error?: { code?: string; retryAfterSeconds?: number } } | null;
      setStatus(payload?.error?.code === "RATE_LIMITED"
        ? localizedText(language, "Too many code requests. Wait a minute.", "Слишком много запросов кода. Подождите минуту.")
        : localizedText(language, "Could not issue a Telegram code.", "Не удалось выпустить код Telegram."));
      return;
    }
    const value = (await response.json()) as TelegramChallenge;
    setChallenge(value);
    setStatus(null);
  }, [language]);

  useEffect(() => {
    if (!challenge || overview?.state === "PENDING") return;
    const rotate = () => {
      if (document.visibilityState !== "visible") return;
      void issueCode();
    };
    const timer = setInterval(rotate, 15000);
    return () => clearInterval(timer);
  }, [challenge?.slot, overview?.state, issueCode]);

  async function mutate(path: string, init: RequestInit) {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch(path, { cache: "no-store", ...init });
      if (!response.ok) {
        setStatus(localizedText(language, "The action failed.", "Действие не выполнено."));
        return false;
      }
      const payload = (await response.json().catch(() => null)) as { overview?: TelegramOverview } | TelegramOverview | null;
      const next = payload && "overview" in payload && payload.overview ? payload.overview : (payload as TelegramOverview | null);
      if (next) setOverview(next);
      dirtyRef.current = false;
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const pending = overview?.state === "PENDING";
  const linked = overview?.state === "ACTIVE" || overview?.state === "PAUSED";
  const codeSeconds = secondsLeft(challenge?.expiresAt ?? null, now);
  const graceSeconds = secondsLeft(challenge?.graceExpiresAt ?? null, now);

  return (
    <div className="ui-card p-4">
      <h3 className="text-sm font-semibold text-slate-700"><I18nText en="Telegram deadline assistant" ru="Telegram-помощник перед дедлайном" /></h3>
      <p className="mt-1 text-xs text-slate-500">
        <I18nText
          en="Link a private Telegram chat to receive a per-tournament deadline report. No site password or Sports cookies are shared."
          ru="Привяжите личный чат Telegram, чтобы получать отчёт по каждому турниру перед дедлайном. Пароль сайта и cookies Sports не передаются."
        />
      </p>

      {!overview ? <p className="mt-2 text-sm text-slate-500"><I18nText en="Loading…" ru="Загрузка…" /></p> : null}

      {overview && !linked && !pending ? (
        <div className="mt-3 space-y-2">
          {overview.state === "BLOCKED" ? (
            <p className="text-sm text-amber-700"><I18nText en="The bot is blocked in Telegram. Unblock it and link again." ru="Бот заблокирован в Telegram. Разблокируйте его и привяжите заново." /></p>
          ) : null}
          <button type="button" className="ui-button ui-button-primary disabled:opacity-55" disabled={busy} onClick={() => void issueCode()}>
            <I18nText en="Connect Telegram" ru="Подключить Telegram" />
          </button>
          {challenge ? (
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
              <p>
                <I18nText en="Code (updates every 15 seconds):" ru="Код (меняется каждые 15 секунд):" />{" "}
                <span className="font-mono text-base font-semibold tracking-wide">{challenge.code}</span>
              </p>
              <p className="text-xs text-slate-500">
                {codeSeconds > 0
                  ? localizedText(language, `Current code expires in ${codeSeconds} s.`, `Текущий код действует ещё ${codeSeconds} с.`)
                  : localizedText(language, `Previous code accepted for ${graceSeconds} s more.`, `Предыдущий код принимается ещё ${graceSeconds} с.`)}
              </p>
              {challenge.deepLink ? (
                <a className="ui-button ui-button-primary mt-2 inline-flex" href={challenge.deepLink} target="_blank" rel="noreferrer noopener">
                  <I18nText en="Open the bot" ru="Открыть бота" />
                </a>
              ) : (
                <p className="text-xs text-amber-700"><I18nText en="Set TELEGRAM_BOT_USERNAME to enable the deep link." ru="Укажите TELEGRAM_BOT_USERNAME для deep link." /></p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {pending && overview?.candidate ? (
        <div className="mt-3 space-y-2 rounded border border-sky-200 bg-sky-50 p-3 text-sm">
          <p>
            <I18nText en="Confirm the Telegram account:" ru="Подтвердите аккаунт Telegram:" />{" "}
            <span className="font-semibold">{overview.candidate.firstName ?? "Telegram"}{overview.candidate.username ? ` (@${overview.candidate.username})` : ""}</span>{" "}
            <span className="text-slate-500">{overview.candidate.telegramUserIdMasked}</span>
          </p>
          <p className="text-xs text-slate-500">
            {localizedText(language, `Candidate expires in ${secondsLeft(overview.pendingExpiresAt, now)} s.`, `Кандидат истекает через ${secondsLeft(overview.pendingExpiresAt, now)} с.`)}
          </p>
          <div className="flex gap-2">
            <button type="button" className="ui-button ui-button-primary disabled:opacity-55" disabled={busy} onClick={() => void mutate("/api/profile/telegram/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approve: true }) })}>
              <I18nText en="Confirm" ru="Подтвердить" />
            </button>
            <button type="button" className="rounded border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-55" disabled={busy} onClick={() => void mutate("/api/profile/telegram/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approve: false }) })}>
              <I18nText en="Cancel" ru="Отмена" />
            </button>
          </div>
        </div>
      ) : null}

      {linked && overview ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              <I18nText en="Connected:" ru="Подключено:" />{" "}
              <span className="font-semibold">{overview.link?.firstName ?? "Telegram"}{overview.link?.username ? ` (@${overview.link.username})` : ""}</span>{" "}
              <span className="text-slate-500">{overview.link?.telegramUserIdMasked}</span>
            </span>
            <span className={overview.state === "ACTIVE" ? "text-emerald-700" : "text-amber-700"}>
              {overview.state === "ACTIVE" ? <I18nText en="Active" ru="Активна" /> : <I18nText en="Paused" ru="Пауза" />}
            </span>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700"><I18nText en="Tournaments" ru="Турниры" /></p>
            <div className="mt-1 space-y-1">
              {overview.contestOptions.map((option) => (
                <label key={option.contestId} className="flex flex-wrap items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft[option.contestId]?.selected ?? false}
                    onChange={(event) => {
                      dirtyRef.current = true;
                      setDraft((current) => ({
                        ...current,
                        [option.contestId]: {
                          selected: event.target.checked,
                          squadId: current[option.contestId]?.squadId ?? (option.squads.length === 1 ? option.squads[0]!.id : null),
                          sourcePreference: current[option.contestId]?.sourcePreference ?? "SPORTS_PUBLISHED"
                        }
                      }));
                    }}
                  />
                  <span>{option.name} · {option.season}</span>
                  {option.squads.length > 1 ? (
                    <select
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                      value={draft[option.contestId]?.squadId ?? ""}
                      onChange={(event) => {
                        dirtyRef.current = true;
                        setDraft((current) => ({
                          ...current,
                          [option.contestId]: {
                            selected: current[option.contestId]?.selected ?? true,
                            squadId: event.target.value || null,
                            sourcePreference: current[option.contestId]?.sourcePreference ?? "SPORTS_PUBLISHED"
                          }
                        }));
                      }}
                    >
                      <option value="">{localizedText(language, "Choose a squad", "Выберите команду")}</option>
                      {option.squads.map((squad) => (
                        <option key={squad.id} value={squad.id}>{squad.name}</option>
                      ))}
                    </select>
                  ) : null}
                  <select
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                    value={draft[option.contestId]?.sourcePreference ?? "SPORTS_PUBLISHED"}
                    onChange={(event) => {
                      dirtyRef.current = true;
                      setDraft((current) => ({
                        ...current,
                        [option.contestId]: {
                          selected: current[option.contestId]?.selected ?? true,
                          squadId: current[option.contestId]?.squadId ?? null,
                          sourcePreference: event.target.value
                        }
                      }));
                    }}
                  >
                    <option value="SPORTS_PUBLISHED">{localizedText(language, "Published Sports squad", "Опубликованный состав Sports")}</option>
                    <option value="SITE_SAVED">{localizedText(language, "Saved Scout squad", "Сохранённый состав Scout")}</option>
                  </select>
                </label>
              ))}
            </div>
            <button
              type="button"
              className="ui-button ui-button-primary mt-2 disabled:opacity-55"
              disabled={busy}
              onClick={() =>
                void mutate("/api/profile/telegram/subscriptions", {
                  method: "PUT",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    subscriptions: overview.contestOptions
                      .filter((option) => draft[option.contestId]?.selected)
                      .map((option) => ({
                        contestId: option.contestId,
                        squadId: draft[option.contestId]?.squadId ?? null,
                        sourcePreference: draft[option.contestId]?.sourcePreference ?? "SPORTS_PUBLISHED"
                      }))
                  })
                })
              }
            >
              <I18nText en="Save tournaments" ru="Сохранить турниры" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-55"
              disabled={busy}
              onClick={() => void mutate("/api/profile/telegram", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ paused: overview.state === "ACTIVE" }) })}
            >
              {overview.state === "ACTIVE" ? <I18nText en="Pause" ru="Пауза" /> : <I18nText en="Resume" ru="Возобновить" />}
            </button>
            <button
              type="button"
              className="rounded border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-55"
              disabled={busy}
              onClick={() => void mutate("/api/profile/telegram", { method: "DELETE" })}
            >
              <I18nText en="Unlink" ru="Отвязать" />
            </button>
          </div>
        </div>
      ) : null}

      {status ? <p role="status" className="mt-2 text-sm text-amber-700">{status}</p> : null}
    </div>
  );
}
