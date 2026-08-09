import { Prisma, type PrismaClient } from "@prisma/client";

export type FoontasySourceRow = {
  id: number;
  external_id: string;
  name: string;
  team_name: string;
  role: number;
  points: number;
  attacking_points?: number | null;
  price?: number | null;
  selected_by_percent?: number | null;
  desc?: string | null;
};

export type FoontasyImportInput = {
  leagueId: bigint;
  season: string;
  sourceVariant: "sports" | "uefa";
  sourceRoundLabel: string;
  sourceRoundNumber: number;
  rows: FoontasySourceRow[];
};

export type FoontasyRoundDescriptor = {
  sourceRoundLabel: string;
  sourceRoundNumber: number;
};

export type FoontasySyncConfig = {
  email: string;
  password: string;
  url: string;
  leagueId: bigint;
  season: string;
  sourceKey: string;
  sourceVariant: "sports" | "uefa";
};

const minimumDomesticRows = 100;
const minimumCupRows = 20;

export class FoontasySourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoontasySourceUnavailableError";
  }
}

export function foontasySyncConfigFromEnv(env: NodeJS.ProcessEnv = process.env): FoontasySyncConfig {
  return {
    email: requiredEnvironmentValue(env, "FOONTASY_EMAIL"),
    password: requiredEnvironmentValue(env, "FOONTASY_PASSWORD"),
    url: env.FOONTASY_URL || "https://foontasy.ru/assistant/rpl",
    leagueId: BigInt(env.FOONTASY_LEAGUE_ID || "63"),
    season: env.FOONTASY_SEASON || "2026/2027",
    sourceKey: env.FOONTASY_SOURCE_KEY?.trim() || "rpl",
    sourceVariant: env.FOONTASY_SOURCE_VARIANT === "uefa" ? "uefa" : "sports"
  };
}

export async function syncFoontasyForecasts(prisma: PrismaClient, config: FoontasySyncConfig) {
  const signinUrl = new URL("/signin", config.url).toString();
  const signin = await fetch(signinUrl, { redirect: "manual" });
  const form = await signin.text();
  const token = /name="_token" value="([^"]+)"/.exec(form)?.[1];
  const initialCookie = responseCookieHeader(signin);
  if (!token || !initialCookie) throw new Error("Foontasy sign-in form or session cookie is unavailable.");

  const login = await fetch(signinUrl, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: initialCookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      _token: token,
      email: config.email,
      password: config.password,
      intended_url: new URL(config.url).origin
    })
  });
  const sessionCookie = responseCookieHeader(signin, login);
  const page = await fetch(config.url, { headers: { cookie: sessionCookie } });
  if (!page.ok) {
    const message = `Foontasy assistant is not published yet: HTTP ${page.status}; existing data was preserved.`;
    if (page.status >= 500) throw new FoontasySourceUnavailableError(message);
    throw new Error(`Foontasy forecast request failed: HTTP ${page.status}.`);
  }
  if (new URL(page.url).pathname === "/signin") throw new Error("Foontasy authentication failed.");

  const html = await page.text();
  const round = parseFoontasyRoundDescriptor(html, config.leagueId);
  return importFoontasyForecasts(prisma, {
    leagueId: config.leagueId,
    season: config.season,
    sourceVariant: config.sourceVariant,
    ...round,
    rows: parseFoontasyForecastPage(html, config.leagueId)
  });
}

export function parseFoontasyForecastPage(html: string, leagueId = 63n) {
  const match = /let data = (\[.*?\]);\s*let/s.exec(html);
  if (!match) throw new FoontasySourceUnavailableError("Foontasy page does not contain a published forecast array; existing data was preserved.");
  const raw: unknown = JSON.parse(match[1]);
  if (!Array.isArray(raw)) throw new Error("Foontasy forecast payload is not an array.");
  const rows = raw.filter(isFoontasySourceRow);
  const minimumRows = minimumFoontasyRows(leagueId);
  if (rows.length < minimumRows) {
    throw new FoontasySourceUnavailableError(`Foontasy returned only ${rows.length} valid forecast rows; existing data was preserved.`);
  }
  const meaningfulRows = rows.filter(isMeaningfulFoontasyForecast).length;
  const minimumMeaningfulRows = isCupLeague(leagueId)
    ? Math.max(10, Math.ceil(rows.length * 0.05))
    : minimumDomesticRows;
  if (meaningfulRows < minimumMeaningfulRows) {
    throw new FoontasySourceUnavailableError(
      `Foontasy returned only ${meaningfulRows} calculated forecast rows out of ${rows.length}; the all-zero draft was not imported.`
    );
  }
  return rows;
}

