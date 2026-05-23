"use client";

import { Check, Copy } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { cn } from "@/lib/cn";

export function CopyCurrentLinkButton({ className }: { className?: string }) {
  const language = useLanguage();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState(false);
  const href = useMemo(() => buildCurrentLinkHref(pathname, searchParams.toString()), [pathname, searchParams]);

  async function copyLink() {
    const url = typeof window === "undefined" ? href : new URL(href, window.location.origin).toString();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        copyTextFallback(url);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyLink}
      aria-label={localizedText(language, "Copy current link", "\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443")}
      className={cn("inline-flex items-center justify-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50", className)}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      <span>
        {copied ? <I18nText en="Copied" ru={"\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e"} /> : <I18nText en="Copy link" ru={"\u0421\u0441\u044b\u043b\u043a\u0430"} />}
      </span>
    </button>
  );
}

function copyTextFallback(text: string) {
  const element = document.createElement("textarea");
  element.value = text;
  element.setAttribute("readonly", "");
  element.style.position = "fixed";
  element.style.top = "-9999px";
  document.body.appendChild(element);
  element.select();
  document.execCommand("copy");
  document.body.removeChild(element);
}

export function buildCurrentLinkHref(pathname: string, searchParams: string) {
  return `${pathname}${searchParams ? `?${searchParams}` : ""}`;
}
