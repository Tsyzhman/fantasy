"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { localizedText, useLanguage } from "@/components/localized-option";
import { cn } from "@/lib/cn";

type CommandPaletteProps = {
  showAdmin?: boolean;
};

type CommandItem = {
  href: string;
  labelEn: string;
  labelRu: string;
  sectionEn: string;
  sectionRu: string;
  keywords: string[];
};

const baseCommands: CommandItem[] = [
  { href: "/", labelEn: "Home", labelRu: "Главная", sectionEn: "Shell", sectionRu: "Оболочка", keywords: ["home", "dashboard", "главная"] },
  { href: "/players", labelEn: "Players switchboard", labelRu: "Выбор таблицы игроков", sectionEn: "Players", sectionRu: "Игроки", keywords: ["players", "игроки", "all"] },
  { href: "/compare", labelEn: "Player compare", labelRu: "Сравнение игроков", sectionEn: "Players", sectionRu: "Игроки", keywords: ["compare", "comparison", "сравнить"] },
  { href: "/machete/leagues", labelEn: "Machete leagues", labelRu: "Лиги Machete", sectionEn: "Machete", sectionRu: "Machete", keywords: ["machete", "leagues", "fotmob"] },
  { href: "/machete/players", labelEn: "Machete players", labelRu: "Игроки Machete", sectionEn: "Machete", sectionRu: "Machete", keywords: ["machete", "players", "fotmob"] },
  { href: "/machete/squad", labelEn: "Squad planner", labelRu: "Планировщик состава", sectionEn: "Machete", sectionRu: "Machete", keywords: ["squad", "planner", "состав"] },
  { href: "/machete/models", labelEn: "Machete scoring models", labelRu: "Модели скоринга Machete", sectionEn: "Machete", sectionRu: "Machete", keywords: ["models", "scoring"] },
  { href: "/machete/sync-jobs", labelEn: "Machete sync jobs", labelRu: "Задачи синхронизации Machete", sectionEn: "Machete", sectionRu: "Machete", keywords: ["sync", "jobs", "ingestion"] },
  { href: "/baltika/leagues", labelEn: "Baltika leagues", labelRu: "Лиги Балтики", sectionEn: "Baltika", sectionRu: "Балтика", keywords: ["baltika", "leagues", "wyscout"] },
  { href: "/baltika/players", labelEn: "Baltika players", labelRu: "Игроки Балтики", sectionEn: "Baltika", sectionRu: "Балтика", keywords: ["baltika", "players", "wyscout"] },
  { href: "/baltika/models", labelEn: "Baltika scoring models", labelRu: "Модели скоринга Балтики", sectionEn: "Baltika", sectionRu: "Балтика", keywords: ["baltika", "models", "scoring"] },
  { href: "/mixerr", labelEn: "MiXerr shot maps", labelRu: "Карты ударов Миксер", sectionEn: "MiXerr", sectionRu: "Миксер", keywords: ["mixerr", "shots", "xg", "карты"] }
];

const adminCommands: CommandItem[] = [
  { href: "/admin/ingestion", labelEn: "Ingestion", labelRu: "Загрузка", sectionEn: "Admin", sectionRu: "Админ", keywords: ["admin", "ingestion", "sync"] },
  { href: "/admin/users", labelEn: "Users", labelRu: "Пользователи", sectionEn: "Admin", sectionRu: "Админ", keywords: ["admin", "users"] },
  { href: "/admin/leagues", labelEn: "Admin leagues", labelRu: "Админ-лиги", sectionEn: "Admin", sectionRu: "Админ", keywords: ["admin", "leagues"] },
  { href: "/admin/models", labelEn: "Admin models", labelRu: "Админ-модели", sectionEn: "Admin", sectionRu: "Админ", keywords: ["admin", "models"] }
];

export function CommandPalette({ showAdmin = false }: CommandPaletteProps) {
  const router = useRouter();
  const language = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const commands = useMemo(() => (showAdmin ? [...baseCommands, ...adminCommands] : baseCommands), [showAdmin]);
  const filteredCommands = useMemo(() => filterCommands(commands, query, language), [commands, language, query]);
  const activeCommand = filteredCommands[activeIndex] ?? filteredCommands[0] ?? null;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  function runCommand(command: CommandItem | null) {
    if (!command) return;
    close();
    router.push(command.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        aria-label={localizedText(language, "Open command palette", "Открыть палитру команд")}
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline"><I18nText en="Search" ru="Поиск" /></span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/45 px-3 py-16 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={localizedText(language, "Command palette", "Палитра команд")}>
          <div className="mx-auto max-w-xl overflow-hidden rounded border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") close();
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((current) => Math.min(current + 1, Math.max(filteredCommands.length - 1, 0)));
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((current) => Math.max(current - 1, 0));
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runCommand(activeCommand);
                  }
                }}
                placeholder={localizedText(language, "Search pages", "Найти страницу")}
                className="h-10 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-ink outline-none"
              />
              <button
                type="button"
                onClick={close}
                className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
                aria-label={localizedText(language, "Close", "Закрыть")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {filteredCommands.map((command, index) => (
                <button
                  key={command.href}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runCommand(command)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm",
                    index === activeIndex ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{localizedText(language, command.labelEn, command.labelRu)}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{command.href}</span>
                  </span>
                  <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {localizedText(language, command.sectionEn, command.sectionRu)}
                  </span>
                </button>
              ))}
              {filteredCommands.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-slate-500">
                  <I18nText en="No matching pages" ru="Ничего не найдено" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function filterCommands(commands: CommandItem[], query: string, language: "en" | "ru") {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return commands;

  return commands.filter((command) => {
    const haystack = [
      command.href,
      command.labelEn,
      command.labelRu,
      command.sectionEn,
      command.sectionRu,
      ...command.keywords
    ].join(" ").toLowerCase();
    return normalizedQuery
      .split(/\s+/)
      .every((part) => haystack.includes(part) || localizedText(language, command.labelEn, command.labelRu).toLowerCase().includes(part));
  });
}
