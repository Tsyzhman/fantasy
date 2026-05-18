import type { ReactNode } from "react";

export function I18nText({ en, ru }: { en: ReactNode; ru: ReactNode }) {
  return (
    <>
      <span className="i18n-en">{en}</span>
      <span className="i18n-ru">{ru}</span>
    </>
  );
}
