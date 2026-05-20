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
    window.localStorage.setItem("fantasy-language", next);
    window.dispatchEvent(new Event(languageChangeEvent));
  }

  const label = language === "ru" ? "Переключить на английский" : "Switch to Russian";

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      title={label}
      aria-label={label}
      className="inline-flex h-9 items-center justify-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      <Languages className="h-4 w-4" />
      <span>{language.toUpperCase()}</span>
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
  const stored = window.localStorage.getItem("fantasy-language");
  return stored === "ru" || stored === "en" ? stored : defaultLanguage;
}

function getServerLanguageSnapshot(): Language {
  return defaultLanguage;
}

function applyLanguage(language: Language) {
  document.documentElement.dataset.language = language;
  document.documentElement.lang = language;
}
