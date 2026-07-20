"use client";

import { Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";

type ImportPreview = {
  providerSquadId: string;
  squadName: string;
  tournamentName: string;
  tourId: string;
  tourName: string;
  playersCount: number;
  unmapped: Array<{ providerPlayerId: string; name: string; teamName: string | null }>;
};

export function SportsRuSquadImport({ leagueId, season, squadId }: { leagueId: string; season: string; squadId: string | null }) {
  const language = useLanguage();
  const router = useRouter();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function requestImport(apply: boolean) {
    setPending(true);
    setErrorCode(null);
    setErrorMessage(null);
    const response = await fetch("/api/machete/squads/import-sports-ru", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leagueId, season, squadId, apply })
    });
    const payload = await response.json().catch(() => ({})) as {
      code?: string;
      message?: string;
      error?: { code?: string; message?: string };
      preview?: ImportPreview;
      squad?: { id?: string };
    };
    setPending(false);
    if (!response.ok) {
      setPreview(payload.preview ?? null);
      setErrorCode(payload.code ?? payload.error?.code ?? "IMPORT_FAILED");
      setErrorMessage(payload.message ?? payload.error?.message ?? null);
      return;
    }
    if (!apply) {
      setPreview(payload.preview ?? null);
      return;
    }
    const url = new URL(window.location.href);
    if (payload.squad?.id) url.searchParams.set("squadId", payload.squad.id);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`);
    router.refresh();
  }

  return (
    <div className="mt-3 rounded border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink"><I18nText en="Sports.ru squad" ru="Состав Sports.ru" /></p>
          <p className="text-xs text-slate-500">
            <I18nText en="Import the latest published tour; open pre-deadline squads are not public." ru="Импорт последнего опубликованного тура; открытый состав до дедлайна не является публичным." />
          </p>
        </div>
        <button type="button" onClick={() => requestImport(false)} disabled={pending} className="inline-flex items-center gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden="true" />
          {pending ? <I18nText en="Checking…" ru="Проверяем…" /> : <I18nText en="Pull from Sports.ru" ru="Подтянуть со Sports.ru" />}
        </button>
      </div>
      {preview && preview.unmapped.length === 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          <span>{preview.squadName} · {preview.tourName} · {preview.playersCount}/15</span>
          <button type="button" onClick={() => requestImport(true)} disabled={pending} className="rounded bg-emerald-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
            <I18nText en="Import into current squad" ru="Импортировать в текущий состав" />
          </button>
        </div>
      ) : null}
      {errorCode ? (
        <div role="alert" className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <p>{localizedImportError(language, errorCode, errorMessage)}</p>
          {errorCode === "SPORTS_PROFILE_REQUIRED" ? (
            <Link href="/profile" className="mt-2 inline-flex items-center gap-1 font-semibold underline">
              <I18nText en="Open profile settings" ru="Открыть настройки профиля" />
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : null}
          {preview?.unmapped.length ? (
            <p className="mt-1 text-xs">{preview.unmapped.map((player) => `${player.name}${player.teamName ? ` (${player.teamName})` : ""}`).join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function localizedImportError(language: "en" | "ru", code: string, fallback: string | null) {
  if (code === "SPORTS_PROFILE_REQUIRED") return localizedText(language, "Save your public Sports.ru profile ID first.", "Сначала сохраните публичный ID профиля Sports.ru.");
  if (code === "NO_PUBLISHED_SQUAD") return localizedText(language, "No published squad exists for this tournament yet. Sports.ru hides the open tour before its deadline.", "Для этого турнира пока нет опубликованного состава. Sports.ru скрывает открытый тур до дедлайна.");
  if (code === "SPORTS_PLAYERS_UNMAPPED") return localizedText(language, "Some Sports.ru players are not mapped. Nothing was imported.", "Часть игроков Sports.ru не сопоставлена. Состав не изменён.");
  return fallback ?? localizedText(language, "Sports.ru import failed.", "Не удалось импортировать состав Sports.ru.");
}
