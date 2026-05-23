"use client";

import type { ReactNode } from "react";

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
      className={cn(
        "inline-flex rounded-md border border-slate-200 bg-white p-0.5 shadow-elev",
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
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center rounded font-semibold transition",
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
