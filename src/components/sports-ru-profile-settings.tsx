"use client";

import { useState } from "react";

import { I18nText } from "@/components/i18n-text";

const sportsRuProfilePlaceholder = "https://www.sports.ru/profile/1090024123/";

export function SportsRuProfileSettings({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "deleted" | "error">("idle");

  async function save() {
    setPending(true);
    setStatus("idle");
    const response = await fetch("/api/user/external-profiles/sports-ru", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: value })
    });
    const payload = await response.json().catch(() => ({})) as { profile?: { profileUrl?: string }; message?: string };
    setPending(false);
    if (!response.ok || !payload.profile?.profileUrl) {
      setStatus("error");
      return;
    }
    setValue(payload.profile.profileUrl);
    setSavedValue(payload.profile.profileUrl);
    setStatus("saved");
  }

  async function remove() {
    setPending(true);
    const response = await fetch("/api/user/external-profiles/sports-ru", { method: "DELETE" });
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
      <label className="block text-sm font-semibold text-slate-700" htmlFor="sports-ru-profile">
        <I18nText en="Sports.ru profile ID or URL" ru="ID или ссылка на профиль Sports.ru" />
      </label>
      <input
        id="sports-ru-profile"
        value={value}
        onChange={(event) => { setValue(event.target.value); setStatus("idle"); }}
        placeholder={sportsRuProfilePlaceholder}
        className="mt-2 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-ink"
      />
      <p className="mt-2 text-xs text-slate-500">
        <I18nText
          en="This is a public data source, not a verified account link. We never ask for your Sports.ru password or cookies. Only the latest published fantasy squad can be imported; an open pre-deadline squad is private on Sports.ru."
          ru="Это публичный источник данных, а не подтверждённая привязка аккаунта. Мы никогда не просим пароль или cookies Sports.ru. Импортируется только последний опубликованный состав; состав открытого тура до дедлайна Sports.ru не раскрывает."
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
      {status !== "idle" ? (
        <p role="status" className={`mt-3 text-sm ${status === "error" ? "text-rose-700" : "text-emerald-700"}`}>
          {status === "saved" ? (
            <I18nText
              en="Sports.ru profile saved. The “Sports squad” button in the squad planner will now start an immediate check."
              ru="Профиль Sports.ru сохранён. Теперь кнопка «Состав Sports» в планировщике сразу запустит проверку."
            />
          ) : null}
          {status === "deleted" ? <I18nText en="Sports.ru profile removed." ru="Профиль Sports.ru удалён." /> : null}
          {status === "error" ? <I18nText en="Could not save this profile. Check the ID or URL." ru="Не удалось сохранить профиль. Проверьте ID или ссылку." /> : null}
        </p>
      ) : null}
    </div>
  );
}
