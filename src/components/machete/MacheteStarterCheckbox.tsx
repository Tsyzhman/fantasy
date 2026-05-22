"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type MacheteStarterCheckboxProps = {
  leagueId: string;
  season: string;
  teamId: string;
  playerId: string;
  defaultChecked: boolean;
  label?: string;
};

export function MacheteStarterCheckbox({
  leagueId,
  season,
  teamId,
  playerId,
  defaultChecked,
  label = "В старте"
}: MacheteStarterCheckboxProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(defaultChecked);
  const [isPending, startTransition] = useTransition();

  function updateStarter(nextChecked: boolean) {
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
        return;
      }

      router.refresh();
    });
  }

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={isPending}
      aria-label={label}
      onChange={(event) => updateStarter(event.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-ink disabled:cursor-wait disabled:opacity-60"
    />
  );
}
