"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type StarterCheckboxProps = {
  snapshotId: string;
  defaultChecked: boolean;
  label?: string;
};

export function StarterCheckbox({ snapshotId, defaultChecked, label = "В старте" }: StarterCheckboxProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(defaultChecked);
  const [isPending, startTransition] = useTransition();

  function updateStarter(nextChecked: boolean) {
    setChecked(nextChecked);

    startTransition(async () => {
      const response = await fetch(`/api/players/${snapshotId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ isStarter: nextChecked })
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
