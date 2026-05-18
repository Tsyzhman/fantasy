"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState } from "react";

export type BaltikaCalendarTeam = {
  id: string;
  name: string;
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

  const matrix = useMemo(() => {
    return teams.map((team) => ({
      team,
      cells: rounds.map((round) =>
        fixtures.filter((fixture) => fixture.roundNumber === round && (fixture.homeTeamId === team.id || fixture.awayTeamId === team.id))
      )
    }));
  }, [fixtures, rounds, teams]);

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
      setMessage(payload?.error?.message ?? "Could not create fixture.");
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
      setMessage(payload?.error?.message ?? "Could not save fixture.");
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
      setMessage(payload?.error?.message ?? "Could not delete fixture.");
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
          <h2 className="text-lg font-semibold text-ink">Calendar by round</h2>
          <p className="mt-1 text-sm text-slate-500">Any fixture can be moved to another round; teams can have no fixture or multiple fixtures in one round.</p>
        </div>
        {message ? <p className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p> : null}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[90px_1fr_1fr_1fr_auto]">
        <input
          type="number"
          min="1"
          placeholder="Round"
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
        <TeamSelect value={draft.homeTeamId} teams={teams} placeholder="Home team" onChange={(value) => setDraft((current) => ({ ...current, homeTeamId: value }))} />
        <TeamSelect value={draft.awayTeamId} teams={teams} placeholder="Away team" onChange={(value) => setDraft((current) => ({ ...current, awayTeamId: value }))} />
        <button
          type="button"
          onClick={() => void createFixture()}
          disabled={busyId === "new"}
          className="inline-flex items-center justify-center gap-2 rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3">Team</th>
              {rounds.map((round) => (
                <th key={round} className="min-w-[150px] px-4 py-3">
                  Tour {roundLabels.get(round)}
                  {roundLabels.get(round) !== round ? <span className="ml-1 font-normal normal-case text-slate-400">(source {round})</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {matrix.map(({ team, cells }) => (
              <tr key={team.id}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-3 font-semibold text-ink">{team.name}</td>
                {cells.map((cell, index) => (
                  <td key={`${team.id}-${rounds[index]}`} className="align-top px-4 py-3 text-slate-600">
                    {cell.length === 0 ? (
                      <span className="text-slate-300">Empty</span>
                    ) : (
                      <div className="space-y-1">
                        {cell.map((fixture) => (
                          <p key={fixture.id}>
                            {fixture.homeTeamId === team.id ? "vs" : "@"}{" "}
                            {fixture.homeTeamId === team.id ? fixture.awayTeamName ?? "TBD" : fixture.homeTeamName}
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
          {unscheduledFixtures.length} imported fixtures do not have a round yet.
        </div>
      ) : null}

      <div className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase text-slate-500">Editable fixtures</h3>
            <p className="mt-1 text-sm text-slate-500">Change the round number to move a match into any tour.</p>
          </div>
          <input
            type="search"
            value={fixtureFilter}
            onChange={(event) => setFixtureFilter(event.target.value)}
            placeholder="Find team or round"
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
                    {fixture.homeTeamName} - {fixture.awayTeamName ?? "TBD"}
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
                <TeamSelect value={value.homeTeamId} teams={teams} placeholder="Home team" onChange={(next) => setEditingValue(fixture.id, "homeTeamId", next, setEditing)} />
                <TeamSelect value={value.awayTeamId} teams={teams} placeholder="Away team" onChange={(next) => setEditingValue(fixture.id, "awayTeamId", next, setEditing)} />
                <button
                  type="button"
                  onClick={() => void saveFixture(fixture)}
                  disabled={busyId === fixture.id}
                  className="inline-flex items-center justify-center gap-2 rounded bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => void deleteFixture(fixture)}
                  disabled={busyId === fixture.id}
                  className="inline-flex items-center justify-center gap-2 rounded border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            );
          })}
          {editableFixtures.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              No fixtures match this filter.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
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
