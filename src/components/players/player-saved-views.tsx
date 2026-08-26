"use client";

import { Bookmark, Check, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { cn } from "@/lib/cn";

type SavedViewSource = "machete" | "baltika";

type PlayerSavedViewsProps = {
  source: SavedViewSource;
  className?: string;
};

type SavedView = {
  id: string;
  name: string;
  href: string;
  createdAt: string;
  updatedAt?: string;
};

const maxSavedViews = 8;

export function PlayerSavedViews({ source, className }: PlayerSavedViewsProps) {
  const language = useLanguage();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storageKey = `fantasy-player-saved-views:${source}`;
  const currentHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }, [pathname, searchParams]);
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [accountBacked, setAccountBacked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      const localViews = readSavedViews(storageKey);
      setViews(localViews);
      setAccountBacked(false);
      void loadAccountViews(localViews);
    }, 0);

    async function loadAccountViews(localViews: SavedView[]) {
      const accountViews = await fetchAccountSavedViews(source);
      if (!accountViews || cancelled) return;

      setAccountBacked(true);
      let nextViews = accountViews;
      const localViewsByHref = new Map<string, SavedView>();
      for (const localView of [...localViews, ...readSavedViews(storageKey)]) {
        localViewsByHref.set(localView.href, localView);
      }
      for (const localView of localViewsByHref.values()) {
        if (nextViews.some((view) => view.href === localView.href)) continue;
        const migratedViews = await saveAccountSavedView(source, localView.name, localView.href, filtersFromHref(localView.href));
        if (cancelled) return;
        if (migratedViews) nextViews = migratedViews;
      }

      persistLocalSavedViews(storageKey, nextViews);
      setViews(nextViews);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [source, storageKey]);

  function persist(nextViews: SavedView[]) {
    persistLocalSavedViews(storageKey, nextViews);
    setViews(nextViews);
  }

  async function saveCurrentView() {
    const safeName =
      name.trim() ||
      localizedText(
        language,
        source === "machete" ? "Machete view" : "Baltika view",
        source === "machete" ? "Вид Machete" : "Вид Балтики"
      );

    if (accountBacked) {
      const accountViews = await saveAccountSavedView(source, safeName, currentHref, filtersFromHref(currentHref));
      if (accountViews) {
        persist(accountViews);
        setName("");
        setSavedId(accountViews.find((view) => view.href === currentHref)?.id ?? null);
        window.setTimeout(() => setSavedId(null), 1200);
        return;
      }
      setAccountBacked(false);
    }

    const existing = views.find((view) => view.href === currentHref);
    const nextView: SavedView = {
      id: existing?.id ?? `${Date.now()}`,
      name: safeName,
      href: currentHref,
      createdAt: existing?.createdAt ?? new Date().toISOString()
    };
    const nextViews = [nextView, ...views.filter((view) => view.id !== nextView.id && view.href !== nextView.href)].slice(0, maxSavedViews);
    persist(nextViews);
    setName("");
    setSavedId(nextView.id);
    window.setTimeout(() => setSavedId(null), 1200);
  }

  async function removeView(id: string) {
    if (accountBacked) {
      const accountViews = await deleteAccountSavedView(source, id);
      if (accountViews) {
        persist(accountViews);
        return;
      }
      setAccountBacked(false);
    }

    persist(views.filter((view) => view.id !== id));
  }

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={localizedText(language, "Open saved views", "Открыть сохраненные виды")}
        className="inline-flex items-center justify-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Bookmark className="h-4 w-4" />
        <span>
          <I18nText en="Views" ru="Виды" />
        </span>
        {views.length > 0 ? <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{views.length}</span> : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(92vw,22rem)] rounded border border-slate-200 bg-white p-3 text-sm shadow-xl">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={localizedText(language, "View name", "Название вида")}
              aria-label={localizedText(language, "Saved view name", "Название сохраненного вида")}
              className="min-w-0 flex-1 rounded border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={saveCurrentView}
              className="ui-button ui-button-primary"
            >
              {savedId ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              <I18nText en="Save" ru="Сохранить" />
            </button>
          </div>

          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {views.map((view) => (
              <div key={view.id} className="flex items-center gap-2 rounded border border-slate-100 px-2 py-1.5">
                <Link href={view.href} onClick={() => setOpen(false)} className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{view.name}</span>
                  <span className="block truncate text-xs text-slate-500">{compactHref(view.href)}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => removeView(view.id)}
                  aria-label={localizedText(language, "Delete saved view", "Удалить сохраненный вид")}
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {views.length === 0 ? (
              <p className="rounded bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">
                <I18nText en="No saved views yet." ru="Сохраненных видов пока нет." />
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function readSavedViews(storageKey: string) {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedView).slice(0, maxSavedViews);
  } catch {
    return [];
  }
}

function persistLocalSavedViews(storageKey: string, views: SavedView[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(views.slice(0, maxSavedViews)));
}

async function fetchAccountSavedViews(source: SavedViewSource) {
  try {
    const response = await fetch(`/api/user/saved-views?source=${source}`, { cache: "no-store" });
    if (!response.ok) return null;
    return savedViewsFromPayload(await response.json());
  } catch {
    return null;
  }
}

async function saveAccountSavedView(source: SavedViewSource, name: string, href: string, filters: Record<string, string | string[]> | null) {
  try {
    const response = await fetch("/api/user/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, name, href, filters })
    });
    if (!response.ok) return null;
    return savedViewsFromPayload(await response.json());
  } catch {
    return null;
  }
}

async function deleteAccountSavedView(source: SavedViewSource, id: string) {
  try {
    const params = new URLSearchParams({ source, id });
    const response = await fetch(`/api/user/saved-views?${params.toString()}`, { method: "DELETE" });
    if (!response.ok) return null;
    return savedViewsFromPayload(await response.json());
  } catch {
    return null;
  }
}

function savedViewsFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const views = (payload as { views?: unknown }).views;
  if (!Array.isArray(views)) return null;
  return views.filter(isSavedView).slice(0, maxSavedViews);
}

function isSavedView(value: unknown): value is SavedView {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.name === "string" && typeof record.href === "string" && typeof record.createdAt === "string";
}

function filtersFromHref(href: string) {
  const queryIndex = href.indexOf("?");
  if (queryIndex === -1) return null;

  const filters: Record<string, string | string[]> = {};
  const params = new URLSearchParams(href.slice(queryIndex + 1));
  params.forEach((value, key) => {
    const current = filters[key];
    if (Array.isArray(current)) {
      current.push(value);
    } else if (typeof current === "string") {
      filters[key] = [current, value];
    } else {
      filters[key] = value;
    }
  });

  return Object.keys(filters).length > 0 ? filters : null;
}

function compactHref(href: string) {
  return href.replace(/^\/(?:machete|baltika)\/players\??/, "");
}
