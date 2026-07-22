"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { localizedText, useLanguage } from "@/components/localized-option";

type MacheteStarterCheckboxProps = {
  leagueId: string;
  season: string;
  teamId: string;
  playerId: string;
  defaultChecked: boolean;
  label?: string;
  disabledReasonEn?: string;
  disabledReasonRu?: string;
};

export function MacheteStarterCheckbox({
  leagueId,
  season,
  teamId,
  playerId,
  defaultChecked,
  label = "В старте",
  disabledReasonEn,
  disabledReasonRu
}: MacheteStarterCheckboxProps) {
  const language = useLanguage();
  const router = useRouter();
  const [checked, setChecked] = useState(defaultChecked);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateStarter(nextChecked: boolean) {
    setError(null);
    setChecked(nextChecked);

    startTransition(async () => {
      const response = await fetch("/api/machete/team-player-seasons/starter", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          leagueId,
          season,
          teamId,
          playerId,
          isStarter: nextChecked
        })
      });

      if (!response.ok) {
        setChecked(!nextChecked);
        setError(
          response.status === 409
            ? localizedText(language, "Starting XI limit: 10 outfield players and 1 goalkeeper.", "Лимит старта: 10 полевых игроков и 1 вратарь.")
            : localizedText(language, "Could not update the starting XI.", "Не удалось изменить стартовый состав.")
        );
        return;
      }

      router.refresh();
    });
  }

  const disabledReason = disabledReasonEn && disabledReasonRu
    ? localizedText(language, disabledReasonEn, disabledReasonRu)
    : null;

  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={isPending || Boolean(disabledReason)}
        aria-label={label}
        title={disabledReason ?? undefined}
        onChange={(event) => updateStarter(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-ink disabled:cursor-not-allowed disabled:opacity-50"
      />
      {error ? <span className="max-w-48 whitespace-normal text-xs text-rose-700" role="alert">{error}</span> : null}
    </span>
  );
}
