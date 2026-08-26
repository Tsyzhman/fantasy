"use client";

import type { KeyboardEvent, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
};

export function SegmentedControl<T extends string>({
  name,
  value,
  onChange,
  options,
  className,
  size = "md"
}: {
  name?: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      aria-orientation="horizontal"
      className={cn(
        "inline-flex rounded-sm border border-slate-200 bg-white p-0.5",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              const currentIndex = options.findIndex((item) => item.value === option.value);
              const nextIndex = segmentedControlIndexForKey(event.key, currentIndex, options.length);
              if (nextIndex === null) return;

              event.preventDefault();
              onChange(options[nextIndex].value);
              focusSegmentedOption(event, nextIndex);
            }}
            className={cn(
              "inline-flex items-center justify-center rounded-sm font-semibold transition [@media(pointer:coarse)]:min-h-11",
              size === "sm"
                ? "px-2 py-1 text-xs [@media(pointer:coarse)]:py-2 [@media(pointer:coarse)]:text-sm"
                : "px-3 py-1.5 text-sm [@media(pointer:coarse)]:py-2",
              active ? "bg-brand-600 text-[color:var(--brand-fg)] shadow-sm" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function segmentedControlIndexForKey(key: string, currentIndex: number, optionCount: number) {
  if (optionCount <= 0 || currentIndex < 0 || currentIndex >= optionCount) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (currentIndex + 1) % optionCount;
  if (key === "ArrowLeft" || key === "ArrowUp") return (currentIndex - 1 + optionCount) % optionCount;
  if (key === "Home") return 0;
  if (key === "End") return optionCount - 1;
  return null;
}

function focusSegmentedOption(event: KeyboardEvent<HTMLButtonElement>, optionIndex: number) {
  const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role='radio']");
  radios?.[optionIndex]?.focus();
}