export function parseFoontasyRound(html: string, leagueId = 63n) {
  return parseFoontasyRoundDescriptor(html, leagueId).sourceRoundNumber;
}

export function parseFoontasyRoundDescriptor(html: string, leagueId = 63n): FoontasyRoundDescriptor {
  const headings = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    .map((match) => cleanHtmlText(match[1]))
    .filter(Boolean);
  const sourceRoundLabel = headings.find((heading) => foontasyRoundOrdinal(heading, leagueId) !== null)
    ?? cleanHtmlText(/((?:\d+\s*(?:-?\s*й\s*)?тур)|(?:1\/(?:16|8|4)\s*финала?)|(?:полуфинал[^<]*)|(?:3\s*место\s*и\s*финал)|(?:финал))/i.exec(html)?.[1] ?? "");
  const sourceRoundNumber = foontasyRoundOrdinal(sourceRoundLabel, leagueId);
  if (!sourceRoundLabel || sourceRoundNumber === null) {
    throw new FoontasySourceUnavailableError("Foontasy page does not identify a supported current round or cup stage; existing data was preserved.");
  }
  return { sourceRoundLabel, sourceRoundNumber };
}

export async function importFoontasyForecasts(prisma: PrismaClient, input: FoontasyImportInput) {
  if (input.sourceVariant === "uefa") {
    throw new FoontasySourceUnavailableError(
      "Foontasy UEFA storage is prepared but remains disabled until the compatible source-variant index rollout is complete."
    );
  }
  const phase = await resolveFoontasySportsPhase(prisma, input);
  const sourceIds = input.rows.map((row) => row.external_id);
  const prices = await prisma.fantasyPlayerPrice.findMany({
    where: { provider: "SPORTS_RU", leagueId: input.leagueId, season: input.season, providerPlayerId: { in: sourceIds } },
    select: { id: true, providerPlayerId: true, playerId: true }
  });
  assertFoontasyProviderOverlap(prices.length, input.rows.length, input.leagueId);
  const maps = prices.length === 0 ? [] : await prisma.providerEntityMap.findMany({
    where: { provider: "SPORTS_RU", providerEntityType: "FANTASY_PLAYER_PRICE", providerEntityId: { in: prices.map((price) => price.id) }, internalEntityType: "PLAYER", internalEntityId: { not: null } },
    select: { providerEntityId: true, internalEntityId: true }
  });
  const mappedByPriceId = new Map(maps.map((item) => [item.providerEntityId, item.internalEntityId]));
  const playerIdBySourceId = new Map(prices.flatMap((price) => {
    const playerId = price.playerId ? String(price.playerId) : mappedByPriceId.get(price.id) ?? null;
    return price.providerPlayerId && playerId ? [[price.providerPlayerId, BigInt(playerId)] as const] : [];
  }));
  assertFoontasyMappingReadiness(playerIdBySourceId.size, input.rows.length, input.leagueId);
  const mappedPlayerIds = [...new Set(playerIdBySourceId.values())];
  const modelForecasts = mappedPlayerIds.length === 0 ? [] : await prisma.fantasyModelForecast.findMany({
    where: { leagueId: input.leagueId, season: input.season, playerId: { in: mappedPlayerIds } },
    select: {
      playerId: true,
      horizon: true,
      points: true,
      status: true,
      modelVersion: true,
      inputSources: true,
      breakdown: true,
      calculatedAt: true
    },
    orderBy: { calculatedAt: "desc" }
  });
  const modelForecastsByPlayer = new Map<string, typeof modelForecasts>();
  for (const forecast of modelForecasts) {
    const key = String(forecast.playerId);
    const existing = modelForecastsByPlayer.get(key) ?? [];
    if (!existing.some((item) => item.horizon === forecast.horizon && item.modelVersion === forecast.modelVersion)) {
      existing.push(forecast);
      modelForecastsByPlayer.set(key, existing);
    }
  }
  const fetchedAt = new Date();
  await prisma.$transaction(input.rows.map((row) => prisma.foontasyForecast.upsert({
    where: {
      leagueId_season_sourceVariant_sourceSeasonId_sourceRoundNumber_sourcePlayerId: {
        leagueId: input.leagueId,
        season: input.season,
        sourceVariant: input.sourceVariant,
        sourceSeasonId: phase.sourceSeasonId,
        sourceRoundNumber: phase.sourceRoundNumber,
        sourcePlayerId: row.external_id
      }
    },
    create: forecastData(input, phase, row, playerIdBySourceId.get(row.external_id) ?? null, fetchedAt),
    update: forecastData(input, phase, row, playerIdBySourceId.get(row.external_id) ?? null, fetchedAt)
  })));
  const samples = await prisma.foontasyForecastSample.createMany({
    data: input.rows.map((row) => {
      const playerId = playerIdBySourceId.get(row.external_id) ?? null;
      const playerModelForecasts = playerId ? modelForecastsByPlayer.get(String(playerId)) ?? [] : [];
      const nearestForecast = playerModelForecasts.find((forecast) => forecast.horizon === 3) ?? playerModelForecasts[0] ?? null;
      return {
        leagueId: input.leagueId,
        season: input.season,
        sourceVariant: input.sourceVariant,
        sourceSeasonId: phase.sourceSeasonId,
        sourceRoundLabel: input.sourceRoundLabel,
        sourceRoundNumber: phase.sourceRoundNumber,
        roundNumber: phase.roundNumber,
        sourcePlayerId: row.external_id,
        playerId,
        playerName: row.name,
        teamName: row.team_name,
        position: String(row.role),
        foontasyPoints: row.points,
        attackingPoints: finiteOrNull(row.attacking_points),
        price: finiteOrNull(row.price),
        selectedByPercent: finiteOrNull(row.selected_by_percent),
        breakdown: row.desc ?? null,
        modelNextPoints: firstFixturePoints(nearestForecast?.breakdown),
        modelVersion: nearestForecast?.modelVersion ?? null,
        featureSnapshot: playerModelForecasts.length === 0 ? Prisma.JsonNull : {
          capturedBeforeRound: phase.roundNumber,
          forecasts: playerModelForecasts.map((forecast) => ({
            horizon: forecast.horizon,
            points: forecast.points,
            status: forecast.status,
            modelVersion: forecast.modelVersion,
            calculatedAt: forecast.calculatedAt.toISOString(),
            inputSources: forecast.inputSources,
            breakdown: forecast.breakdown
          }))
        } as Prisma.InputJsonValue,
        capturedAt: fetchedAt
      };
    }),
    skipDuplicates: true
  });
  return {
    rows: input.rows.length,
    mapped: input.rows.filter((row) => playerIdBySourceId.has(row.external_id)).length,
    roundNumber: phase.roundNumber,
    sourceRoundLabel: input.sourceRoundLabel,
    sourceSeasonId: phase.sourceSeasonId,
    samplesAdded: samples.count,
    samplesPreserved: input.rows.length - samples.count
  };
}

