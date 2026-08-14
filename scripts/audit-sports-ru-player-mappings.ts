import { PrismaClient } from "@prisma/client";

import {
  resolveSportsRuSeasonTeam,
  scoreSportsRuCandidate
} from "@/machete/sports_ru_player_mapping";
import {
  missingFotMobBirthDateSentinelRows,
  verifiedSportsRuBirthDateDiscrepancies,
  verifiedSportsRuNameVariantsWithoutBirthDate
} from "./sports-ru-current-final-mapping-data";

const prisma = new PrismaClient();
const provider = "SPORTS_RU";
const sportsOnlyPlayerIdBase = 8_000_000_000_000_000n;
const liveAudit = !process.argv.includes("--skip-live");
const summaryOnly = process.argv.includes("--summary-only");
const concurrency = positiveIntegerArgument("--concurrency") ?? 8;

type AuditIssue = {
  code: string;
  leagueId: string;
  season: string;
  providerPlayerId: string | null;
  priceId: string;
  sportsName: string;
  sportsTeam: string;
  playerId: string | null;
  detail: string;
};

type FotMobPlayerProfile = {
  id?: number | string | null;
  name?: string | null;
  birthDate?: { utcTime?: string | null } | null;
  primaryTeam?: { teamId?: number | string | null; teamName?: string | null } | null;
  positionDescription?: { primaryPosition?: { label?: string | null } | null } | null;
};

