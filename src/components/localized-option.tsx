"use client";

import { useSyncExternalStore } from "react";

type Language = "en" | "ru";

const defaultLanguage: Language = "en";
const languageChangeEvent = "fantasy-language-change";

type LocalizedOptionProps = {
  value: string;
  en: string;
  ru: string;
  disabled?: boolean;
};

export function LocalizedOption({ value, en, ru, disabled = false }: LocalizedOptionProps) {
  const language = useLanguage();

  return (
    <option value={value} disabled={disabled}>
      {language === "ru" ? ru : en}
    </option>
  );
}

export function useLanguage() {
  return useSyncExternalStore(subscribeToLanguage, getLanguageSnapshot, getServerLanguageSnapshot);
}

export function localizedText(language: Language, en: string, ru: string) {
  return language === "ru" ? ru : en;
}

function subscribeToLanguage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(languageChangeEvent, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(languageChangeEvent, callback);
  };
}

function getLanguageSnapshot(): Language {
  if (typeof window === "undefined") return defaultLanguage;
  const stored = window.localStorage.getItem("fantasy-language");
  return stored === "ru" || stored === "en" ? stored : defaultLanguage;
}

function getServerLanguageSnapshot(): Language {
  return defaultLanguage;
}
