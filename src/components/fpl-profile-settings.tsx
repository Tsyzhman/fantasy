"use client";

import { useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";

export function FplProfileSettings({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "deleted" | "error">("idle");

  async function save() {
    setPending(true);
    setStatus("idle");
    const response = await fetch("/api/user/external-profiles/fpl", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryId: value })
    });
    const payload = await response.json().catch(() => ({})) as { profile?: { profileUrl?: string; providerUserId?: string }; message?: string };
    setPending(false);
    if (!response.ok || !payload.profile?.profileUrl || !payload.profile.providerUserId) {
      setStatus("error");
      return;
    }
    setValue(payload.profile.providerUserId);
    setSavedValue(payload.profile.providerUserId);
    setStatus("saved");
  }

  async function remove() {
    setPending(true);
    const response = await fetch("/api/user/external-profiles/fpl", { method: "DELETE" });
    setPending(false);
    if (!response.ok) {
      setStatus("error");
      return;
    }
    setValue("");
    setSavedValue("");
    setStatus("deleted");
  }

  return (
    <div className="ui-card p-4">
      <label className="block text-sm font-semibold text-slate-700" htmlFor="fpl-entry-id">
        <I18nText en="FPL entry ID" ru="ID команды FPL" />
      </label>
      <input
        id="fpl-entry-id"
        inputMode="numeric"
        value={value}
        onChange={(event) => { setValue(event.target.value); setStatus("idle"); }}
        placeholder="1234567"
        className="mt-2 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-ink"
      />
      <p className="mt-2 text-xs text-slate-500">
        <I18nText
          en="Only the public FPL entry ID is stored. We never ask for or store an FPL password or session cookie. Import is available only for the latest published gameweek after its deadline."
          ru="Сохраняется только публичный ID команды FPL. Мы не запрашиваем и не сохраняем пароль FPL или cookie сессии. Импорт доступен только для последнего опубликованного тура после дедлайна."
        />
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={pending || !value.trim() || value === savedValue} className="ui-button ui-button-primary disabled:opacity-55">
          <I18nText en="Save" ru="Сохранить" />
        </button>
        {savedValue ? (
          <button type="button" onClick={remove} disabled={pending} className="rounded border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">
            <I18nText en="Remove" ru="Удалить" />
          </button>
        ) : null}
      </div>
      <FplChipLedger />
      {status !== "idle" ? (
        <p role="status" className={`mt-3 text-sm ${status === "error" ? "text-rose-700" : "text-emerald-700"}`}>
          {status === "saved" ? <I18nText en="FPL entry ID saved." ru="ID команды FPL сохранён." /> : null}
          {status === "deleted" ? <I18nText en="FPL entry ID removed." ru="ID команды FPL удалён." /> : null}
          {status === "error" ? <I18nText en="Could not save this FPL entry ID." ru="Не удалось сохранить ID команды FPL." /> : null}
        </p>
      ) : null}
    </div>
  );
}

function FplChipLedger() {
  const [gameweek, setGameweek] = useState("1");
  const [chip, setChip] = useState("WILDCARD");
  const [usages, setUsages] = useState<Array<{ gameweek: number; code: string; status: string }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function refresh() {
    const response = await fetch("/api/machete/fpl/chips", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { usages?: Array<{ gameweek: number; code: string; status: string }> };
    if (response.ok) setUsages(payload.usages ?? []);
  }

  async function planChip() {
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/machete/fpl/chips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameweek: Number(gameweek), code: chip, status: "PLANNED" })
    });
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
    setPending(false);
    if (!response.ok) {
      setMessage(payload.error?.message ?? "Could not plan this chip.");
      return;
    }
    setMessage("Chip planned.");
    await refresh();
  }

  return (
    <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700"><I18nText en="FPL chip ledger" ru="Чипы FPL" /></p>
        <button type="button" onClick={() => void refresh()} className="text-xs font-semibold text-sky-700 hover:underline"><I18nText en="Refresh" ru="Обновить" /></button>
      </div>
      <p className="mt-1 text-xs text-slate-500"><I18nText en="Plan at most one chip per gameweek; observed public usage is immutable." ru="Планируйте не более одного чипа за тур; наблюдаемое публичное использование нельзя отменить." /></p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={gameweek} onChange={(event) => setGameweek(event.target.value)} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
          {Array.from({ length: 38 }, (_, index) => <option key={index + 1} value={index + 1}>GW{index + 1}</option>)}
        </select>
        <select value={chip} onChange={(event) => setChip(event.target.value)} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
          <LocalizedOption value="WILDCARD" en="Wildcard" ru="Wildcard" />
          <LocalizedOption value="FREE_HIT" en="Free Hit" ru="Free Hit" />
          <LocalizedOption value="TRIPLE_CAPTAIN" en="Triple Captain" ru="Triple Captain" />
          <LocalizedOption value="BENCH_BOOST" en="Bench Boost" ru="Bench Boost" />
        </select>
        <button type="button" onClick={() => void planChip()} disabled={pending} className="rounded-sm bg-brand-600 px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-fg)] disabled:opacity-55"><I18nText en="Plan chip" ru="Запланировать" /></button>
      </div>
      {usages.length > 0 ? <ul className="mt-3 space-y-1 text-xs text-slate-600">{usages.map((usage) => <li key={`${usage.gameweek}-${usage.code}`}>GW{usage.gameweek}: {usage.code} · {usage.status}</li>)}</ul> : null}
      {message ? <p role="status" className="mt-2 text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
