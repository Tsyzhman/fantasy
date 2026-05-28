"use client";

import { AlertCircle, CheckCircle2, Database, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { I18nText } from "@/components/i18n-text";

type BulkImportButtonProps = {
  leagueId: string;
  seasonId: string;
};

type BulkUploadPayload = {
  summary?: {
    total: number;
    imported: number;
    failed: number;
    playersImported: number;
    teamStatsImported: number;
  };
  results?: BulkUploadResult[];
  error?: {
    message?: string;
  };
};

type BulkUploadResult = {
  filename: string;
  kind: "players" | "teamStats";
  teamName: string | null;
  status: "imported" | "failed";
  rowsCount?: number;
  fixturesCount?: number;
  error?: string;
  warningsCount?: number;
};

export function BulkImportButton({ leagueId, seasonId }: BulkImportButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [payload, setPayload] = useState<BulkUploadPayload | null>(null);

  async function uploadFiles(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []).filter((file) => file.name.toLowerCase().endsWith(".xlsx"));
    if (selectedFiles.length === 0) {
      setPayload({ error: { message: localizedText("Choose one or more .xlsx files.", "Выберите один или несколько файлов .xlsx.") } });
      return;
    }

    const data = new FormData();
    data.append("seasonId", seasonId);
    for (const file of selectedFiles) {
      data.append("files", file);
    }

    setIsUploading(true);
    setPayload(null);
    try {
      const response = await fetch(`/api/baltika/leagues/${leagueId}/bulk-upload`, {
        method: "POST",
        body: data
      });
      const nextPayload = (await response.json()) as BulkUploadPayload;
      if (isRussianLanguage() && nextPayload.error) {
        nextPayload.error.message = localizedText("Bulk upload failed.", "Массовая загрузка не удалась.");
      }
      setPayload(nextPayload);
      router.refresh();
    } catch {
      setPayload({ error: { message: localizedText("Bulk upload failed.", "Массовая загрузка не удалась.") } });
    } finally {
      setIsUploading(false);
    }
  }

  const failed = payload?.results?.filter((result) => result.status === "failed") ?? [];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading || !seasonId}
        className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
        <I18nText en="Bulk upload" ru="Массовый импорт" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        multiple
        className="hidden"
        onChange={(event) => {
          void uploadFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      {payload ? (
        <div className="absolute right-0 z-20 mt-2 w-[min(92vw,28rem)] rounded border border-slate-200 bg-white p-4 text-sm shadow-lg">
          {payload.summary ? (
            <>
              <p className="flex items-center gap-2 font-semibold text-ink">
                {payload.summary.failed > 0 ? (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
                {payload.summary.imported}/{payload.summary.total} <I18nText en="files imported" ru="файлов импортировано" />
              </p>
              <p className="mt-1 text-xs text-slate-500">
                <I18nText
                  en={<>Players: {payload.summary.playersImported}. Team Stats: {payload.summary.teamStatsImported}.</>}
                  ru={<>Игроки: {payload.summary.playersImported}. Статистика команд: {payload.summary.teamStatsImported}.</>}
                />
              </p>
              {failed.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {failed.slice(0, 6).map((result) => (
                    <p key={result.filename} className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      <span className="font-semibold">{result.filename}</span>
                      <span className="block">{localizedApiMessage(result.error, "Import failed.", "Импорт не удался.")}</span>
                    </p>
                  ))}
                  {failed.length > 6 ? (
                    <p className="text-xs text-slate-500">
                      <I18nText en={`And ${failed.length - 6} more failed files.`} ru={`И еще ${failed.length - 6} файлов с ошибкой.`} />
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="flex items-start gap-2 text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{payload.error?.message ?? localizedText("Bulk upload failed.", "Массовая загрузка не удалась.")}</span>
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function localizedText(en: string, ru: string) {
  if (isRussianLanguage()) return ru;
  return en;
}

function localizedApiMessage(value: unknown, fallbackEn: string, fallbackRu: string) {
  if (isRussianLanguage()) return fallbackRu;
  return typeof value === "string" && value.trim() ? value : fallbackEn;
}

function isRussianLanguage() {
  return typeof document !== "undefined" && document.documentElement.dataset.language === "ru";
}
