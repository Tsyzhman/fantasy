"use client";

/** @spec spec://common/PROP-002-editorial-sport-design#preferences */
import { useEffect, useSyncExternalStore } from "react";
import { localizedText, useLanguage } from "@/components/localized-option";

type Theme = "light" | "dark" | "system";
const changeEvent = "fantasy-theme-change";
const schemeQuery = "(prefers-color-scheme: dark)";
let volatileTheme: Theme | undefined;

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "system" as Theme);
  const language = useLanguage();
  useEffect(() => { applyTheme(theme); }, [theme]);
  return (
    <select className="preference-select" aria-label={localizedText(language, "Theme", "Тема")} value={theme}
      onChange={(event) => {
        const next = event.target.value as Theme;
        volatileTheme = next;
        try { localStorage.setItem("fantasy-theme", next); } catch {}
        applyTheme(next);
        window.dispatchEvent(new Event(changeEvent));
      }}>
      <option value="system">{localizedText(language, "System theme", "Как в системе")}</option>
      <option value="light">{localizedText(language, "Pressbox", "Pressbox")}</option>
      <option value="dark">{localizedText(language, "Midnight Scout", "Midnight Scout")}</option>
    </select>
  );
}
function snapshot(): Theme {
  if (volatileTheme !== undefined) return volatileTheme;
  let value: string | null | undefined;
  try { value = localStorage.getItem("fantasy-theme"); } catch {}
  return value === "light" || value === "dark" || value === "system" ? value : volatileTheme ?? "system";
}
function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? (matchMedia(schemeQuery).matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}
function subscribe(callback: () => void) {
  const query = matchMedia(schemeQuery);
  const update = () => { applyTheme(snapshot()); callback(); };
  const storage = () => { volatileTheme = undefined; update(); };
  window.addEventListener("storage", storage);
  window.addEventListener(changeEvent, update);
  query.addEventListener("change", update);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(changeEvent, update);
    query.removeEventListener("change", update);
  };
}
