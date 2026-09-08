import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { normalizeName } from "@/lib/text";
import {
  buildSportsRuMappingCandidates,
  resolveSportsRuSeasonTeam,
  scoreSportsRuCandidate,
  setSportsRuPlayerMapping
} from "@/machete/sports_ru_player_mapping";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const seedSportsOnly = process.argv.includes("--seed-sports-only");
const season = stringArgument("--season") ?? "2026/2027";
const leagueIds = (stringArgument("--league-ids") ?? "47,48,57,61,63,71,87")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^\d+$/.test(value))
  .map(BigInt);
const teamIds = (stringArgument("--team-ids") ?? "").split(",").filter(Boolean).map(BigInt);
const syntheticPlayerIdBase = 8_000_000_000_000_000n;

type MappingPlan = {
  leagueId: bigint;
  contestId: string;
  priceId: string;
  providerPlayerId: string | null;
  sportsName: string;
  sportsTeam: string;
  targetTeamId: bigint;
  targetTeamName: string;
  currentPlayerId: bigint | null;
  targetPlayerId: bigint;
  targetPlayerName: string;
  action: "MAP_ACTIVE" | "MAP_GLOBAL" | "REPAIR_BIRTH_DATE" | "SEED_SPORTS_ONLY";
  confidence: number;
  reason: string;
  birthDate: Date | null;
};

