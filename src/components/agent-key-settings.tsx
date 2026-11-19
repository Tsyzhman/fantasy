"use client";

/** @spec spec://modules/agents/FEAT-016-personal-agent-api#keys */
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useLanguage } from "@/components/localized-option";
import { agentScopes, type AgentScope } from "@/server/agent-api/contract";
import type { AgentKeyPage, AgentKeySummary } from "@/server/agent-api/keys";

const endpoint = "/api/profile/agent-keys";
const fieldClass = "mt-1 block w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-ink";
const secondaryButton = "ui-button border border-slate-200 bg-white text-slate-700 disabled:opacity-50";
const permissionLabels: Record<AgentScope, [string, string]> = {
  "squads:read": ["Read squads", "Читать составы"],
  "squads:write": ["Change squads", "Изменять составы"],
  "workflows:read": ["Read workflows and runs", "Читать процессы и запуски"],
  "workflows:write": ["Edit workflow drafts", "Редактировать черновики процессов"],
  "workflows:test": ["Test workflows", "Тестировать процессы"],
  "workflows:publish": ["Publish workflows", "Публиковать процессы"],
  "workflows:run": ["Run workflows", "Запускать процессы"]
};
const errorLabels: Record<string, [string, string]> = {
  KEY_LIMIT: ["Revoke an active key before creating another.", "Достигнут лимит активных ключей. Отзовите один ключ, чтобы создать новый."],
  INVALID_EXPIRY: ["Choose a future expiry time.", "Укажите срок действия в будущем."],
  INVALID_SCOPES: ["Choose at least one permission.", "Выберите хотя бы одно разрешение."],
  INVALID_NAME: ["Enter a name of 1 to 80 characters.", "Введите название длиной от 1 до 80 символов."],
  UNAUTHORIZED: ["Sign in again to manage keys.", "Войдите снова, чтобы управлять ключами."]
};

function defaultExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const subscribeOrigin = () => () => {};
const browserOrigin = () => window.location.origin;
const serverOrigin = () => "";

