/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#fantasy-weeks */
export type ClubCalendar = {
  teamId: string;
  source: string;
  observedAt: Date;
  fixtures: { date: string; opponentId: string; home: boolean; week: number | null }[];
};
export type CalendarMatch = { id: string; homeId: string; awayId: string; startsAt: Date };
export type WeekAssignment = { matchId: string; providerWeekId: string; sources: string[] };

const moscowDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });

export function reconcileClubCalendars(matches: CalendarMatch[], clubs: ClubCalendar[], now: Date) {
  if (matches.length > 1000 || clubs.length > 32 || new Set(clubs.map(c => c.teamId)).size !== clubs.length
    || new Set(matches.map(m => m.id)).size !== matches.length || !Number.isFinite(now.getTime())) throw new Error('CALENDAR_SNAPSHOT_INVALID');
  const keys = new Map<string, CalendarMatch[]>();
  for (const match of matches) {
    for (const [team, opponent, home] of [[match.homeId, match.awayId, true], [match.awayId, match.homeId, false]] as const) {
      const key = `${team}:${opponent}:${home}:${moscowDay(match.startsAt)}`;
      keys.set(key, [...(keys.get(key) ?? []), match]);
    }
  }
  const votes = new Map<string, Map<string, Set<number>>>(), sources = new Map<string, string>();
  const deferred = new Set<string>();
  for (const club of clubs) {
    const age = now.getTime() - club.observedAt.getTime();
    if (!Number.isFinite(age) || age < 0 || age > 120000 || club.fixtures.length > 100
      || !/^https:\/\/www\.sports\.ru\/fantasy\/hockey\/player\/info\/\d+\/\d+\.html$/.test(club.source)) {
      deferred.add(`CALENDAR_SOURCE_INVALID:${club.teamId}`); continue;
    }
    sources.set(club.teamId, club.source);
    for (const fixture of club.fixtures) {
      if (fixture.week === null) continue;
      if (!Number.isInteger(fixture.week) || fixture.week < 1 || fixture.week > 100) {
        deferred.add(`CALENDAR_WEEK_INVALID:${club.teamId}`); continue;
      }
      const candidates = keys.get(`${club.teamId}:${fixture.opponentId}:${fixture.home}:${fixture.date}`) ?? [];
      if (candidates.length > 1) { deferred.add(`CALENDAR_MATCH_AMBIGUOUS:${club.teamId}:${fixture.date}`); continue; }
      if (!candidates.length) continue; // The card can extend beyond the imported official calendar.
      const match = candidates[0], teams = votes.get(match.id) ?? new Map<string, Set<number>>();
      const weeks = teams.get(club.teamId) ?? new Set<number>();
      weeks.add(fixture.week); teams.set(club.teamId, weeks); votes.set(match.id, teams);
    }
  }
  const assignments: WeekAssignment[] = [];
  for (const match of matches) {
    const teams = votes.get(match.id);
    if (!teams) continue;
    const home = teams.get(match.homeId), away = teams.get(match.awayId);
    if (home?.size !== 1 || away?.size !== 1 || [...home][0] !== [...away][0]) {
      deferred.add(`CALENDAR_WEEK_CONFLICT:${match.id}`); continue;
    }
    assignments.push({ matchId: match.id, providerWeekId: String([...home][0]), sources: [sources.get(match.homeId)!, sources.get(match.awayId)!] });
  }
  return { assignments, deferred: [...deferred] };
}