type ResolvedFoontasyPhase = {
  sourceSeasonId: string;
  sourceRoundNumber: number;
  roundNumber: number;
};

function forecastData(
  input: FoontasyImportInput,
  phase: ResolvedFoontasyPhase,
  row: FoontasySourceRow,
  playerId: bigint | null,
  fetchedAt: Date
) {
  return {
    leagueId: input.leagueId,
    season: input.season,
    sourceVariant: input.sourceVariant,
    sourceSeasonId: phase.sourceSeasonId,
    sourceRoundLabel: input.sourceRoundLabel,
    sourceRoundNumber: phase.sourceRoundNumber,
    roundNumber: phase.roundNumber,
    sourcePlayerId: row.external_id,
    playerId,
    playerName: row.name,
    teamName: row.team_name,
    position: String(row.role),
    points: row.points,
    attackingPoints: finiteOrNull(row.attacking_points),
    price: finiteOrNull(row.price),
    selectedByPercent: finiteOrNull(row.selected_by_percent),
    breakdown: row.desc ?? null,
    fetchedAt
  };
}

function isFoontasySourceRow(value: unknown): value is FoontasySourceRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "number" && typeof row.external_id === "string" && typeof row.name === "string" && typeof row.team_name === "string" && typeof row.role === "number" && typeof row.points === "number" && Number.isFinite(row.points);
}

