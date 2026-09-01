"use client";

import { memo, startTransition, useEffect, useId, useMemo, useRef, useState } from "react";

import { localizedText, useLanguage } from "@/components/localized-option";
import { FdrPill } from "@/components/ui/fdr-pill";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  fantasyFixtureCalendarHorizon,
  rankFantasyFixtureCalendar,
  type FantasyFixtureCalendar as CalendarData,
  type FantasyFixtureCalendarHorizon,
  type FantasyFixtureCalendarMode
} from "@/machete/squad-fixture-calendar";

export const FantasyFixtureCalendar = memo(function FantasyFixtureCalendar({ calendar }: { calendar: CalendarData | null }) {
  const language = useLanguage();
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<FantasyFixtureCalendarMode>("attack");
  const [horizon, setHorizon] = useState<FantasyFixtureCalendarHorizon>(5);
  const text = (en: string, ru: string) => localizedText(language, en, ru);
  const view = useMemo(() => visible && calendar ? rankFantasyFixtureCalendar(calendar, mode, horizon) : null, [calendar, horizon, mode, visible]);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow"
  }), [language]);
  const scoreFormat = useMemo(() => new Intl.NumberFormat(language === "ru" ? "ru-RU" : "en-GB", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }), [language]);

  useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      startTransition(() => setVisible(true));
    }, { rootMargin: "600px" });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, [visible]);

  const summaryTitle = text(
    "Mean fixture difficulty, easiest first. Double rounds count both matches; blanks and unrated fixtures are excluded. Teams without ratings are last.",
    "Средняя сложность матчей, от лёгкой к тяжёлой. В двойном туре учитываются оба матча; пропуски и матчи без оценки исключены. Команды без оценок — внизу."
  );

  return (
    <section ref={sectionRef} className="relative order-7 min-w-0 overflow-hidden rounded border border-slate-200 bg-white shadow-soft" aria-labelledby={titleId} data-squad-fixture-calendar data-mode={mode} data-horizon={horizon}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h3 id={titleId} className="text-sm font-semibold uppercase tracking-wide text-slate-600">{text("All teams · fixture calendar", "Календарь всех команд")}</h3>
          <p className="mt-1 text-xs text-slate-500">{text("Easiest → hardest over the selected rounds", "От лёгкой дистанции к тяжёлой")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            name={text("Fixture difficulty mode", "Режим сложности календаря")}
            value={mode}
            onChange={setMode}
            options={[
              { value: "attack", label: text("Attack", "Атака") },
              { value: "defense", label: text("Defence", "Защита") }
            ]}
            className="[&>button]:min-h-10"
          />
          <select
            aria-label={text("Fixture calendar horizon", "Дистанция календаря")}
            value={horizon}
            onChange={(event) => setHorizon(fantasyFixtureCalendarHorizon(Number(event.target.value)))}
            className="min-h-11 rounded border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
          >
            {[5, 6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>{text(`${value} rounds`, `${value} туров`)}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          {text("Easy", "Легко")}
          {[1, 2, 3, 4, 5].map((difficulty) => <FdrPill key={difficulty} difficulty={difficulty} />)}
          {text("Hard", "Сложно")}
        </span>
        <span>{text("H — home · A — away · — no fixture", "Д — дома · Г — в гостях · — нет матча")}</span>
        <span title={summaryTitle}>{text("Average per match ↓", "Средняя по матчам ↓")}</span>
      </div>
      {!calendar ? (
        <p className="px-4 py-6 text-sm text-slate-500" role="status">{text("The calendar will appear after the server updates this league's snapshot.", "Календарь появится после обновления серверного снимка лиги.")}</p>
      ) : calendar.rounds.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">{text("The provider has no upcoming rounds yet.", "У провайдера пока нет ближайших туров.")}</p>
      ) : !view ? (
        <div className="max-h-[70vh]" style={{ height: Math.max(180, calendar.teams.length * 44 + 44) }} aria-hidden="true" />
      ) : (
        <>
          {view.rounds.length < horizon ? <p className="px-4 py-2 text-xs text-slate-500">{text(
            `Only ${view.rounds.length} of ${horizon} upcoming rounds are available in the provider's schedule.`,
            `В расписании провайдера доступны только ${view.rounds.length} из ${horizon} ближайших туров.`
          )}</p> : null}
          <div className="max-h-[70vh] overflow-auto overscroll-x-contain" tabIndex={0} role="region" aria-labelledby={titleId} data-fixture-calendar-scroll>
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm" style={{ minWidth: 240 + view.rounds.length * 108 }}>
              <caption className="sr-only">{summaryTitle}</caption>
              <colgroup>
                <col className="w-32 sm:w-44" />
                <col className="w-16 sm:w-20" />
                {view.rounds.map((round) => <col key={round.id} />)}
              </colgroup>
              <thead className="text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th scope="col" className="sticky left-0 top-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-3 py-3">{text("Team", "Команда")}</th>
                  <th scope="col" aria-sort="ascending" title={summaryTitle} className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-3 text-center">{text("Avg ↓", "Ср. ↓")}</th>
                  {view.rounds.map((round) => <th key={round.id} scope="col" className="sticky top-0 z-10 min-w-24 border-b border-slate-200 bg-slate-50 px-2 py-3 text-center">{round.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.team.id} data-calendar-team-id={row.team.id} data-calendar-average={row.averageDifficulty ?? ""}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-3 py-2.5 text-left font-semibold text-ink" title={row.team.name}>
                      <span className="block max-w-40 truncate">{row.team.name}</span>
                    </th>
                    <td className="border-b border-slate-100 px-3 py-2 text-center num-tabular" title={text(
                      `${row.ratedFixtures} of ${row.fixtureCount} matches rated. ${summaryTitle}`,
                      `Оценено ${row.ratedFixtures} из ${row.fixtureCount} матчей. ${summaryTitle}`
                    )}>
                      <span className="font-semibold text-slate-700">{row.averageDifficulty === null ? "—" : scoreFormat.format(row.averageDifficulty)}</span>
                      <span className="block whitespace-nowrap text-[10px] text-slate-500">{text(`${row.fixtureCount} matches`, `${row.fixtureCount} матч.`)}{row.ratedFixtures < row.fixtureCount ? " *" : ""}</span>
                    </td>
                    {row.cells.map((fixtures, index) => (
                      <td key={view.rounds[index].id} className="border-b border-slate-100 px-2 py-2 text-center align-middle">
                        {fixtures.length === 0 ? <span className="text-slate-400" title={text("No fixture in this round", "Нет матча в этом туре")}>—</span> : (
                          <div className="flex flex-col items-center gap-1">
                            {fixtures.map((fixture) => {
                              const venue = fixture.side === "home" ? text("home", "дома") : text("away", "в гостях");
                              const kickoff = fixture.kickoffAt ? `${dateFormat.format(new Date(fixture.kickoffAt))} ${text("MSK", "МСК")}` : text("Kickoff TBC", "Время уточняется");
                              return <FdrPill
                                key={fixture.fixtureId}
                                difficulty={fixture.difficulty}
                                side={fixture.side}
                                label={`${fixture.opponentShortName} (${fixture.side === "home" ? text("H", "Д") : text("A", "Г")})`}
                                title={`${fixture.opponentName} · ${venue} · ${kickoff} · ${mode === "attack" ? text("Attack", "Атака") : text("Defence", "Защита")}${fixture.finished ? text(" · Played", " · Сыгран") : ""}`}
                                className="relative max-w-36 truncate"
                              />;
                            })}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">{text(
            "Both matches in a double round count separately. Blanks are excluded; * means some matches have no rating. Same FDR scale as the player table, with attack and defence evaluated separately.",
            "В двойном туре каждый матч считается отдельно. Пропуски исключены; * — не все матчи имеют оценку. Шкала сложности та же, что у игроков, но атака и защита оцениваются отдельно."
          )}</p>
        </>
      )}
    </section>
  );
});