export function AgentKeySettings({ initialPage }: { initialPage: AgentKeyPage }) {
  const language = useLanguage();
  const t = (en: string, ru: string) => language === "ru" ? ru : en;
  const origin = useSyncExternalStore(subscribeOrigin, browserOrigin, serverOrigin);
  const [page, setPage] = useState(initialPage);
  const [cursor, setCursor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [scopes, setScopes] = useState<AgentScope[]>(["squads:read"]);
  const [issued, setIssued] = useState<{ id: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (!issued) return;
    const clear = () => setIssued(null);
    window.addEventListener("pagehide", clear);
    return () => window.removeEventListener("pagehide", clear);
  }, [issued]);

  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, { ...options, cache: "no-store", credentials: "same-origin" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.code ?? "REQUEST_FAILED");
    }
    return response;
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setErrorCode(null);
    try {
      await action();
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : "REQUEST_FAILED");
    } finally {
      setPending(false);
    }
  }

  async function loadPage(after: string | null) {
    const url = after ? `${endpoint}?cursor=${encodeURIComponent(after)}` : endpoint;
    const response = await request(url);
    setPage(await response.json() as AgentKeyPage);
    setCursor(after);
    setConfirmId(null);
  }

  function startCreating() {
    setName("");
    setScopes(["squads:read"]);
    setExpiry(defaultExpiry());
    setIssued(null);
    setErrorCode(null);
    setConfirmId(null);
    setCreating(true);
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const expiresAt = new Date(expiry);
      if (!(expiresAt.getTime() > Date.now())) throw new Error("INVALID_EXPIRY");
      const response = await request(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes, expiresAt: expiresAt.toISOString() })
      });
      const result = await response.json() as { key: AgentKeySummary; secret: string };
      setIssued({ id: result.key.id, secret: result.secret });
      setCopied(false);
      setCreating(false);
      await loadPage(null);
    });
  }

  function revoke(key: AgentKeySummary) {
    void run(async () => {
      await request(`${endpoint}/${encodeURIComponent(key.id)}`, { method: "DELETE" });
      if (issued?.id === key.id) setIssued(null);
      await loadPage(cursor);
    });
  }

  function dateTime(value: string) {
    return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
      .format(new Date(value)) + " UTC";
  }

  const error = errorCode ? errorLabels[errorCode] ?? ["Could not complete the request. Refresh the list to check the result.", "Не удалось завершить запрос. Обновите список, чтобы проверить результат."] as const : null;

  return (
    <section className="mt-6" aria-labelledby="agent-key-heading">
      <h2 id="agent-key-heading" className="mb-2 text-lg font-bold text-ink">{t("Personal agent keys", "Персональные ключи агентов")}</h2>
      <div className="ui-card space-y-4 p-4">
        <div>
          <p className="text-sm font-semibold text-ink">{t("MCP connection URL", "URL подключения MCP")}</p>
          <code className="block select-all break-all text-sm">{origin}/api/mcp</code>
          <p className="mt-1 text-xs text-slate-600">{t("Choose Streamable HTTP and send your key in the Authorization header.", "Выберите Streamable HTTP и передавайте ключ в заголовке Authorization.")}</p>
          <code className="text-xs">{`Authorization: Bearer <${t("your key", "ваш ключ")}>`}</code>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer font-semibold text-sky-700">{t("Connect with the MCP SDK for Node.js", "Подключиться через MCP SDK для Node.js")}</summary>
            <p className="my-2 text-slate-600">{t("Install @modelcontextprotocol/client@2 and set FANTASY_AGENT_KEY in your environment. Run this as an .mjs file.", "Установите @modelcontextprotocol/client@2 и задайте переменную окружения FANTASY_AGENT_KEY. Запустите пример как файл .mjs.")}</p>
            <pre className="overflow-x-auto rounded bg-slate-50 p-2">{[
              'import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";',
              'const client = new Client({ name: "my-scout", version: "1.0.0" });',
              'const headers = { Authorization: "Bearer " + process.env.FANTASY_AGENT_KEY };',
              `await client.connect(new StreamableHTTPClientTransport(new URL("${origin}/api/mcp"), { requestInit: { headers } }));`,
              'console.log((await client.listTools()).tools.map(tool => tool.name));',
              'await client.close();'
            ].join("\n")}</pre>
          </details>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer font-semibold text-sky-700">{t("List available tools with PowerShell", "Получить список инструментов в PowerShell")}</summary>
            <p className="my-2 text-slate-600">{t("Set FANTASY_AGENT_KEY to the issued key in your environment, then run", "Укажите выданный ключ в переменной окружения FANTASY_AGENT_KEY и выполните команду")}</p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2">{`$headers = @{ Authorization = "Bearer $env:FANTASY_AGENT_KEY" }\n(Invoke-RestMethod -Headers $headers -Uri '${origin}/api/v1/agent/tools').tools`}</pre>
          </details>
        </div>

        {issued && <div className="space-y-2 rounded border border-emerald-300 p-3" role="status">
          <label htmlFor="issued-agent-secret" className="block text-sm font-semibold">{t("Save your key now. It is shown once.", "Сохраните ключ сейчас. Он показывается один раз.")}</label>
          <input id="issued-agent-secret" readOnly value={issued.secret} autoComplete="off" spellCheck={false} onFocus={event => event.target.select()} className={`${fieldClass} font-mono`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} onClick={async () => {
              try { await navigator.clipboard.writeText(issued.secret); setCopied(true); }
              catch { (document.getElementById("issued-agent-secret") as HTMLInputElement | null)?.select(); }
            }}>{copied ? t("Copied", "Скопировано") : t("Copy key", "Копировать ключ")}</button>
            <button type="button" className={secondaryButton} onClick={() => setIssued(null)}>{t("Hide key", "Скрыть ключ")}</button>
          </div>
        </div>}

        {creating ? <form onSubmit={create} className="space-y-3 border-y border-slate-200 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">{t("Key name", "Название ключа")}
              <input required maxLength={80} value={name} onChange={event => setName(event.target.value)} className={fieldClass} />
            </label>
            <label className="text-sm font-semibold">{t("Expires at (local time)", "Действует до (местное время)")}
              <input required type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)} className={fieldClass} />
            </label>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">{t("Permissions", "Разрешения")}</legend>
            <div className="grid gap-1 sm:grid-cols-2">{agentScopes.map(scope =>
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={scopes.includes(scope)} onChange={event => setScopes(current =>
                  event.target.checked ? [...current, scope] : current.filter(value => value !== scope)
                )} />{t(...permissionLabels[scope])}
              </label>
            )}</div>
          </fieldset>
          <div className="flex gap-2">
            <button disabled={pending || !name.trim() || !scopes.length} className="ui-button ui-button-primary disabled:opacity-50">{t("Create key", "Создать ключ")}</button>
            <button type="button" disabled={pending} className={secondaryButton} onClick={() => setCreating(false)}>{t("Cancel", "Отмена")}</button>
          </div>
        </form> : <button type="button" disabled={pending} className="ui-button ui-button-primary" onClick={startCreating}>{t("New key", "Новый ключ")}</button>}

        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{t("Your keys", "Ваши ключи")}</h3>
          <button type="button" disabled={pending} onClick={() => void run(() => loadPage(cursor))} className="text-xs font-semibold text-sky-700">{t("Refresh", "Обновить")}</button>
        </div>
        {page.keys.length === 0 && <p className="text-sm text-slate-500">{t("You have no keys yet.", "У вас пока нет ключей.")}</p>}
        <ul className="divide-y divide-slate-200">{page.keys.map(key => <li key={key.id} className="space-y-1 py-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="break-all font-semibold text-ink">{key.name}</span>
            <span className="text-xs text-slate-600">{key.status === "active" ? t("Active", "Активен") : key.status === "revoked" ? t("Revoked", "Отозван") : t("Expired", "Истёк")}</span>
          </div>
          <p className="text-xs text-slate-600">{key.scopes.map(scope => t(...permissionLabels[scope])).join(", ")}</p>
          <p className="text-xs text-slate-600">{t("Expires", "Действует до")} {dateTime(key.expiresAt)} · {t("Last used", "Последнее использование")} — {key.lastUsedAt ? dateTime(key.lastUsedAt) : t("never", "не использовался")}</p>
          {key.status === "active" && (confirmId === key.id ? <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>{t("Disconnect this key?", "Отозвать этот ключ?")}</span>
            <button disabled={pending} onClick={() => revoke(key)} className="font-semibold text-rose-700">{t("Confirm revocation", "Подтвердить отзыв")}</button>
            <button disabled={pending} onClick={() => setConfirmId(null)}>{t("Cancel", "Отмена")}</button>
          </div> : <button type="button" disabled={pending} onClick={() => setConfirmId(key.id)} className="text-xs font-semibold text-rose-700">{t("Revoke", "Отозвать")}</button>)}
        </li>)}</ul>
        {(cursor || page.nextCursor) && <nav aria-label={t("Key pages", "Страницы ключей")} className="flex gap-2">
          {cursor && <button disabled={pending} className={secondaryButton} onClick={() => void run(() => loadPage(null))}>{t("Newest keys", "Новые ключи")}</button>}
          {page.nextCursor && <button disabled={pending} className={secondaryButton} onClick={() => void run(() => loadPage(page.nextCursor))}>{t("Older keys", "Ранее созданные")}</button>}
        </nav>}
        {error && <p role="alert" className="text-sm text-rose-700">{t(...error)}</p>}
      </div>
    </section>
  );
}