function isMeaningfulFoontasyForecast(row: FoontasySourceRow) {
  return row.points !== 0
    || (typeof row.attacking_points === "number" && row.attacking_points !== 0)
    || Boolean(row.desc?.trim());
}

export function assertFoontasyMappingReadiness(mappedRows: number, totalRows: number, leagueId = 63n) {
  const share = totalRows > 0 ? mappedRows / totalRows : 0;
  if (mappedRows >= minimumFoontasyRows(leagueId) && share >= 0.9) return;
  throw new FoontasySourceUnavailableError(
    `Foontasy player mapping is not ready: ${mappedRows} of ${totalRows} rows are linked through current Sports.ru prices; existing data was preserved.`
  );
}

export function assertFoontasyProviderOverlap(providerRows: number, totalRows: number, leagueId = 63n) {
  const share = totalRows > 0 ? providerRows / totalRows : 0;
  if (providerRows >= minimumFoontasyRows(leagueId) && share >= 0.9) return;
  throw new FoontasySourceUnavailableError(
    `Foontasy source IDs do not match the current Sports.ru phase: ${providerRows} of ${totalRows} rows overlap; existing data was preserved.`
  );
}

function minimumFoontasyRows(leagueId: bigint) {
  return isCupLeague(leagueId) ? minimumCupRows : minimumDomesticRows;
}

function isCupLeague(leagueId: bigint) {
  return leagueId === 42n || leagueId === 73n || leagueId === 77n;
}

async function resolveFoontasySportsPhase(
  prisma: PrismaClient,
  input: FoontasyImportInput
): Promise<ResolvedFoontasyPhase> {
  const contest = await prisma.sportsRuFantasyContest.findUnique({
    where: {
      provider_leagueId_season: {
        provider: "SPORTS_RU",
        leagueId: input.leagueId,
        season: input.season
      }
    },
    select: { rules: true }
  });
  return resolveFoontasySportsRound(contest?.rules, input);
}

export function resolveFoontasySportsRound(
  rules: unknown,
  input: Pick<FoontasyImportInput, "leagueId" | "season" | "sourceRoundLabel" | "sourceRoundNumber" | "sourceVariant">
): ResolvedFoontasyPhase {
  const phase = currentSportsRuPhase(rules);
  if (!phase) {
    throw new FoontasySourceUnavailableError(
      `Sports.ru prices and phase metadata are not ready for ${input.leagueId} ${input.season}; existing data was preserved.`
    );
  }
  if (phase.tours.length === 0) {
    return {
      sourceSeasonId: phase.seasonId,
      sourceRoundNumber: input.sourceRoundNumber,
      roundNumber: phase.canonicalOffset + input.sourceRoundNumber
    };
  }
  if (input.sourceVariant === "uefa" && /^\d+\s*(?:й\s*)?тур(?:\s|$)/.test(normalizeRoundLabel(input.sourceRoundLabel))) {
    const phaseRoundNumber = input.sourceRoundNumber - phase.canonicalOffset;
    if (phaseRoundNumber >= 1 && phaseRoundNumber <= phase.tours.length) {
      return {
        sourceSeasonId: phase.seasonId,
        sourceRoundNumber: phaseRoundNumber,
        roundNumber: input.sourceRoundNumber
      };
    }
    throw new FoontasySourceUnavailableError(
      `Foontasy UEFA round "${input.sourceRoundLabel}" is outside Sports.ru phase ${phase.seasonId}; existing data was preserved.`
    );
  }
  const directIndex = phase.tours.findIndex((tour) => normalizeRoundLabel(tour.name) === normalizeRoundLabel(input.sourceRoundLabel));
  const semanticMatches = phase.tours.flatMap((tour, index) =>
    foontasyRoundOrdinal(tour.name, input.leagueId) === input.sourceRoundNumber ? [index] : []
  );
  const phaseIndex = directIndex >= 0 ? directIndex : semanticMatches.length === 1 ? semanticMatches[0] : -1;
  if (phaseIndex < 0) {
    throw new FoontasySourceUnavailableError(
      `Foontasy round "${input.sourceRoundLabel}" does not match the current Sports.ru phase ${phase.seasonId}; existing data was preserved.`
    );
  }
  return {
    sourceSeasonId: phase.seasonId,
    sourceRoundNumber: phaseIndex + 1,
    roundNumber: phase.canonicalOffset + phaseIndex + 1
  };
}