async function main() {
  const contests = await prisma.fantasyContest.findMany({
    where: {
      provider,
      prices: { some: { provider } }
    },
    include: {
      league: { select: { name: true } },
      prices: {
        where: { provider },
        include: { player: true, team: true },
        orderBy: [{ teamName: "asc" }, { playerName: "asc" }]
      }
    },
    orderBy: [{ leagueId: "asc" }, { season: "asc" }]
  });
  const prices = contests.flatMap((contest) => contest.prices);
  const priceIds = prices.map((price) => price.id);
  const maps = priceIds.length === 0 ? [] : await prisma.providerEntityMap.findMany({
    where: {
      provider,
      contestId: { in: contests.map((contest) => contest.id) },
      providerEntityType: "FANTASY_PLAYER_PRICE",
      providerEntityId: { in: priceIds },
      internalEntityType: "PLAYER"
    },
    orderBy: [{ providerEntityId: "asc" }, { providerSeason: "asc" }]
  });
  const seasonTeams = await prisma.leagueSeasonTeam.findMany({
    where: {
      active: true,
      OR: contests.map((contest) => ({ leagueId: contest.leagueId, season: contest.season }))
    },
    include: { team: true }
  });
  const teamsByScope = new Map<string, typeof seasonTeams>();
  for (const team of seasonTeams) {
    const key = scopeKey(team.leagueId, team.season);
    teamsByScope.set(key, [...(teamsByScope.get(key) ?? []), team]);
  }
  const mapsByPriceId = new Map<string, typeof maps>();
  for (const map of maps) {
    mapsByPriceId.set(map.providerEntityId, [...(mapsByPriceId.get(map.providerEntityId) ?? []), map]);
  }

  const issues: AuditIssue[] = [];
  const warnings: AuditIssue[] = [];
  const contestById = new Map(contests.map((contest) => [contest.id, contest]));
  for (const price of prices) {
    const context = issueContext(price);
    const priceMaps = mapsByPriceId.get(price.id) ?? [];
    const currentMaps = priceMaps.filter((map) => map.providerSeason === price.season);
    const current = currentMaps[0] ?? null;
    if (priceMaps.length !== 1) {
      issues.push({
        ...context,
        code: "MAP_ROW_COUNT",
        detail: `expected one provider map, found ${priceMaps.length}: ${priceMaps.map((map) => `${map.providerSeason}/${map.status}/${map.internalEntityId ?? "null"}`).join(", ") || "none"}`
      });
    }
    if (currentMaps.length !== 1) {
      issues.push({
        ...context,
        code: "CURRENT_MAP_COUNT",
        detail: `expected one ${price.season} provider map, found ${currentMaps.length}`
      });
    }
    const currentResolved = current?.status === "MATCHED"
      ? Boolean(price.playerId && current.internalEntityId === String(price.playerId))
      : current?.status === "EXCLUDED"
        ? price.playerId === null && price.teamId === null && current.internalEntityId === null
        : false;
    if (!currentResolved) {
      issues.push({
        ...context,
        code: "UNRESOLVED_CURRENT_MAP",
        detail: current
          ? `${current.status}/${current.internalEntityId ?? "null"} does not agree with price player ${price.playerId ?? "null"}`
          : "current-season provider map is missing"
      });
    }
    const candidates = teamsByScope.get(scopeKey(price.leagueId, price.season)) ?? [];
    const expectedTeam = resolveSportsRuSeasonTeam(price.teamName, candidates);
    if (!expectedTeam) {
      issues.push({ ...context, code: "SPORTS_TEAM_UNRESOLVED", detail: "Sports.ru team does not resolve to one active league-season team" });
    } else if (price.playerId && price.teamId !== expectedTeam.teamId) {
      issues.push({
        ...context,
        code: "PRICE_TEAM_MISMATCH",
        detail: `price team ${price.teamId ?? "null"}/${price.team?.name ?? "unknown"}; expected ${expectedTeam.teamId}/${expectedTeam.team.name}`
      });
    }
    if (price.playerId && !price.player) {
      issues.push({ ...context, code: "CORE_PLAYER_MISSING", detail: "price player_id has no core player" });
    }
    if (!contestById.has(price.contestId)) {
      issues.push({ ...context, code: "CONTEST_MISSING", detail: "price contest is outside the audited Sports.ru contests" });
    }
  }

  for (const contest of contests) {
    const claims = new Map<string, typeof contest.prices>();
    for (const price of contest.prices) {
      if (!price.playerId) continue;
      const key = String(price.playerId);
      claims.set(key, [...(claims.get(key) ?? []), price]);
    }
    for (const [playerId, rows] of claims) {
      if (rows.length < 2) continue;
      for (const row of rows) {
        issues.push({
          ...issueContext(row),
          code: "DUPLICATE_PLAYER_CLAIM",
          detail: `core player ${playerId} is claimed by ${rows.map((item) => `${item.providerPlayerId}/${item.playerName}`).join(", ")}`
        });
      }
    }
  }

  const mappedPrices = prices.filter((price) => price.playerId && price.player);
  const syntheticPrices = mappedPrices.filter((price) => price.playerId! >= sportsOnlyPlayerIdBase);
  for (const price of syntheticPrices) {
    if (price.player?.source !== "sports_ru" || price.player.rawRef !== price.providerPlayerId) {
      issues.push({
        ...issueContext(price),
        code: "SPORTS_ONLY_IDENTITY_MISMATCH",
        detail: `synthetic player source/rawRef is ${price.player?.source ?? "missing"}/${price.player?.rawRef ?? "null"}`
      });
    }
  }

  const fotmobPrices = mappedPrices.filter((price) => price.playerId! < sportsOnlyPlayerIdBase && price.player?.source !== "sports_ru");
  const profileByPlayerId = liveAudit
    ? await fetchProfiles([...new Set(fotmobPrices.map((price) => String(price.playerId)))])
    : new Map<string, FotMobPlayerProfile | Error>();
  if (liveAudit) {
    for (const price of fotmobPrices) {
      const context = issueContext(price);
      const profile = profileByPlayerId.get(String(price.playerId));
      if (!profile || profile instanceof Error) {
        issues.push({
          ...context,
          code: "FOTMOB_PROFILE_UNAVAILABLE",
          detail: profile instanceof Error ? profile.message : "profile was not fetched"
        });
        continue;
      }
      const profileName = profile.name?.trim() ?? "";
      if (!profileName) {
        issues.push({ ...context, code: "FOTMOB_PROFILE_NAME_MISSING", detail: "live FotMob profile has no name" });
        continue;
      }
      const expectedTeam = resolveSportsRuSeasonTeam(
        price.teamName,
        teamsByScope.get(scopeKey(price.leagueId, price.season)) ?? []
      );
      const score = scoreSportsRuCandidate(price, {
        playerId: price.playerId!,
        teamId: expectedTeam?.teamId ?? price.teamId ?? 0n,
        position: profile.positionDescription?.primaryPosition?.label ?? price.position,
        player: {
          name: profileName,
          birthDate: profile.birthDate?.utcTime ? new Date(profile.birthDate.utcTime) : null
        },
        team: { name: expectedTeam?.team.name ?? price.teamName }
      }, expectedTeam?.teamId ?? null);
      if (score.nameConfidence < 0.78) {
        const reviewedWithoutBirthDate = verifiedSportsRuNameVariantsWithoutBirthDate.some((row) =>
          row.leagueId === context.leagueId
          && row.providerPlayerId === context.providerPlayerId
          && row.playerId === context.playerId
          && row.sportsName === (price.fotmobPlayerName ?? price.playerName)
          && row.fotmobName === profileName
        );
        const target = score.birthDateMatches || reviewedWithoutBirthDate ? warnings : issues;
        target.push({
          ...context,
          code: score.birthDateMatches
            ? "VERIFIED_NAME_VARIANT_BY_BIRTH_DATE"
            : reviewedWithoutBirthDate
              ? "VERIFIED_NAME_VARIANT_WITHOUT_BIRTH_DATE"
              : "IDENTITY_NAME_MISMATCH",
          detail: `Sports hint ${price.fotmobPlayerName ?? price.playerName}; FotMob ${profileName}; name confidence ${score.nameConfidence}`
        });
      }
      if (score.birthDateConflicts) {
        const providerBirthDate = dateOnly(price.providerBirthDate);
        const fotmobBirthDate = dateOnly(profile.birthDate?.utcTime ? new Date(profile.birthDate.utcTime) : null);
        const verifiedDiscrepancy = verifiedSportsRuBirthDateDiscrepancies.some((row) =>
          row.leagueId === context.leagueId
          && row.providerPlayerId === context.providerPlayerId
          && row.playerId === context.playerId
          && row.providerBirthDate === providerBirthDate
          && row.fotmobBirthDate === fotmobBirthDate
        );
        const missingFotMobBirthDate = fotmobBirthDate === "0001-01-01"
          && missingFotMobBirthDateSentinelRows.some((row) =>
            row.leagueId === context.leagueId
            && row.providerPlayerId === context.providerPlayerId
            && row.playerId === context.playerId
          );
        const target = verifiedDiscrepancy || missingFotMobBirthDate ? warnings : issues;
        target.push({
          ...context,
          code: verifiedDiscrepancy
            ? "VERIFIED_BIRTH_DATE_DISCREPANCY"
            : missingFotMobBirthDate
              ? "FOTMOB_BIRTH_DATE_UNAVAILABLE"
              : "IDENTITY_BIRTH_DATE_MISMATCH",
          detail: `Sports.ru ${providerBirthDate}; FotMob ${fotmobBirthDate}; FotMob ${profileName}`
        });
      }
    }
  }

  const currentMaps = maps.filter((map) => {
    const price = prices.find((row) => row.id === map.providerEntityId);
    return price?.season === map.providerSeason;
  });
  const excludedPriceIds = new Set(currentMaps
    .filter((map) => map.status === "EXCLUDED" && map.internalEntityId === null)
    .map((map) => map.providerEntityId));
  const unresolved = prices.filter((price) => !price.playerId && !excludedPriceIds.has(price.id));
  const summary = {
    liveAudit,
    concurrency,
    contests: contests.length,
    prices: prices.length,
    mapped: mappedPrices.length,
    excluded: excludedPriceIds.size,
    resolved: mappedPrices.length + excludedPriceIds.size,
    unresolved: unresolved.length,
    sportsOnly: syntheticPrices.length,
    fotmobProfilesRequested: liveAudit ? profileByPlayerId.size : 0,
    issues: countByCode(issues),
    warnings: countByCode(warnings),
    championships: contests.map((contest) => {
      const excluded = contest.prices.filter((price) => excludedPriceIds.has(price.id)).length;
      const mapped = contest.prices.filter((price) => price.playerId).length;
      return {
        leagueId: String(contest.leagueId),
        league: contest.league.name,
        season: contest.season,
        contestId: contest.id,
        prices: contest.prices.length,
        mapped,
        excluded,
        resolved: mapped + excluded,
        unresolved: contest.prices.length - mapped - excluded
      };
    })
  };
  console.log(JSON.stringify(summaryOnly ? { summary } : { summary, issues, warnings }, bigintJson, 2));
  if (issues.length > 0) process.exitCode = 2;
}