async function main() {
  const plans: MappingPlan[] = [];
  const unresolved: Array<Record<string, unknown>> = [];
  const conflicts: Array<Record<string, unknown>> = [];
  const summaries: Array<Record<string, unknown>> = [];
  const contests = await prisma.fantasyContest.findMany({
    where: { provider: "SPORTS_RU", season, leagueId: { in: leagueIds } },
    select: { id: true, leagueId: true }
  });
  const contestByLeagueId = new Map(contests.map((contest) => [String(contest.leagueId), contest.id]));
  const missingContests = leagueIds.filter((leagueId) => !contestByLeagueId.has(String(leagueId)));
  if (missingContests.length > 0) {
    throw new Error(`Sports.ru fantasy contest is not synchronized for league(s): ${missingContests.join(", ")}.`);
  }

  for (const leagueId of leagueIds) {
    const contestId = contestByLeagueId.get(String(leagueId));
    if (!contestId) throw new Error(`Sports.ru fantasy contest is not synchronized for ${leagueId}/${season}.`);
    const [prices, roster, seasonTeams] = await Promise.all([
      prisma.fantasyPlayerPrice.findMany({
        where: { provider: "SPORTS_RU", contestId, leagueId, season },
        include: { player: true, team: true },
        orderBy: [{ teamName: "asc" }, { price: "desc" }, { playerName: "asc" }]
      }),
      prisma.teamPlayerSeason.findMany({
        where: { leagueId, season, active: true },
        include: { player: true, team: true }
      }),
      prisma.leagueSeasonTeam.findMany({
        where: { leagueId, season, active: true },
        include: { team: true }
      })
    ]);
    const birthDates = [...new Set(prices.flatMap((price) => price.providerBirthDate
      ? [dateOnly(price.providerBirthDate)]
      : []))].map((value) => new Date(`${value}T00:00:00.000Z`));
    const globalPlayers = birthDates.length === 0
      ? []
      : await prisma.corePlayer.findMany({ where: { birthDate: { in: birthDates } } });
    const globalByBirthDate = new Map<string, typeof globalPlayers>();
    for (const player of globalPlayers) {
      if (!player.birthDate) continue;
      const key = dateOnly(player.birthDate);
      globalByBirthDate.set(key, [...(globalByBirthDate.get(key) ?? []), player]);
    }
    const claimed = new Set(prices.flatMap((price) => price.playerId ? [String(price.playerId)] : []));
    let retained = 0;
    let verifiedByBirthDate = 0;
    let birthDateConflicts = 0;

    for (const price of prices) {
      const targetTeam = resolveSportsRuSeasonTeam(price.teamName, seasonTeams);
      if (!targetTeam) {
        unresolved.push(unresolvedRow(price, "TARGET_TEAM_NOT_FOUND"));
        continue;
      }
      if (teamIds.length && !teamIds.includes(targetTeam.teamId)) continue;
      const mappedBirthDateConflicts = Boolean(
        price.player
        && price.providerBirthDate
        && price.player.birthDate
        && dateOnly(price.providerBirthDate) !== dateOnly(price.player.birthDate)
      );
      if (price.playerId && !mappedBirthDateConflicts) {
        retained += 1;
        if (price.providerBirthDate && price.player?.birthDate) verifiedByBirthDate += 1;
        continue;
      }
      if (mappedBirthDateConflicts) {
        birthDateConflicts += 1;
        claimed.delete(String(price.playerId));
      }

      const activeCandidates = buildSportsRuMappingCandidates(price, roster, targetTeam.teamId)
        .filter((candidate) => !claimed.has(candidate.playerId));
      const active = safeCandidate(activeCandidates, 0.78, 0.04);
      const globalCandidates = price.providerBirthDate
        ? (globalByBirthDate.get(dateOnly(price.providerBirthDate)) ?? [])
          .filter((player) => !claimed.has(String(player.id)))
          .filter((player) => hasIdentityNameEvidence(price, player.name))
          .map((player) => {
            const score = scoreSportsRuCandidate(price, {
              playerId: player.id,
              teamId: targetTeam.teamId,
              position: price.position,
              player,
              team: targetTeam.team
            }, targetTeam.teamId);
            return { playerId: String(player.id), playerName: player.name, confidence: score.confidence, reason: score.reason };
          })
          .sort((left, right) => right.confidence - left.confidence || left.playerName.localeCompare(right.playerName))
        : [];
      const global = safeCandidate(globalCandidates, 0.82, 0.06);
      const selected = active ?? global;

      if (selected) {
        const action = mappedBirthDateConflicts
          ? "REPAIR_BIRTH_DATE"
          : active ? "MAP_ACTIVE" : "MAP_GLOBAL";
        plans.push({
          leagueId,
          contestId,
          priceId: price.id,
          providerPlayerId: price.providerPlayerId,
          sportsName: price.playerName,
          sportsTeam: price.teamName,
          targetTeamId: targetTeam.teamId,
          targetTeamName: targetTeam.team.name,
          currentPlayerId: price.playerId,
          targetPlayerId: BigInt(selected.playerId),
          targetPlayerName: selected.playerName,
          action,
          confidence: selected.confidence,
          reason: selected.reason,
          birthDate: price.providerBirthDate
        });
        claimed.add(selected.playerId);
        continue;
      }

      const plausibleGlobal = price.providerBirthDate
        ? (globalByBirthDate.get(dateOnly(price.providerBirthDate)) ?? []).filter((player) => hasIdentityNameEvidence(price, player.name))
        : [];
      if (
        seedSportsOnly
        && !mappedBirthDateConflicts
        && price.providerPlayerId
        && price.providerStatPlayerId
        && plausibleGlobal.length === 0
      ) {
        const syntheticId = syntheticPlayerId(price.providerPlayerId);
        plans.push({
          leagueId,
          contestId,
          priceId: price.id,
          providerPlayerId: price.providerPlayerId,
          sportsName: price.playerName,
          sportsTeam: price.teamName,
          targetTeamId: targetTeam.teamId,
          targetTeamName: targetTeam.team.name,
          currentPlayerId: price.playerId,
          targetPlayerId: syntheticId,
          targetPlayerName: price.playerName,
          action: "SEED_SPORTS_ONLY",
          confidence: 1,
          reason: "authoritative Sports.ru identity; no plausible FotMob/core player with the same birth date",
          birthDate: price.providerBirthDate
        });
        claimed.add(String(syntheticId));
      } else {
        const row = unresolvedRow(price, mappedBirthDateConflicts ? "MAPPED_BIRTH_DATE_CONFLICT" : "NO_SAFE_IDENTITY");
        unresolved.push({
          ...row,
          targetTeam: targetTeam.team.name,
          activeCandidates: activeCandidates.slice(0, 3),
          globalCandidates: globalCandidates.slice(0, 3),
          plausibleGlobalPlayers: plausibleGlobal.slice(0, 5).map((player) => ({ id: String(player.id), name: player.name }))
        });
        if (mappedBirthDateConflicts) conflicts.push(row);
      }
    }

    summaries.push({
      leagueId: String(leagueId),
      prices: prices.length,
      retained,
      verifiedByBirthDate,
      birthDateConflicts,
      planned: plans.filter((plan) => plan.leagueId === leagueId).length,
      unresolved: unresolved.filter((row) => row.leagueId === String(leagueId)).length
    });
  }

  console.log(JSON.stringify({ apply, seedSportsOnly, season, summaries, actions: countActions(plans), plans: apply ? undefined : plans, conflicts, unresolved: unresolved.slice(0, 100) }, bigintJson, 2));
  if (!apply) return;
  if (conflicts.length > 0) {
    throw new Error(`${conflicts.length} mapped birth-date conflict(s) have no safe replacement; refusing to apply until they are reviewed.`);
  }
  const backup = await writeBackup(plans);
  console.log(`Backup written: ${backup}`);
  for (const plan of plans) {
    if (plan.action === "SEED_SPORTS_ONLY") {
      const existing = await prisma.corePlayer.findUnique({ where: { id: plan.targetPlayerId } });
      if (!existing) {
        await prisma.corePlayer.create({
          data: {
            id: plan.targetPlayerId,
            name: plan.targetPlayerName,
            birthDate: plan.birthDate,
            source: "sports_ru",
            rawRef: plan.providerPlayerId
          }
        });
      } else if (existing.source !== "sports_ru" || existing.rawRef !== plan.providerPlayerId) {
        throw new Error(`Synthetic player id collision for Sports.ru ${plan.providerPlayerId}.`);
      }
    }
    await setSportsRuPlayerMapping(prisma, {
      priceId: plan.priceId,
      contestId: plan.contestId,
      playerId: plan.targetPlayerId,
      teamId: plan.targetTeamId,
      lockTeam: plan.action !== "MAP_ACTIVE"
    });
  }
  console.log(JSON.stringify({ applied: plans.length, actions: countActions(plans) }));
}

