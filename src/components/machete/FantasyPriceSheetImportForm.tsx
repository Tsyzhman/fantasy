"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

type FantasyPriceSheetImportFormProps = {
  leagueId: string;
  season: string;
  canImport: boolean;
};

export function FantasyPriceSheetImportForm({ leagueId, season, canImport }: FantasyPriceSheetImportFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canImport) return null;

  function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("leagueId", leagueId);
    formData.set("season", season);
    formData.set("replace", formData.get("replace") ? "true" : "false");

    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/machete/fantasy-prices/import-sheet", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload?.error?.message ?? "Failed to import prices.");
        return;
      }

      const result = payload.import;
      setMessage(`Imported ${result.imported} rows. Mapped ${result.mapped}, manual ${result.manual}, unmatched ${result.unmatched}.`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submitImport} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-600">Sports.ru XLSX prices</span>
        <input
          required
          name="file"
          type="file"
          accept=".xlsx,.xls"
          className="block w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700"
        />
      </label>
      <div className="flex flex-col justify-end gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input name="replace" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
          Replace old rows
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {isPending ? "Importing" : "Import prices"}
        </button>
      </div>
      {message ? <div className="md:col-span-2 rounded bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
    </form>
  );
}
