"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { localizedText, useLanguage } from "@/components/localized-option";

type Theme = "light" | "dark";

const defaultTheme: Theme = "light";
const themeChangeEvent = "fantasy-theme-change";
const darkSchemeQuery = "(prefers-color-scheme: dark)";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const language = useLanguage();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    window.localStorage.setItem("fantasy-theme", next);
    window.dispatchEvent(new Event(themeChangeEvent));
  }

  const Icon = theme === "dark" ? Sun : Moon;
  const label =
    theme === "dark"
      ? localizedText(language, "Switch to light theme", "Переключить на светлую тему")
      : localizedText(language, "Switch to dark theme", "Переключить на темную тему");

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function subscribeToTheme(callback: () => void) {
  const mediaQuery = window.matchMedia(darkSchemeQuery);
  window.addEventListener("storage", callback);
  window.addEventListener(themeChangeEvent, callback);
  mediaQuery.addEventListener("change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(themeChangeEvent, callback);
    mediaQuery.removeEventListener("change", callback);
  };
}

function getThemeSnapshot(): Theme {
  const stored = window.localStorage.getItem("fantasy-theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia(darkSchemeQuery).matches ? "dark" : defaultTheme;
}

function getServerThemeSnapshot(): Theme {
  return defaultTheme;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
