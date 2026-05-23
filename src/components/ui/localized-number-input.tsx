"use client";

import { localizedText, useLanguage } from "@/components/localized-option";
import { cn } from "@/lib/cn";

/**
 * Number input whose placeholder follows the current language toggle.
 * Use whenever we previously had a Russian-only placeholder hard-coded.
 */
export function LocalizedNumberInput({
  name,
  defaultValue,
  min,
  max,
  placeholderEn,
  placeholderRu,
  className
}: {
  name: string;
  defaultValue?: string | number;
  min?: number;
  max?: number;
  placeholderEn: string;
  placeholderRu: string;
  className?: string;
}) {
  const language = useLanguage();
  return (
    <input
      name={name}
      type="number"
      min={min}
      max={max}
      defaultValue={defaultValue}
      placeholder={localizedText(language, placeholderEn, placeholderRu)}
      className={cn("w-full rounded border border-slate-200 px-3 py-2", className)}
    />
  );
}