async function fetchProfiles(playerIds: string[]) {
  const result = new Map<string, FotMobPlayerProfile | Error>();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, playerIds.length) }, async () => {
    while (cursor < playerIds.length) {
      const index = cursor;
      cursor += 1;
      const playerId = playerIds[index];
      try {
        result.set(playerId, await fetchFotMobProfile(playerId));
      } catch (error) {
        result.set(playerId, error instanceof Error ? error : new Error(String(error)));
      }
    }
  });
  await Promise.all(workers);
  return result;
}

async function fetchFotMobProfile(playerId: string) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`https://www.fotmob.com/api/data/playerData?id=${encodeURIComponent(playerId)}`, {
        headers: { "user-agent": "FantasyScoutSportsRuIdentityAudit/1.0" },
        signal: AbortSignal.timeout(20_000)
      });
      if (!response.ok) throw new Error(`FotMob ${response.status} ${response.statusText}`);
      const profile = await response.json() as FotMobPlayerProfile;
      if (String(profile.id ?? "") !== playerId) throw new Error(`FotMob returned player ${profile.id ?? "null"}`);
      return profile;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < 3) await delay(250 * attempt);
    }
  }
  throw lastError ?? new Error("FotMob profile request failed");
}

function issueContext(price: {
  leagueId: bigint;
  season: string;
  providerPlayerId: string | null;
  id: string;
  playerName: string;
  teamName: string;
  playerId: bigint | null;
}) {
  return {
    leagueId: String(price.leagueId),
    season: price.season,
    providerPlayerId: price.providerPlayerId,
    priceId: price.id,
    sportsName: price.playerName,
    sportsTeam: price.teamName,
    playerId: price.playerId ? String(price.playerId) : null
  };
}

function scopeKey(leagueId: bigint, season: string) {
  return `${leagueId}/${season}`;
}

function countByCode(issues: AuditIssue[]) {
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function positiveIntegerArgument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  const index = process.argv.indexOf(name);
  const raw = inline?.slice(name.length + 1) ?? (index >= 0 ? process.argv[index + 1] : undefined);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function dateOnly(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10) ?? "null";
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function bigintJson(_key: string, value: unknown) {
  return typeof value === "bigint" ? String(value) : value;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
