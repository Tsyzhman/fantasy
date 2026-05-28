"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { localizedText, useLanguage } from "@/components/localized-option";

type StarterCheckboxProps = {
  snapshotId: string;
  defaultChecked: boolean;
  label?: string;
  labelEn?: string;
  labelRu?: string;
};

export function StarterCheckbox({ snapshotId, defaultChecked, label, labelEn = "Starter", labelRu = "В старте" }: StarterCheckboxProps) {
  const language = useLanguage();
  const router = useRouter();
  const [checked, setChecked] = useState(defaultChecked);
  const [isPending, startTransition] = useTransition();
  const accessibleLabel = label ?? localizedText(language, labelEn, labelRu);

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
      aria-label={accessibleLabel}
      onChange={(event) => updateStarter(event.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-ink disabled:cursor-wait disabled:opacity-60"
    />
  );
}
