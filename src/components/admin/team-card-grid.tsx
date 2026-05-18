"use client";

import { AlertCircle, CalendarDays, CheckCircle2, CloudUpload, FileSpreadsheet, Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { formatDate, formatNumber } from "@/lib/format";
import { initials } from "@/lib/text";
import { cn } from "@/lib/cn";
import { I18nText } from "@/components/i18n-text";
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
  playersPublishedAt: string | null;
  latestImportId: string | null;
  fixturesCount: number;
  teamStatsPublishedAt: string | null;
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
        <I18nText en="No teams yet. Add teams to this league before uploading Wyscout files." ru="Команд пока нет. Добавьте команды в лигу перед загрузкой файлов Wyscout." />
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
  const teamStatsInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isTeamStatsDragging, setIsTeamStatsDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [teamStatsState, setTeamStatsState] = useState<UploadState>({ status: "idle" });

  const displayStatus = state.status === "uploading" ? "UPLOADING" : state.status === "publishing" ? "PARSING" : team.status;
  const canPublish = team.status === "READY" && team.latestImportId && state.status !== "publishing";

  async function uploadFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setState({ status: "error", message: localizedText("Only .xlsx files are supported.", "Поддерживаются только .xlsx файлы.") });
      return;
    }

    const data = new FormData();
    data.append("file", file);
    data.append("seasonId", seasonId);

    setState({ status: "uploading", message: localizedText("Uploading and parsing file...", "Загружаю и разбираю файл...") });
    const response = await fetch(`/api/admin/teams/${team.id}/upload`, {
      method: "POST",
      body: data
    });
    const payload = await response.json();

    if (!response.ok) {
      const message =
        payload?.errors?.[0]?.message ?? payload?.error?.message ?? localizedText("Import failed. Check the file format and team name.", "Импорт не удался. Проверьте формат файла и название команды.");
      setState({ status: "error", message });
      router.refresh();
      return;
    }

    setState({ status: "success", message: localizedText(`Imported ${payload.rowsCount ?? 0} players. Ready to publish.`, `Импортировано игроков: ${payload.rowsCount ?? 0}. Можно публиковать.`) });
    router.refresh();
  }

  async function uploadTeamStatsFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setTeamStatsState({ status: "error", message: localizedText("Only .xlsx files are supported.", "Поддерживаются только .xlsx файлы.") });
      return;
    }

    const data = new FormData();
    data.append("file", file);
    data.append("seasonId", seasonId);

    setTeamStatsState({ status: "uploading", message: localizedText("Importing matches...", "Импортирую матчи...") });
    const response = await fetch(`/api/baltika/teams/${team.id}/team-stats/upload`, {
      method: "POST",
      body: data
    });
    const payload = await response.json();

    if (!response.ok) {
      const message =
        payload?.errors?.[0]?.message ?? payload?.error?.message ?? localizedText("Team stats import failed. Check the Team Stats file.", "Импорт Team Stats не удался. Проверьте файл.");
      setTeamStatsState({ status: "error", message });
      router.refresh();
      return;
    }

    setTeamStatsState({ status: "success", message: localizedText(`Imported ${payload.fixturesCount ?? 0} matches.`, `Импортировано матчей: ${payload.fixturesCount ?? 0}.`) });
    router.refresh();
  }

  async function publishImport() {
    if (!team.latestImportId) return;
    setState({ status: "publishing", message: localizedText("Publishing current import...", "Публикую текущий импорт...") });
    const response = await fetch(`/api/admin/imports/${team.latestImportId}/publish`, { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      setState({ status: "error", message: payload?.error?.message ?? localizedText("Publish failed.", "Публикация не удалась.") });
      return;
    }

    setState({ status: "success", message: localizedText("Published for players explorer.", "Опубликовано для таблицы игроков.") });
    router.refresh();
  }

  return (
    <article className="flex min-h-[340px] flex-col rounded border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TeamLogo logoUrl={team.logoUrl} name={team.name} flag={team.flag ?? null} />

          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink">{team.name}</h2>
            <p className="text-xs text-slate-500">
              {formatNumber(team.playersCount)} <I18nText en="players" ru="игроков" />
            </p>
          </div>
        </div>
        <StatusBadge status={displayStatus} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400"><I18nText en="Last upload" ru="Последняя загрузка" /></dt>
          <dd className="mt-1 text-slate-700">{formatDate(team.lastUploadAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400"><I18nText en="Players published" ru="Игроки опубликованы" /></dt>
          <dd className="mt-1 text-slate-700">{formatDate(team.playersPublishedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400"><I18nText en="Matches" ru="Матчи" /></dt>
          <dd className="mt-1 text-slate-700">{formatNumber(team.fixturesCount)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-400"><I18nText en="xG/xGA published" ru="xG/xGA опубликованы" /></dt>
          <dd className="mt-1 text-slate-700">{formatDate(team.teamStatsPublishedAt)}</dd>
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
        <span className="mt-3 text-sm font-semibold text-slate-800"><I18nText en="Drop Wyscout .xlsx here" ru="Перетащите Wyscout .xlsx сюда" /></span>
        <span className="mt-1 text-xs text-slate-500"><I18nText en="or click to choose a file" ru="или нажмите, чтобы выбрать файл" /></span>
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

      <button
        type="button"
        onClick={() => teamStatsInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsTeamStatsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsTeamStatsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsTeamStatsDragging(false);
          void uploadTeamStatsFile(event.dataTransfer.files[0]);
        }}
        className={cn(
          "mt-3 flex items-center justify-center gap-2 rounded border border-dashed px-3 py-2 text-sm font-semibold transition",
          isTeamStatsDragging ? "border-ink bg-slate-100 text-ink" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        )}
      >
        {teamStatsState.status === "uploading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarDays className="h-4 w-4" />
        )}
        <I18nText en="Upload Team Stats" ru="Загрузить Team Stats" />
      </button>
      <input
        ref={teamStatsInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(event) => {
          void uploadTeamStatsFile(event.target.files?.[0]);
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
          <I18nText en="Publish import" ru="Опубликовать импорт" />
        </button>
      ) : null}

      <Link
        href={`/baltika/leagues/${leagueId}/teams/${team.id}`}
        className="mt-3 inline-flex items-center justify-center rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <I18nText en="Open team" ru="Открыть команду" />
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

      {teamStatsState.message ? (
        <p
          className={cn(
            "mt-3 flex items-start gap-2 rounded px-3 py-2 text-xs",
            teamStatsState.status === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
          )}
        >
          {teamStatsState.status === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{teamStatsState.message}</span>
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
      <div className="team-logo-frame grid h-12 w-12 shrink-0 place-items-center text-2xl leading-none">
        {flag}
      </div>
    );
  }

  const showImage = Boolean(logoUrl) && !failed;
  return (
    <div className="team-logo-frame grid h-12 w-12 shrink-0 place-items-center text-sm font-bold text-ink">
      {showImage ? (
        <img
          src={logoUrl as string}
          alt=""
          className="team-logo-image h-10 w-10 object-contain"
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
  return localizedText("The last import failed validation.", "Последний импорт не прошел проверку.");
}

function localizedText(en: string, ru: string) {
  if (typeof document !== "undefined" && document.documentElement.dataset.language === "ru") return ru;
  return en;
}
