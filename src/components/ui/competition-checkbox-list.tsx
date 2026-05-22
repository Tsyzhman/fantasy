import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type CompetitionCheckboxOption = {
  key: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

export function CompetitionCheckboxList({
  name,
  options,
  selectedKeys,
  emptyLabel,
  className
}: {
  name: string;
  options: CompetitionCheckboxOption[];
  selectedKeys: string[];
  emptyLabel: ReactNode;
  className?: string;
}) {
  const selected = new Set(selectedKeys);

  if (options.length === 0) {
    return (
      <div className={cn("rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500", className)}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={cn("max-h-44 overflow-auto rounded border border-slate-200 bg-white p-2", className)}>
      <div className="grid grid-cols-1 gap-2">
        {options.map((option) => (
          <label
            key={option.key}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded px-2 py-2 text-sm hover:bg-slate-50",
              option.disabled ? "cursor-not-allowed opacity-50" : ""
            )}
          >
            <input
              type="checkbox"
              name={name}
              value={option.key}
              defaultChecked={selected.has(option.key)}
              disabled={option.disabled}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-700">{option.label}</span>
              {option.description ? <span className="mt-0.5 block truncate text-xs text-slate-500">{option.description}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
