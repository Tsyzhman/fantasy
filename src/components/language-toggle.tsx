"use client";

import { Languages } from "lucide-react";
import { useEffect, useState } from "react";

type Language = "en" | "ru";

export function LanguageToggle() {
  const [language, setLanguage] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("fantasy-language");
    const initial = stored === "ru" || stored === "en" ? stored : "en";
    applyLanguage(initial);
    setLanguage(initial);
    setMounted(true);
  }, []);

  function toggleLanguage() {
    const next = language === "ru" ? "en" : "ru";
    applyLanguage(next);
    setLanguage(next);
    window.localStorage.setItem("fantasy-language", next);
  }

  const label = language === "ru" ? "Switch to English" : "Переключить на русский";

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      title={mounted ? label : "Switch language"}
      aria-label={mounted ? label : "Switch language"}
      className="inline-flex h-9 items-center justify-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      <Languages className="h-4 w-4" />
      <span>{mounted ? language.toUpperCase() : "EN"}</span>
    </button>
  );
}

function applyLanguage(language: Language) {
  document.documentElement.dataset.language = language;
  document.documentElement.lang = language;
}
