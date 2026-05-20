"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";

import { I18nText } from "@/components/i18n-text";
import { useLanguage } from "@/components/localized-option";

export type BaltikaCalendarTeam = {
  id: string;
  name: string;
  homeXgPerMatch: number;
  homeXgaPerMatch: number;
  awayXgPerMatch: number;
  awayXgaPerMatch: number;
  overallXgPerMatch: number;
  overallXgaPerMatch: number;
};

export type BaltikaCalendarFixture = {
  id: string;
  roundNumber: number | null;
  kickoffAt: string | null;
  status: string;
  source: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeXg: number | null;
  awayXg: number | null;
};

type Draft = {
  roundNumber: string;
  kickoffAt: string;
  homeTeamId: string;
  awayTeamId: string;
};

export function BaltikaCalendarPanel({
  leagueId,
  seasonId,
  teams,
  fixtures
}: {
  leagueId: string;
  seasonId: string;
  teams: BaltikaCalendarTeam[];
  fixtures: BaltikaCalendarFixture[];
}) {
  const router = useRouter();
  const language = useLanguage();
  const [draft, setDraft] = useState<Draft>({ roundNumber: "", kickoffAt: "", homeTeamId: "", awayTeamId: "" });
  const [editing, setEditing] = useState<Record<string, Draft>>({});
  const [fixtureFilter, setFixtureFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const rounds = useMemo(() => {
    const values = fixtures
      .map((fixture) => fixture.roundNumber)
      .filter((value): value is number => typeof value === "number")
      .sort((left, right) => left - right);
    return Array.from(new Set(values));
  }, [fixtures]);
  const roundLabels = useMemo(() => new Map(rounds.map((round, index) => [round, index + 1])), [rounds]);
  const initialRound = useMemo(() => findDefaultRound(fixtures, rounds), [fixtures, rounds]);
  const [selectedRound, setSelectedRound] = useState<number | null>(initialRound);
  const activeRound = selectedRound ?? initialRound;
  const visibleRounds = useMemo(() => prioritizeRounds(rounds, activeRound), [activeRound, rounds]);
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);

  const matrix = useMemo(() => {
    return teams.map((team) => ({
      team,
      cells: visibleRounds.map((round) =>
        fixtures.filter((fixture) => fixture.roundNumber === round && (fixture.homeTeamId === team.id || fixture.awayTeamId === team.id))
      )
    }));
  }, [fixtures, teams, visibleRounds]);
  const roundProjectionRows = useMemo(() => {
    if (activeRound === null) return [];

    return teams.map((team) => {
      const teamFixtures = fixtures.filter(
        (fixture) => fixture.roundNumber === activeRound && (fixture.homeTeamId === team.id || fixture.awayTeamId === team.id)
      );
      const projections = teamFixtures.map((fixture) => projectFixtureForTeam(fixture, team, teamsById));

      return {
        team,
        fixtures: teamFixtures,
        projectedXg: roundNumber(sum(projections.map((projection) => projection.xg))),
        projectedXga: roundNumber(sum(projections.map((projection) => projection.xga))),
        avgProjectedXg: roundNumber(average(projections.map((projection) => projection.xg))),
        avgProjectedXga: roundNumber(average(projections.map((projection) => projection.xga)))
      };
    });
  }, [activeRound, fixtures, teams, teamsById]);

  async function createFixture() {
    setBusyId("new");
    setMessage(null);
    const response = await fetch("/api/baltika/fixtures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId, seasonId, ...draft })
    });
    const payload = await response.json();
    setBusyId(null);

    if (!response.ok) {
      setMessage(payload?.error?.message ?? localizedText("Could not create fixture.", "Не удалось создать матч."));
      return;
    }

    setDraft({ roundNumber: "", kickoffAt: "", homeTeamId: "", awayTeamId: "" });
    router.refresh();
  }

  async function saveFixture(fixture: BaltikaCalendarFixture) {
    setBusyId(fixture.id);
    setMessage(null);
    const response = await fetch(`/api/baltika/fixtures/${fixture.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing[fixture.id] ?? toDraft(fixture))
    });
    const payload = await response.json();
    setBusyId(null);

    if (!response.ok) {
      setMessage(payload?.error?.message ?? localizedText("Could not save fixture.", "Не удалось сохранить матч."));
      return;
    }

    router.refresh();
  }

  async function deleteFixture(fixture: BaltikaCalendarFixture) {
    setBusyId(fixture.id);
    setMessage(null);
    const response = await fetch(`/api/baltika/fixtures/${fixture.id}`, { method: "DELETE" });
    const payload = await response.json();
    setBusyId(null);

    if (!response.ok) {
      setMessage(payload?.error?.message ?? localizedText("Could not delete fixture.", "Не удалось удалить матч."));
      return;
    }

    router.refresh();
  }

  const editableFixtures = useMemo(() => {
    const query = fixtureFilter.trim().toLowerCase();
    return fixtures
      .filter((fixture) => {
        if (!query) return true;
        return `${fixture.homeTeamName} ${fixture.awayTeamName ?? ""} ${fixture.roundNumber ?? ""}`.toLowerCase().includes(query);
      })
      .sort((left, right) => {
        const leftRound = left.roundNumber ?? Number.MAX_SAFE_INTEGER;
        const rightRound = right.roundNumber ?? Number.MAX_SAFE_INTEGER;
        const leftDate = left.kickoffAt ? new Date(left.kickoffAt).getTime() : 0;
        const rightDate = right.kickoffAt ? new Date(right.kickoffAt).getTime() : 0;
        return leftRound - rightRound || leftDate - rightDate || left.homeTeamName.localeCompare(right.homeTeamName);
      });
  }, [fixtureFilter, fixtures]);
  const unscheduledFixtures = fixtures.filter((fixture) => fixture.roundNumber === null);

  return (
    <section className="mt-8 rounded border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink"><I18nText en="Round prediction" ru="Прогноз тура" /></h2>
          <p className="mt-1 text-sm text-slate-500">
            <I18nText en="Predicted xG/xGA uses team home/away form and opponent opposite-side form." ru="Прогноз xG/xGA учитывает домашнюю/гостевую форму команды и форму соперника на другой стороне." />
          </p>
        </div>
        {message ? <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p> : null}
      </div>

      <div className="mt-5 rounded border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink"><I18nText en="Round projection" ru="Расчет тура" /></h3>
            <p className="mt-1 text-sm text-slate-500"><I18nText en="Select a tour to check team-level xG and xGA expectations." ru="Выберите тур, чтобы увидеть ожидаемые xG и xGA по командам." /></p>
          </div>
          <select
            value={activeRound ?? ""}
            onChange={(event) => setSelectedRound(event.target.value ? Number(event.target.value) : null)}
            className="rounded border border-slate-200 px-3 py-2 text-sm"
          >
            {rounds.map((round) => (
              <option key={round} value={round}>
                {localizedText("Tour", "Тур", language)} {roundLabels.get(round)}
                {roundLabels.get(round) !== round ? ` (${localizedText("source", "исходный", language)} ${round})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3"><I18nText en="Team" ru="Команда" /></th>
                <th className="px-4 py-3"><I18nText en="Fixtures" ru="Матчи" /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Pred xG" ru="Прогноз xG" /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Pred xGA" ru="Прогноз xGA" /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Avg xG" ru="Сред. xG" /></th>
                <th className="px-4 py-3 text-right"><I18nText en="Avg xGA" ru="Сред. xGA" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roundProjectionRows.map((row) => (
                <tr key={row.team.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">{row.team.name}</td>
                  <td className="min-w-[240px] px-4 py-3 text-slate-600">
                    {row.fixtures.length === 0 ? (
                      <span className="text-slate-300"><I18nText en="Empty" ru="Пусто" /></span>
                    ) : (
                      <div className="space-y-1">
                        {row.fixtures.map((fixture) => (
                          <p key={fixture.id}>
                            {fixture.homeTeamId === row.team.id ? "vs" : "@"}{" "}
                            {fixture.homeTeamId === row.team.id ? fixture.awayTeamName ?? localizedText("TBD", "Не определено", language) : fixture.homeTeamName}
                          </p>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-700">{formatMetric(row.projectedXg)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-rose-700">{formatMetric(row.projectedXga)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatMetric(row.avgProjectedXg)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">{formatMetric(row.avgProjectedXga)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-ink"><I18nText en="Calendar by round" ru="Календарь по турам" /></h2>
        <p className="mt-1 text-sm text-slate-500"><I18nText en="Any fixture can be moved to another round; teams can have no fixture or multiple fixtures in one round." ru="Любой матч можно перенести в другой тур; у команды может не быть матча или может быть несколько матчей в одном туре." /></p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[90px_1fr_1fr_1fr_auto]">
        <input
          type="number"
          min="1"
          placeholder={localizedText("Round", "Тур", language)}
          value={draft.roundNumber}
          onChange={(event) => setDraft((current) => ({ ...current, roundNumber: event.target.value }))}
          className="rounded border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={draft.kickoffAt}
          onChange={(event) => setDraft((current) => ({ ...current, kickoffAt: event.target.value }))}
          className="rounded border border-slate-200 px-3 py-2 text-sm"
        />
        <TeamSelect value={draft.homeTeamId} teams={teams} placeholder={localizedText("Home team", "Хозяева", language)} onChange={(value) => setDraft((current) => ({ ...current, homeTeamId: value }))} />
        <TeamSelect value={draft.awayTeamId} teams={teams} placeholder={localizedText("Away team", "Гости", language)} onChange={(value) => setDraft((current) => ({ ...current, awayTeamId: value }))} />
        <button
          type="button"
          onClick={() => void createFixture()}
          disabled={busyId === "new"}
          className="inline-flex items-center justify-center gap-2 rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          <I18nText en="Add" ru="Добавить" />
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3"><I18nText en="Team" ru="Команда" /></th>
              {visibleRounds.map((round) => (
                <th key={round} className="min-w-[150px] px-4 py-3">
                  <I18nText en="Tour" ru="Тур" /> {roundLabels.get(round)}
                  {round === activeRound ? <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700"><I18nText en="selected" ru="выбран" /></span> : null}
                  {roundLabels.get(round) !== round ? <span className="ml-1 font-normal normal-case text-slate-400">(<I18nText en="source" ru="исходный" /> {round})</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {matrix.map(({ team, cells }) => (
              <tr key={team.id}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-3 font-semibold text-ink">{team.name}</td>
                {cells.map((cell, index) => (
                  <td key={`${team.id}-${visibleRounds[index]}`} className="align-top px-4 py-3 text-slate-600">
                    {cell.length === 0 ? (
                      <span className="text-slate-300"><I18nText en="Empty" ru="Пусто" /></span>
                    ) : (
                      <div className="space-y-1">
                        {cell.map((fixture) => (
                          <p key={fixture.id}>
                            {fixture.homeTeamId === team.id ? "vs" : "@"}{" "}
                            {fixture.homeTeamId === team.id ? fixture.awayTeamName ?? localizedText("TBD", "Не определено", language) : fixture.homeTeamName}
                          </p>
                        ))}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unscheduledFixtures.length > 0 ? (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {unscheduledFixtures.length} <I18nText en="imported fixtures do not have a round yet." ru="импортированных матчей пока без тура." />
        </div>
      ) : null}

      <div className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase text-slate-500"><I18nText en="Editable fixtures" ru="Редактируемые матчи" /></h3>
            <p className="mt-1 text-sm text-slate-500"><I18nText en="Change the round number to move a match into any tour." ru="Измените номер тура, чтобы перенести матч." /></p>
          </div>
          <input
            type="search"
            value={fixtureFilter}
            onChange={(event) => setFixtureFilter(event.target.value)}
            placeholder={localizedText("Find team or round", "Найти команду или тур", language)}
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm sm:max-w-xs"
          />
        </div>
        <div className="mt-3 space-y-2">
          {editableFixtures.map((fixture) => {
            const value = editing[fixture.id] ?? toDraft(fixture);
            return (
              <div key={fixture.id} className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-field p-3 lg:grid-cols-[minmax(180px,1.2fr)_90px_1fr_1fr_1fr_auto_auto]">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold text-ink">
                    {fixture.homeTeamName} - {fixture.awayTeamName ?? localizedText("TBD", "Не определено", language)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {fixture.status} · {fixture.source}
                  </p>
                </div>
                <input
                  type="number"
                  min="1"
                  value={value.roundNumber}
                  onChange={(event) => setEditingValue(fixture.id, "roundNumber", event.target.value, setEditing)}
                  className="rounded border border-slate-200 px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  value={value.kickoffAt}
                  onChange={(event) => setEditingValue(fixture.id, "kickoffAt", event.target.value, setEditing)}
                  className="rounded border border-slate-200 px-3 py-2 text-sm"
                />
                <TeamSelect value={value.homeTeamId} teams={teams} placeholder={localizedText("Home team", "Хозяева", language)} onChange={(next) => setEditingValue(fixture.id, "homeTeamId", next, setEditing)} />
                <TeamSelect value={value.awayTeamId} teams={teams} placeholder={localizedText("Away team", "Гости", language)} onChange={(next) => setEditingValue(fixture.id, "awayTeamId", next, setEditing)} />
                <button
                  type="button"
                  onClick={() => void saveFixture(fixture)}
                  disabled={busyId === fixture.id}
                  className="inline-flex items-center justify-center gap-2 rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  <I18nText en="Save" ru="Сохранить" />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteFixture(fixture)}
                  disabled={busyId === fixture.id}
                  className="inline-flex items-center justify-center gap-2 rounded border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  <I18nText en="Delete" ru="Удалить" />
                </button>
              </div>
            );
          })}
          {editableFixtures.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              <I18nText en="No fixtures match this filter." ru="Нет матчей под этот фильтр." />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function findDefaultRound(fixtures: BaltikaCalendarFixture[], rounds: number[]) {
  if (rounds.length === 0) return null;

  const today = startOfUtcDay(new Date()).getTime();
  const fixturesWithRound = fixtures.filter((fixture) => typeof fixture.roundNumber === "number" && fixture.kickoffAt);
  const upcoming = fixturesWithRound
    .filter((fixture) => startOfUtcDay(new Date(fixture.kickoffAt as string)).getTime() >= today)
    .sort((left, right) => {
      const leftTime = new Date(left.kickoffAt as string).getTime();
      const rightTime = new Date(right.kickoffAt as string).getTime();
      return leftTime - rightTime;
    })[0];

  if (upcoming?.roundNumber) return upcoming.roundNumber;

  const latestPast = fixturesWithRound
    .filter((fixture) => startOfUtcDay(new Date(fixture.kickoffAt as string)).getTime() < today)
    .sort((left, right) => {
      const leftTime = new Date(left.kickoffAt as string).getTime();
      const rightTime = new Date(right.kickoffAt as string).getTime();
      return rightTime - leftTime;
    })[0];

  return latestPast?.roundNumber ?? rounds[0] ?? null;
}

function prioritizeRounds(rounds: number[], activeRound: number | null) {
  if (activeRound === null) return rounds;
  return [...rounds].sort((left, right) => {
    if (left === activeRound) return -1;
    if (right === activeRound) return 1;
    return left - right;
  });
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function projectFixtureForTeam(
  fixture: BaltikaCalendarFixture,
  team: BaltikaCalendarTeam,
  teamsById: Map<string, BaltikaCalendarTeam>
) {
  const isHome = fixture.homeTeamId === team.id;
  const opponentId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
  const opponent = opponentId ? teamsById.get(opponentId) : null;
  const ownXg = isHome ? fallbackMetric(team.homeXgPerMatch, team.overallXgPerMatch) : fallbackMetric(team.awayXgPerMatch, team.overallXgPerMatch);
  const ownXga = isHome ? fallbackMetric(team.homeXgaPerMatch, team.overallXgaPerMatch) : fallbackMetric(team.awayXgaPerMatch, team.overallXgaPerMatch);
  const opponentXg = opponent
    ? isHome
      ? fallbackMetric(opponent.awayXgPerMatch, opponent.overallXgPerMatch)
      : fallbackMetric(opponent.homeXgPerMatch, opponent.overallXgPerMatch)
    : 0;
  const opponentXga = opponent
    ? isHome
      ? fallbackMetric(opponent.awayXgaPerMatch, opponent.overallXgaPerMatch)
      : fallbackMetric(opponent.homeXgaPerMatch, opponent.overallXgaPerMatch)
    : 0;

  return {
    xg: average([ownXg, opponentXga]),
    xga: average([ownXga, opponentXg])
  };
}

function fallbackMetric(primary: number, fallback: number) {
  return primary > 0 ? primary : fallback;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  const known = values.filter((value) => Number.isFinite(value) && value > 0);
  if (known.length === 0) return 0;
  return sum(known) / known.length;
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMetric(value: number) {
  return value > 0 ? value.toFixed(2) : "-";
}

function TeamSelect({
  value,
  teams,
  placeholder,
  onChange
}: {
  value: string;
  teams: BaltikaCalendarTeam[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded border border-slate-200 px-3 py-2 text-sm">
      <option value="">{placeholder}</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </select>
  );
}

function setEditingValue(
  fixtureId: string,
  key: keyof Draft,
  value: string,
  setEditing: Dispatch<SetStateAction<Record<string, Draft>>>
) {
  setEditing((current) => ({
    ...current,
    [fixtureId]: {
      ...(current[fixtureId] ?? { roundNumber: "", kickoffAt: "", homeTeamId: "", awayTeamId: "" }),
      [key]: value
    }
  }));
}

function toDraft(fixture: BaltikaCalendarFixture): Draft {
  return {
    roundNumber: fixture.roundNumber ? String(fixture.roundNumber) : "",
    kickoffAt: fixture.kickoffAt ? fixture.kickoffAt.slice(0, 10) : "",
    homeTeamId: fixture.homeTeamId ?? "",
    awayTeamId: fixture.awayTeamId ?? ""
  };
}

function localizedText(en: string, ru: string, language?: "en" | "ru") {
  if (language ? language === "ru" : typeof document !== "undefined" && document.documentElement.dataset.language === "ru") return ru;
  return en;
}
