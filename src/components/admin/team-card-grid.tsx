"use client";

import { AlertCircle, CheckCircle2, CloudUpload, FileSpreadsheet, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { formatDate, formatNumber } from "@/lib/format";
import { initials } from "@/lib/text";
import { cn } from "@/lib/cn";
import { StatusBadge } from "@/components/status-badge";

export type TeamCardDto = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  flag?: string | null;
  status: string;
  playersCount: number;
  lastUploadAt: string | null;
  publishedAt: string | null;
  latestImportId: string | null;
  errors: unknown[];
  warnings: unknown[];
};

type UploadState = {
  status: "idle" | "uploading" | "success" | "error" | "publishing";
  message?: string;
};

export function TeamCardGrid({ teams, seasonId, leagueId }: { teams: TeamCardDto[]; seasonId: string; leagueId: string }) {
  if (teams.length === 0) {
    return (
      <div className="rounded border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        No teams yet. Add teams to this league before uploading Wyscout files.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {teams.map((team) => (
        <TeamCard key={team.id} team={team} seasonId={seasonId} leagueId={leagueId} />
      ))}
    </div>
  );
}

function TeamCard({ team, seasonId, leagueId }: { team: TeamCardDto; seasonId: string; leagueId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ status: "idle" });

  const displayStatus = state.status === "uploading" ? "UPLOADING" : state.status === "publishing" ? "PARSING" : team.status;
  const canPublish = team.status === "READY" && team.latestImportId && state.status !== "publishing";

  async function uploadFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setState({ status: "error", message: "Only .xlsx files are supported." });
      return;
    }

    const data = new FormData();
    data.append("file", file);
    data.append("seasonId", seasonId);

    setState({ status: "uploading", message: "Uploading and parsing file..." });
    const response = await fetch(`/api/admin/teams/${team.id}/upload`, {
      method: "POST",
      body: data
    });
    const payload = await response.json();

    if (!response.ok) {
      const message =
        payload?.errors?.[0]?.message ?? payload?.error?.message ?? "Import failed. Check the file format and team name.";
      setState({ status: "error", message });
      router.refresh();
      return;
    }

    setState({ status: "success", message: `Imported ${payload.rowsCount ?? 0} players. Ready to publish.` });
    router.refresh();
  }

  async function publishImport() {
    if (!team.latestImportId) return;
    setState({ status: "publishing", message: "Publishing current import..." });
    const response = await fetch(`/api/admin/imports/${team.latestImportId}/publish`, { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      setState({ status: "error", message: payload?.error?.message ?? "Publish failed." });
      return;
    }

    setState({ status: "success", message: "Published for players explorer." });
    router.refresh();
  }

  return (
    <article className="flex min-h-[340px] flex-col rounded border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TeamLogo logoUrl={team.logoUrl} name={team.name} flag={team.flag ?? null} />

          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{team.name}</h2>
            <p className="text-xs text-slate-500">{formatNumber(team.playersCount)} players</p>
          </div>
        </div>
        <StatusBadge status={displayStatus} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">Last upload</dt>
          <dd className="mt-1 text-slate-700">{formatDate(team.lastUploadAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400">Published</dt>
          <dd className="mt-1 text-slate-700">{formatDate(team.publishedAt)}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void uploadFile(event.dataTransfer.files[0]);
        }}
        className={cn(
          "mt-4 flex flex-1 flex-col items-center justify-center rounded border border-dashed px-4 py-7 text-center transition",
          isDragging ? "border-ink bg-slate-100" : "border-slate-300 bg-field hover:border-slate-400"
        )}
      >
        {state.status === "uploading" || state.status === "publishing" ? (
          <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
        ) : (
          <CloudUpload className="h-7 w-7 text-slate-500" />
        )}
        <span className="mt-3 text-sm font-semibold text-slate-800">Drop Wyscout .xlsx here</span>
        <span className="mt-1 text-xs text-slate-500">or click to choose a file</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(event) => {
          void uploadFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {canPublish ? (
        <button
          type="button"
          onClick={() => void publishImport()}
          className="mt-3 inline-flex items-center justify-center gap-2 rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          <Send className="h-4 w-4" />
          Publish import
        </button>
      ) : null}

      <Link
        href={`/baltika/leagues/${leagueId}/teams/${team.id}`}
        className="mt-3 inline-flex items-center justify-center rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Open team
      </Link>

      {state.message ? (
        <p
          className={cn(
            "mt-3 flex items-start gap-2 rounded px-3 py-2 text-xs",
            state.status === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
          )}
        >
          {state.status === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{state.message}</span>
        </p>
      ) : null}

      {team.status === "ERROR" && team.errors.length > 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage(team.errors[0])}</span>
        </p>
      ) : null}
    </article>
  );
}

function TeamLogo({ logoUrl, name, flag }: { logoUrl: string | null; name: string; flag: string | null }) {
  const [failed, setFailed] = useState(false);

  if (flag) {
    return (
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded bg-slate-900 text-2xl leading-none">
        {flag}
      </div>
    );
  }

  const showImage = Boolean(logoUrl) && !failed;
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded bg-slate-900 text-sm font-bold text-white">
      {showImage ? (
        <img
          src={logoUrl as string}
          alt=""
          className="h-full w-full rounded object-contain p-1"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

function errorMessage(value: unknown) {
  if (typeof value === "object" && value && "message" in value) {
    return String((value as { message: unknown }).message);
  }
  return "The last import failed validation.";
}
