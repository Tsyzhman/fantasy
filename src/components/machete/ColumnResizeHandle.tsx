"use client";
/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import type { PointerEvent } from "react";
import { localizedText } from "@/components/localized-option";
export function keyboardColumnWidth(width: number, key: string, shift = false) {
  if (key === "Home") return 40;
  if (key === "End") return 640;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  return Math.max(40, Math.min(640, width + (key === "ArrowLeft" ? -1 : 1) * (shift ? 32 : 8)));
}
export function ColumnResizeHandle({ label, language, width, onWidthChange, onPointerDown, onDoubleClick }: {
  label: string; language: "en" | "ru"; width: number; onWidthChange: (width: number) => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void; onDoubleClick: () => void;
}) {
  return <span data-column-resize-handle="true" role="separator" tabIndex={0}
    aria-label={localizedText(language, `Resize ${label}`, `Ширина: ${label}`)} aria-orientation="vertical"
    aria-valuemin={40} aria-valuemax={640} aria-valuenow={width}
    title={localizedText(language, "Arrow keys resize; Shift speeds up; Home/End set bounds; Enter resets.", "Стрелки меняют ширину; Shift ускоряет; Home/End задают границы; Enter сбрасывает.")}
    onClick={event => event.stopPropagation()}
    onPointerDown={onPointerDown}
    onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); onDoubleClick(); }}
    onKeyDown={event => {
      const next = keyboardColumnWidth(width, event.key, event.shiftKey);
      if (next !== null || event.key === "Enter") {
        event.preventDefault(); event.stopPropagation();
        if (event.key === "Enter") onDoubleClick(); else onWidthChange(next!);
      }
    }}
    className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none border-r border-transparent hover:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
  />;
}
