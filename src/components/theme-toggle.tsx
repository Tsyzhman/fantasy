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
      data-icon-button
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={theme === "dark"}
      title={label}
      className="ui-icon-button !justify-center"
    >
      <Icon aria-hidden="true" />
      <span className="sr-only">{label}</span>
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
