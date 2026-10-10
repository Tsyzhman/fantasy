"use client";

/** @spec spec://common/PROP-002-editorial-sport-design#preferences */
import { useEffect, useSyncExternalStore } from "react";
import { localizedText, useLanguage } from "@/components/localized-option";

type Density = "comfortable" | "compact";
let volatileDensity: Density | undefined;
const changeEvent = "fantasy-density-change";
function snapshot(): Density {
  if (volatileDensity !== undefined) return volatileDensity;
  let value: string | null | undefined;
  try { value = localStorage.getItem("fantasy-density"); } catch {}
  return value === "compact" || value === "comfortable" ? value : volatileDensity ?? "comfortable";
}
function subscribe(callback: () => void) {
  const update = () => { document.documentElement.dataset.density = snapshot(); callback(); };
  const storage = () => { volatileDensity = undefined; update(); };
  window.addEventListener("storage", storage);
  window.addEventListener(changeEvent, update);
  return () => { window.removeEventListener("storage", storage); window.removeEventListener(changeEvent, update); };
}
export function DensityToggle() {
  const density = useSyncExternalStore(subscribe, snapshot, () => "comfortable" as Density);
  const language = useLanguage();
  useEffect(() => { document.documentElement.dataset.density = density; }, [density]);
  return (
    <select className="preference-select" aria-label={localizedText(language, "Table density", "Плотность таблиц")} value={density}
      onChange={(event) => {
        const next = event.target.value as Density;
        volatileDensity = next;
        try { localStorage.setItem("fantasy-density", next); } catch {}
        document.documentElement.dataset.density = next;
        window.dispatchEvent(new Event(changeEvent));
      }}>
      <option value="comfortable">{localizedText(language, "Comfortable", "Обычная плотность")}</option>
      <option value="compact">{localizedText(language, "Compact", "Компактная плотность")}</option>
    </select>
  );
}
