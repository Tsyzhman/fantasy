import type { PrismaClient } from "@prisma/client";

import { fantasySquadLeagueFotMobIds } from "@/lib/leagues/display";
import { PublicFonbetOddsClient, type FonbetFixtureOdds } from "@/providers/fonbet/odds";

const provider = "FONBET";
const kickoffToleranceMs = 15 * 60 * 1_000;
const futureWindowMs = 45 * 24 * 60 * 60 * 1_000;

type MatchCandidate = {
  id: bigint;
  leagueId: bigint | null;
  matchDate: Date | null;
  homeTeam: { name: string } | null;
  awayTeam: { name: string } | null;
};

export type FixtureOddsSyncResult = {
  fetchedEvents: number;
  eligibleEvents: number;
  upcomingMatches: number;
  matched: number;
  stored: number;
  ambiguousOrUnmatched: number;
};

export async function syncFonbetFixtureOdds(
  prisma: PrismaClient,
  client = new PublicFonbetOddsClient(),
  now = new Date()
): Promise<FixtureOddsSyncResult> {
  const [events, matches] = await Promise.all([
    client.getAllFixtureOdds(),
    prisma.coreMatch.findMany({
      where: {
        leagueId: { in: fantasySquadLeagueFotMobIds.map(BigInt) },
        cancelled: false,
        finished: false,
        matchDate: { gte: new Date(now.getTime() - kickoffToleranceMs), lte: new Date(now.getTime() + futureWindowMs) }
      },
      select: {
        id: true,
        leagueId: true,
        matchDate: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } }
      }
    })
  ]);

  const eligibleEvents = events.filter(hasCompleteDirectMarkets);
  const matched = matchFonbetOddsToMatches(matches, eligibleEvents);
  let stored = 0;
  for (const item of matched) {
    const event = item.event;
    await prisma.fixtureOddsSnapshot.upsert({
      where: { matchId_provider: { matchId: item.match.id, provider } },
      create: snapshotData(item.match.id, event),
      update: snapshotUpdate(event)
    });
    stored += 1;
  }

  return {
    fetchedEvents: events.length,
    eligibleEvents: eligibleEvents.length,
    upcomingMatches: matches.length,
    matched: matched.length,
    stored,
    ambiguousOrUnmatched: Math.max(matches.length - matched.length, 0)
  };
}

export function matchFonbetOddsToMatches(matches: MatchCandidate[], events: FonbetFixtureOdds[]) {
  const usedEventIds = new Set<string>();
  const result: Array<{ match: MatchCandidate; event: FonbetFixtureOdds }> = [];

  for (const match of matches) {
    if (!match.matchDate || !match.homeTeam || !match.awayTeam || match.leagueId === null) continue;
    const candidates = events
      .filter((event) => !usedEventIds.has(event.eventId))
      .filter((event) => fonbetSportNameToFotMobLeagueId(event.sportName) === String(match.leagueId))
      .filter((event) => event.startsAt && Math.abs(Date.parse(event.startsAt) - match.matchDate!.getTime()) <= kickoffToleranceMs)
      .map((event) => ({ event, score: fixtureNameScore(match, event) }))
      .filter((candidate) => candidate.score >= 0.52)
      .sort((left, right) => right.score - left.score);

    if (candidates.length === 0) continue;
    if (candidates.length > 1 && candidates[0].score - candidates[1].score < 0.08) continue;
    const winner = candidates[0];
    usedEventIds.add(winner.event.eventId);
    result.push({ match, event: winner.event });
  }

  return result;
}

export function fonbetSportNameToFotMobLeagueId(value: string | null): string | null {
  const name = transliteratedName(value ?? "");
  if (!name || /itogi turnira|luchshii bombardir|kto vyshe/.test(name)) return null;
  if (/angliya.*premer liga/.test(name)) return "47";
  if (/angliya.*chempionship/.test(name)) return "48";
  if (/ispaniya.*(primera|la liga)/.test(name)) return "87";
  if (/germaniya.*bundesliga/.test(name)) return "54";
  if (/italiya.*seriya a/.test(name)) return "55";
  if (/frantsiya.*liga 1/.test(name)) return "53";
  if (/rossiya.*premer liga/.test(name)) return "63";
  if (/turtsiya.*superliga/.test(name)) return "71";
  if (/niderlandy.*premer liga|eredivizi/.test(name)) return "57";
  if (/portugaliya.*(premer liga|primeira|liga portugal)/.test(name)) return "61";
  if (/liga chempionov/.test(name)) return "42";
  if (/liga evropy/.test(name)) return "73";
  return null;
}

export function fixtureNameScore(match: MatchCandidate, event: Pick<FonbetFixtureOdds, "homeTeamName" | "awayTeamName">) {
  if (!match.homeTeam || !match.awayTeam) return 0;
  const home = nameSimilarity(match.homeTeam.name, event.homeTeamName);
  const away = nameSimilarity(match.awayTeam.name, event.awayTeamName);
  if (Math.min(home, away) < 0.3) return 0;
  return (home + away) / 2;
}

function hasCompleteDirectMarkets(event: FonbetFixtureOdds) {
  return event.home.teamOver15Probability !== null && event.away.teamOver15Probability !== null &&
    event.home.cleanSheetProbability !== null && event.away.cleanSheetProbability !== null;
}

function snapshotData(matchId: bigint, event: FonbetFixtureOdds) {
  return {
    id: `fonbet:${matchId}`,
    matchId,
    provider,
    ...snapshotUpdate(event)
  };
}

function snapshotUpdate(event: FonbetFixtureOdds) {
  return {
    providerEventId: event.eventId,
    status: "AVAILABLE",
    homeOver15Odds: event.markets.home.teamTotal15.over,
    homeUnder15Odds: event.markets.home.teamTotal15.under,
    awayOver15Odds: event.markets.away.teamTotal15.over,
    awayUnder15Odds: event.markets.away.teamTotal15.under,
    homeOver15Probability: event.home.teamOver15Probability,
    awayOver15Probability: event.away.teamOver15Probability,
    homeCleanSheetProbability: event.home.cleanSheetProbability,
    awayCleanSheetProbability: event.away.cleanSheetProbability,
    fetchedAt: new Date(event.source.fetchedAt)
  };
}

function nameSimilarity(left: string, right: string) {
  const a = transliteratedName(left);
  const b = transliteratedName(right);
  if (!a || !b) return 0;
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function transliteratedName(value: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya", ь: "", ъ: ""
  };
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .split("").map((character) => map[character] ?? character).join("")
    .replace(/\btsska\b/g, "cska")
    .replace(/\b(fc|fk|futbolnyi klub|football club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}
