"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormHTMLAttributes, useRef, useTransition } from "react";

type AutoSubmitFormProps = FormHTMLAttributes<HTMLFormElement>;

export function AutoSubmitForm({ children, onChange, onSubmit, ...props }: AutoSubmitFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateUrl(form: HTMLFormElement) {
    const params = new URLSearchParams();
    const formData = new FormData(form);

    for (const [key, value] of formData.entries()) {
      const stringValue = String(value).trim();
      if (stringValue) params.set(key, stringValue);
    }

    const query = params.toString();
    if (query === searchParams.toString()) return;

    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    <form
      {...props}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(event);
        updateUrl(event.currentTarget);
      }}
      onChange={(event) => {
        onChange?.(event);
        const form = event.currentTarget;
        const target = event.target;

        if (target instanceof HTMLSelectElement && target.name === "leagueId") {
          const teamSelect = form.elements.namedItem("teamId");
          if (teamSelect instanceof HTMLSelectElement) teamSelect.value = "";

          const competitionSelect = form.elements.namedItem("competitionKey");
          if (competitionSelect instanceof HTMLSelectElement) competitionSelect.value = "";

          const attackingTeamSelect = form.elements.namedItem("attackingTeamId");
          if (attackingTeamSelect instanceof HTMLSelectElement) attackingTeamSelect.value = "";

          const defendingTeamSelect = form.elements.namedItem("defendingTeamId");
          if (defendingTeamSelect instanceof HTMLSelectElement) defendingTeamSelect.value = "";

          const attackingCompetitionSelect = form.elements.namedItem("attackingCompetitionKey");
          if (attackingCompetitionSelect instanceof HTMLSelectElement) attackingCompetitionSelect.value = "";

          const defendingCompetitionSelect = form.elements.namedItem("defendingCompetitionKey");
          if (defendingCompetitionSelect instanceof HTMLSelectElement) defendingCompetitionSelect.value = "";

          const playerSelect = form.elements.namedItem("playerId");
          if (playerSelect instanceof HTMLSelectElement) playerSelect.value = "";
        }

        if (target instanceof HTMLSelectElement && target.name === "teamId") {
          const competitionSelect = form.elements.namedItem("competitionKey");
          if (competitionSelect instanceof HTMLSelectElement) competitionSelect.value = "";
        }

        if (target instanceof HTMLSelectElement && target.name === "attackingTeamId") {
          const attackingCompetitionSelect = form.elements.namedItem("attackingCompetitionKey");
          if (attackingCompetitionSelect instanceof HTMLSelectElement) attackingCompetitionSelect.value = "";

          const playerSelect = form.elements.namedItem("playerId");
          if (playerSelect instanceof HTMLSelectElement) playerSelect.value = "";
        }

        if (target instanceof HTMLSelectElement && target.name === "defendingTeamId") {
          const defendingCompetitionSelect = form.elements.namedItem("defendingCompetitionKey");
          if (defendingCompetitionSelect instanceof HTMLSelectElement) defendingCompetitionSelect.value = "";
        }

        if (target instanceof HTMLSelectElement && target.name === "attackingCompetitionKey") {
          const playerSelect = form.elements.namedItem("playerId");
          if (playerSelect instanceof HTMLSelectElement) playerSelect.value = "";
        }

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        const delay = target instanceof HTMLInputElement && target.type !== "checkbox" ? 600 : 150;
        timeoutRef.current = setTimeout(() => {
          updateUrl(form);
        }, delay);
      }}
    >
      {children}
    </form>
  );
}