function currentSportsRuPhase(rules: unknown) {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null;
  const record = rules as Record<string, unknown>;
  const seasonId = typeof record.sportsRuSeasonId === "string" ? record.sportsRuSeasonId : null;
  if (!seasonId) return null;
  const stored = Array.isArray(record.sportsRuSeasons)
    ? record.sportsRuSeasons.find((value) =>
      value && typeof value === "object" && !Array.isArray(value)
      && (value as Record<string, unknown>).seasonId === seasonId
    )
    : null;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return { seasonId, canonicalOffset: 0, tours: [] as Array<{ id: string; name: string }> };
  }
  const phase = stored as Record<string, unknown>;
  const canonicalOffset = Number.isSafeInteger(phase.canonicalOffset) ? Number(phase.canonicalOffset) : 0;
  const tours = Array.isArray(phase.tours) ? phase.tours.flatMap((value): Array<{ id: string; name: string }> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const tour = value as Record<string, unknown>;
    return typeof tour.id === "string" && typeof tour.name === "string" ? [{ id: tour.id, name: tour.name }] : [];
  }) : [];
  return { seasonId, canonicalOffset, tours };
}

function foontasyRoundOrdinal(label: string, leagueId: bigint) {
  const normalized = normalizeRoundLabel(label);
  const numbered = /^(\d+)\s*(?:й\s*)?тур(?:\s|$)/.exec(normalized);
  if (numbered) return Number(numbered[1]);
  if (leagueId === 77n) {
    if (/1\/16/.test(normalized)) return 4;
    if (/1\/8/.test(normalized)) return 5;
    if (/1\/4/.test(normalized)) return 6;
    if (/полуфинал/.test(normalized)) return 7;
    if (/3\s*мест|финал/.test(normalized)) return 8;
    return null;
  }
  if (leagueId === 42n || leagueId === 73n) {
    if (/1\/16/.test(normalized)) return /ответ|втор/.test(normalized) ? 2 : 1;
    if (/1\/8/.test(normalized)) return /ответ|втор/.test(normalized) ? 4 : 3;
    if (/1\/4/.test(normalized)) return /ответ|втор/.test(normalized) ? 6 : 5;
    if (/полуфинал/.test(normalized)) return /ответ|втор/.test(normalized) ? 8 : 7;
    if (/^финал(?:\s|$)/.test(normalized)) return 9;
  }
  return null;
}

function normalizeRoundLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/(\d+)\s*-?\s*й(?=\s|$)/g, "$1 й")
    .replace(/[^\p{L}\p{N}/]+/gu, " ")
    .trim();
}

function cleanHtmlText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function firstFixturePoints(breakdown: unknown) {
  if (!Array.isArray(breakdown)) return null;
  const first = breakdown[0];
  if (!first || typeof first !== "object") return null;
  const points = (first as Record<string, unknown>).points;
  return typeof points === "number" && Number.isFinite(points) ? points : null;
}

export function responseCookieHeader(...responses: Response[]) {
  const cookies = new Map<string, string>();
  for (const response of responses) {
    for (const value of response.headers.getSetCookie?.() ?? []) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

function requiredEnvironmentValue(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
