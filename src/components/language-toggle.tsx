"use client";

import { Languages } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

type Language = "en" | "ru";

const defaultLanguage: Language = "en";
const languageChangeEvent = "fantasy-language-change";

export function LanguageToggle() {
  const language = useSyncExternalStore(subscribeToLanguage, getLanguageSnapshot, getServerLanguageSnapshot);

  useEffect(() => {
    applyLanguage(language);
  }, [language]);

  function toggleLanguage() {
    const next = language === "ru" ? "en" : "ru";
    applyLanguage(next);
    try { window.localStorage.setItem("fantasy-language", next); } catch {}
    window.dispatchEvent(new Event(languageChangeEvent));
  }

  const label = language === "ru" ? "Переключить на английский" : "Switch to Russian";

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label={label}
      className="ui-button text-sm"
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      <span>{language.toUpperCase()}</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}

function subscribeToLanguage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(languageChangeEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(languageChangeEvent, callback);
  };
}

function getLanguageSnapshot(): Language {
  let stored: string | null = null;
  try { stored = window.localStorage.getItem("fantasy-language"); } catch {}
  return stored === "ru" || stored === "en" ? stored : defaultLanguage;
}

function getServerLanguageSnapshot(): Language {
  return defaultLanguage;
}

function applyLanguage(language: Language) {
  document.documentElement.dataset.language = language;
  document.documentElement.lang = language;
}