function safeCandidate<T extends { playerId: string; playerName: string; confidence: number }>(
  candidates: T[],
  minimumConfidence: number,
  minimumMargin: number
) {
  const first = candidates[0];
  const second = candidates[1];
  if (!first || first.confidence < minimumConfidence) return null;
  if (second && first.confidence - second.confidence < minimumMargin) return null;
  return first;
}

function hasIdentityNameEvidence(price: { fotmobPlayerName: string | null; normalizedName: string }, playerName: string) {
  const providerName = normalizeName(price.fotmobPlayerName || price.normalizedName);
  const targetName = normalizeName(playerName);
  if (!providerName || !targetName) return false;
  if (providerName.includes(targetName) || targetName.includes(providerName)) return true;
  const providerTokens = providerName.split(" ").filter((token) => token.length >= 3);
  const targetTokens = targetName.split(" ").filter((token) => token.length >= 3);
  const overlap = providerTokens.filter((token) => targetTokens.includes(token));
  if (overlap.length >= 2) return true;
  if (overlap.some((token) => token.length >= 4) && providerTokens[0]?.[0] === targetTokens[0]?.[0]) return true;
  return stringSimilarity(providerName, targetName) >= 0.72;
}

function stringSimilarity(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    for (let index = 0; index <= right.length; index += 1) previous[index] = current[index];
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function unresolvedRow(price: {
  leagueId: bigint;
  providerPlayerId: string | null;
  playerId: bigint | null;
  playerName: string;
  teamName: string;
  fotmobPlayerName: string | null;
  providerStatPlayerId: string | null;
  providerBirthDate: Date | null;
  position: string | null;
}, reason: string) {
  return {
    leagueId: String(price.leagueId),
    providerPlayerId: price.providerPlayerId,
    currentPlayerId: price.playerId ? String(price.playerId) : null,
    sportsName: price.playerName,
    sportsTeam: price.teamName,
    identityHint: price.fotmobPlayerName,
    providerStatPlayerId: price.providerStatPlayerId,
    birthDate: price.providerBirthDate ? dateOnly(price.providerBirthDate) : null,
    position: price.position,
    reason
  };
}

async function writeBackup(plans: MappingPlan[]) {
  const priceIds = plans.map((plan) => plan.priceId);
  const contestIds = [...new Set(plans.map((plan) => plan.contestId))];
  const [prices, maps] = await Promise.all([
    prisma.fantasyPlayerPrice.findMany({ where: { id: { in: priceIds }, provider: "SPORTS_RU", contestId: { in: contestIds } } }),
    prisma.providerEntityMap.findMany({ where: { provider: "SPORTS_RU", contestId: { in: contestIds }, providerEntityId: { in: priceIds } } })
  ]);
  const directory = process.env.MAPPING_BACKUP_DIR || path.join(process.cwd(), "output", "mapping-backups");
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(directory, `sports-ru-spain-championship-turkey-${stamp}.json`);
  await writeFile(destination, JSON.stringify({ createdAt: new Date().toISOString(), season, plans, prices, maps }, bigintJson, 2), { flag: "wx" });
  return destination;
}

function syntheticPlayerId(providerPlayerId: string) {
  return syntheticPlayerIdBase + BigInt(providerPlayerId);
}

function countActions(plans: MappingPlan[]) {
  return Object.fromEntries(["MAP_ACTIVE", "MAP_GLOBAL", "REPAIR_BIRTH_DATE", "SEED_SPORTS_ONLY"]
    .map((action) => [action, plans.filter((plan) => plan.action === action).length]));
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function stringArgument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim() || null;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
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
