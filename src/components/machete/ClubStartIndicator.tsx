"use client";

/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#starting-chances */
import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { localizedText } from "@/components/localized-option";
import { formatDateTime } from "@/lib/format";
import type { SorareStartChance } from "@/machete/sorareinside-start-chances";

// All mounted players at the same kickoff share one timeout.
const kickoffs = new Map<number, { timer: number; listeners: Set<() => void> }>();
function subscribeToKickoff(time: number, notify: () => void) {
  if (!(time > Date.now())) return () => {};
  let entry = kickoffs.get(time);
  if (!entry) {
    const group = { timer: 0, listeners: new Set<() => void>() };
    function wake() {
      const remaining = time - Date.now();
      if (remaining > 0) {
        group.timer = window.setTimeout(wake, Math.min(remaining, 2_147_483_647));
        return;
      }
      kickoffs.delete(time);
      for (const listener of group.listeners) listener();
    }
    entry = group;
    kickoffs.set(time, entry);
    wake();
  }
  const group = entry;
  group.listeners.add(notify);
  return () => {
    group.listeners.delete(notify);
    if (!group.listeners.size && kickoffs.get(time) === group) {
      window.clearTimeout(group.timer);
      kickoffs.delete(time);
    }
  };
}

export function ClubStartIndicator({ isStarter, chance, language, control, showFixture }: {
  isStarter?: boolean | null;
  chance?: SorareStartChance | null;
  language: "en" | "ru";
  control?: ReactNode;
  showFixture?: boolean;
}) {
  const kickoff = chance ? Date.parse(chance.kickoff) : 0;
  const subscribe = useCallback((notify: () => void) => subscribeToKickoff(kickoff, notify), [kickoff]);
  const upcoming = useSyncExternalStore(subscribe, () => kickoff > Date.now(), () => Boolean(chance));
  const current = upcoming ? chance : null;
  const starter = chance?.clubStarter ?? isStarter;
  const status = starter == null ? "XI —" : starter ? localizedText(language, "In XI", "В старте") : localizedText(language, "Outside XI", "Вне старта");
  const statusTitle = localizedText(language, "Club XI from the lineup forecast, last match or manual selection", "Стартовая отметка клуба по прогнозу состава, последнему матчу или ручному выбору");
  const chanceText = current ? `Sorare ${current.percent}%` : "Sorare —";
  const fixture = current ? `${current.opponent} · ${formatDateTime(current.kickoff)} ${localizedText(language, "MSK", "МСК")}` : null;
  const title = current
    ? localizedText(language, `SorareInside chance of starting against ${fixture} — ${current.percent}%`, `Шанс выйти в старте по прогнозу SorareInside на матч против ${fixture} — ${current.percent}%`)
    : localizedText(language, "No current Sorare starting percentage", "Актуального процента старта от Sorare нет");
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 text-[10px] leading-tight">
      {control ?? <span className={starter ? "font-semibold text-emerald-700" : "text-slate-600"} title={statusTitle}>{status}</span>}
      <span className="whitespace-nowrap font-medium text-slate-600 num-tabular" title={title} aria-label={title}>{chanceText}</span>
      {showFixture && fixture ? <span className="text-slate-500">{fixture}</span> : null}
    </span>
  );
}
