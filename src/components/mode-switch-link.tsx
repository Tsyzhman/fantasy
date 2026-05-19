"use client";

import Link from "next/link";

import { I18nText } from "@/components/i18n-text";

export function ModeSwitchLink() {
  return (
    <Link className="rounded px-3 py-2 hover:bg-slate-100" href="/">
      <I18nText en="Modes" ru="Режимы" />
    </Link>
  );
}
