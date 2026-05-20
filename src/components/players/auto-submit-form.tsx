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
      if (stringValue) params.append(key, stringValue);
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
          clearNamedControls(form, "teamId");
          clearNamedControls(form, "competitionKey");
          clearNamedControls(form, "attackingTeamId");
          clearNamedControls(form, "defendingTeamId");
          clearNamedControls(form, "attackingCompetitionKey");
          clearNamedControls(form, "defendingCompetitionKey");
          clearNamedControls(form, "playerId");
        }

        if (target instanceof HTMLSelectElement && target.name === "teamId") {
          clearNamedControls(form, "competitionKey");
        }

        if (target instanceof HTMLSelectElement && target.name === "attackingTeamId") {
          clearNamedControls(form, "attackingCompetitionKey");
          clearNamedControls(form, "playerId");
        }

        if (target instanceof HTMLSelectElement && target.name === "defendingTeamId") {
          clearNamedControls(form, "defendingCompetitionKey");
        }

        if (isNamedControlChange(target, "attackingCompetitionKey")) {
          clearNamedControls(form, "playerId");
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

function clearNamedControls(form: HTMLFormElement, name: string) {
  const controls = form.elements.namedItem(name);
  if (!controls) return;

  if (controls instanceof RadioNodeList) {
    for (const control of Array.from(controls)) {
      clearControl(control);
    }
    return;
  }

  clearControl(controls);
}

function clearControl(control: Element | RadioNodeList) {
  if (control instanceof HTMLInputElement) {
    if (control.type === "checkbox" || control.type === "radio") {
      control.checked = false;
      return;
    }

    control.value = "";
    return;
  }

  if (control instanceof HTMLSelectElement) {
    for (const option of Array.from(control.options)) {
      option.selected = false;
    }
    control.value = "";
  }
}

function isNamedControlChange(target: EventTarget, name: string) {
  return (
    (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) &&
    target.name === name
  );
}
