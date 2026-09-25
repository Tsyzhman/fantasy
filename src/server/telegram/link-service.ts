import type { PrismaClient } from "@prisma/client";
import {
  TELEGRAM_CODE_GRACE_MS,
  TELEGRAM_CODE_SLOT_MS,
  TELEGRAM_PENDING_TTL_MS,
  TELEGRAM_SESSION_TTL_MS,
  telegramBotUsername,
  telegramLinkSecret
} from "./config";
import { deriveTelegramChallengeCode, deriveTelegramChallengeSecret, digestTelegramSecret, normalizeTelegramLinkCode, telegramCodeSlot } from "./crypto";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#linking
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#data
 */
export class TelegramLinkError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "TelegramLinkError";
    this.code = code;
    this.status = status;
  }
}

export interface TelegramIdentity {
  telegramUserId: string;
  chatId: string;
  username: string | null;
  firstName: string | null;
}

export interface TelegramLinkChallengePayload {
  code: string;
  secret: string;
  deepLink: string | null;
  slot: number;
  expiresAt: Date;
  graceExpiresAt: Date;
}

export type TelegramChallengeConsumeStatus =
  | "PENDING"
  | "PENDING_EXISTS"
  | "EXPIRED"
  | "ALREADY_LINKED"
  | "CONFLICT";

export interface TelegramChallengeConsumeResult {
  status: TelegramChallengeConsumeStatus;
  candidate: { firstName: string | null; username: string | null; telegramUserIdMasked: string } | null;
}

export interface TelegramOverview {
  enabled: boolean;
  state: "UNLINKED" | "PENDING" | "ACTIVE" | "PAUSED" | "BLOCKED" | "REVOKED";
  botUsername: string | null;
  link: {
    firstName: string | null;
    username: string | null;
    telegramUserIdMasked: string;
    consentAt: string | null;
    linkVersion: number;
  } | null;
  candidate: { firstName: string | null; username: string | null; telegramUserIdMasked: string } | null;
  pendingExpiresAt: string | null;
  sessionExpiresAt: string | null;
  subscriptions: TelegramSubscriptionView[];
  contestOptions: TelegramContestOption[];
}

export interface TelegramSubscriptionView {
  contestId: string;
  leagueId: string;
  season: string;
  squadId: string | null;
  providerSquadId: string | null;
  sourcePreference: string;
  enabled: boolean;
}

export interface TelegramContestOption {
  contestId: string;
  name: string;
  season: string;
  squads: Array<{ id: string; name: string }>;
}

export interface TelegramSubscriptionInput {
  contestId: string;
  squadId?: string | null;
  providerSquadId?: string | null;
  sourcePreference?: string;
  enabled?: boolean;
}

const SOURCE_PREFERENCES = new Set(["SPORTS_PUBLISHED", "SITE_SAVED"]);

function maskTelegramUserId(value: string): string {
  const tail = value.slice(-4);
  return `••••${tail}`;
}

function requireSecretKey(): string {
  const key = telegramLinkSecret();
  if (!key) throw new TelegramLinkError("TELEGRAM_NOT_CONFIGURED", "Telegram linking is not configured.", 503);
  return key;
}

export async function loadTelegramOverview(prisma: PrismaClient, userId: string): Promise<TelegramOverview> {
  const [link, openSession, squads] = await Promise.all([
    prisma.telegramLink.findUnique({ where: { userId }, include: { subscriptions: { orderBy: { contestId: "asc" } } } }),
    prisma.telegramLinkSession.findFirst({
      where: { userId, state: { in: ["OPEN", "PENDING"] }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.userFantasySquad.findMany({
      where: { userId },
      select: { id: true, name: true, contestId: true, leagueId: true, season: true, contest: { select: { name: true } } },
      orderBy: [{ leagueId: "asc" }, { season: "asc" }, { name: "asc" }]
    })
  ]);

  const contestOptionsById = new Map<string, TelegramContestOption>();
  for (const squad of squads) {
    const option = contestOptionsById.get(squad.contestId) ?? {
      contestId: squad.contestId,
      name: squad.contest.name,
      season: squad.season,
      squads: []
    };
    option.squads.push({ id: squad.id, name: squad.name });
    contestOptionsById.set(squad.contestId, option);
  }

  const state = (link?.state as TelegramOverview["state"] | undefined) ?? "UNLINKED";
  const isPending = state === "PENDING";
  return {
    enabled: true,
    state,
    botUsername: telegramBotUsername(),
    link: link && !isPending
      ? {
          firstName: link.firstName,
          username: link.username,
          telegramUserIdMasked: maskTelegramUserId(link.telegramUserId),
          consentAt: link.consentAt?.toISOString() ?? null,
          linkVersion: link.linkVersion
        }
      : null,
    candidate: isPending
      ? {
          firstName: link?.firstName ?? null,
          username: link?.username ?? null,
          telegramUserIdMasked: maskTelegramUserId(link?.telegramUserId ?? "0000")
        }
      : null,
    pendingExpiresAt: isPending ? link?.pendingExpiresAt?.toISOString() ?? null : null,
    sessionExpiresAt: openSession?.expiresAt.toISOString() ?? null,
    subscriptions: (link?.subscriptions ?? []).map((subscription) => ({
      contestId: subscription.contestId,
      leagueId: subscription.leagueId.toString(),
      season: subscription.season,
      squadId: subscription.squadId,
      providerSquadId: subscription.providerSquadId,
      sourcePreference: subscription.sourcePreference,
      enabled: subscription.enabled
    })),
    contestOptions: [...contestOptionsById.values()]
  };
}

export async function createTelegramLinkSession(prisma: PrismaClient, userId: string, now = new Date()) {
  const existing = await prisma.telegramLinkSession.findFirst({
    where: { userId, state: "OPEN", expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" }
  });
  if (existing) return existing;
  await prisma.telegramLinkSession.updateMany({ where: { userId, state: "OPEN" }, data: { state: "EXPIRED" } });
  return prisma.telegramLinkSession.create({
    data: { userId, state: "OPEN", expiresAt: new Date(now.getTime() + TELEGRAM_SESSION_TTL_MS) }
  });
}

export async function issueTelegramLinkChallenge(
  prisma: PrismaClient,
  input: { userId: string; now?: Date; sessionId?: string }
): Promise<TelegramLinkChallengePayload> {
  const key = requireSecretKey();
  const now = input.now ?? new Date();
  const session = input.sessionId
    ? await prisma.telegramLinkSession.findFirst({ where: { id: input.sessionId, userId: input.userId } })
    : await createTelegramLinkSession(prisma, input.userId, now);
  if (!session) throw new TelegramLinkError("LINK_SESSION_NOT_FOUND", "Link session not found.", 404);
  if (session.expiresAt <= now) throw new TelegramLinkError("LINK_SESSION_EXPIRED", "Link session expired.", 410);
  if (session.state !== "OPEN") throw new TelegramLinkError("LINK_SESSION_PENDING", "Confirm or cancel the pending Telegram candidate first.", 409);

  const slot = telegramCodeSlot(now);
  const code = deriveTelegramChallengeCode(key, session.id, slot);
  const secret = deriveTelegramChallengeSecret(key, session.id, slot);
  const codeDigestValue = normalizeTelegramLinkCode(code) ?? code;
  const slotStart = slot * TELEGRAM_CODE_SLOT_MS;
  const expiresAt = new Date(slotStart + TELEGRAM_CODE_SLOT_MS);
  const graceExpiresAt = new Date(slotStart + TELEGRAM_CODE_SLOT_MS + TELEGRAM_CODE_GRACE_MS);
  const challenge = await prisma.telegramLinkChallenge.upsert({
    where: { sessionId_slot: { sessionId: session.id, slot } },
    create: {
      sessionId: session.id,
      slot,
      codeDigest: digestTelegramSecret("code", codeDigestValue, key),
      secretDigest: digestTelegramSecret("secret", secret, key),
      expiresAt: graceExpiresAt
    },
    update: {}
  });
  if (challenge.expiresAt <= now) throw new TelegramLinkError("LINK_CODE_EXPIRED", "Link code expired.", 410);
  const botUsername = telegramBotUsername();
  return {
    code,
    secret,
    deepLink: botUsername ? `https://t.me/${botUsername}?start=${secret}` : null,
    slot,
    expiresAt,
    graceExpiresAt: challenge.expiresAt
  };
}

export async function consumeTelegramChallenge(
  prisma: PrismaClient,
  input: { kind: "code" | "secret"; value: string; identity: TelegramIdentity; now?: Date }
): Promise<TelegramChallengeConsumeResult> {
  const key = requireSecretKey();
  const now = input.now ?? new Date();
  const normalizedValue = input.kind === "code" ? normalizeTelegramLinkCode(input.value) ?? input.value : input.value;
  const digest = digestTelegramSecret(input.kind, normalizedValue, key);
  return prisma.$transaction(async (tx) => {
    const challenge = await tx.telegramLinkChallenge.findFirst({
      where: input.kind === "code" ? { codeDigest: digest } : { secretDigest: digest },
      include: { session: true }
    });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= now) return { status: "EXPIRED", candidate: null };
    const session = challenge.session;
    if (session.expiresAt <= now || (session.state !== "OPEN" && session.state !== "PENDING")) {
      return { status: "EXPIRED", candidate: null };
    }

    const existingLink = await tx.telegramLink.findUnique({ where: { userId: session.userId } });
    if (existingLink && existingLink.telegramUserId === input.identity.telegramUserId && existingLink.state === "PENDING") {
      return { status: "PENDING_EXISTS", candidate: null };
    }
    if (existingLink && existingLink.state !== "REVOKED") {
      return { status: "ALREADY_LINKED", candidate: null };
    }
    const otherLink = await tx.telegramLink.findUnique({ where: { telegramUserId: input.identity.telegramUserId } });
    if (otherLink && otherLink.userId !== session.userId && otherLink.state !== "REVOKED") {
      return { status: "CONFLICT", candidate: null };
    }

    await tx.telegramLink.deleteMany({
      where: {
        state: "REVOKED",
        OR: [{ userId: session.userId }, { telegramUserId: input.identity.telegramUserId }]
      }
    });

    await tx.telegramLink.create({
      data: {
        userId: session.userId,
        telegramUserId: input.identity.telegramUserId,
        chatId: input.identity.chatId,
        username: input.identity.username,
        firstName: input.identity.firstName,
        state: "PENDING",
        linkSessionId: session.id,
        linkVersion: (existingLink?.linkVersion ?? 0) + 1,
        pendingExpiresAt: new Date(now.getTime() + TELEGRAM_PENDING_TTL_MS)
      }
    });
    await tx.telegramLinkChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } });
    await tx.telegramLinkChallenge.updateMany({
      where: { sessionId: session.id, id: { not: challenge.id }, consumedAt: null },
      data: { consumedAt: now }
    });
    await tx.telegramLinkSession.update({ where: { id: session.id }, data: { state: "PENDING" } });
    return {
      status: "PENDING",
      candidate: {
        firstName: input.identity.firstName,
        username: input.identity.username,
        telegramUserIdMasked: maskTelegramUserId(input.identity.telegramUserId)
      }
    };
  });
}

export async function confirmTelegramLink(
  prisma: PrismaClient,
  input: { userId: string; approve: boolean; now?: Date }
): Promise<{ status: "ACTIVE" | "CANCELLED" | "EXPIRED" | "NOT_PENDING" }> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const link = await tx.telegramLink.findUnique({ where: { userId: input.userId } });
    if (!link || link.state !== "PENDING") return { status: "NOT_PENDING" };
    if (!link.linkSessionId || (link.pendingExpiresAt && link.pendingExpiresAt <= now)) {
      await tx.telegramLink.delete({ where: { id: link.id } });
      if (link.linkSessionId) await tx.telegramLinkSession.updateMany({ where: { id: link.linkSessionId }, data: { state: "EXPIRED" } });
      return { status: "EXPIRED" };
    }
    if (!input.approve) {
      await tx.telegramLink.delete({ where: { id: link.id } });
      await tx.telegramLinkSession.updateMany({ where: { id: link.linkSessionId }, data: { state: "CANCELLED" } });
      return { status: "CANCELLED" };
    }
    await tx.telegramLink.update({ where: { id: link.id }, data: { state: "ACTIVE", consentAt: now } });
    await tx.telegramLinkSession.updateMany({ where: { id: link.linkSessionId }, data: { state: "CONSUMED" } });
    return { status: "ACTIVE" };
  });
}

export async function setTelegramLinkPaused(
  prisma: PrismaClient,
  input: { userId: string; paused: boolean }
): Promise<{ status: "PAUSED" | "ACTIVE" | "BLOCKED" | "NOT_LINKED" }> {
  const link = await prisma.telegramLink.findUnique({ where: { userId: input.userId } });
  if (!link || link.state === "REVOKED" || link.state === "PENDING") return { status: "NOT_LINKED" };
  if (link.state === "BLOCKED") return { status: "BLOCKED" };
  const state = input.paused ? "PAUSED" : "ACTIVE";
  await prisma.telegramLink.update({ where: { id: link.id }, data: { state } });
  return { status: state };
}

export async function unlinkTelegram(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const link = await tx.telegramLink.findUnique({ where: { userId } });
    if (!link) return;
    await tx.telegramLink.update({ where: { id: link.id }, data: { state: "REVOKED", pendingExpiresAt: null } });
    await tx.telegramSubscription.deleteMany({ where: { linkId: link.id } });
    await tx.telegramOutbox.updateMany({ where: { userId, state: { in: ["PENDING", "SENDING"] } }, data: { state: "CANCELLED" } });
    await tx.telegramLinkSession.updateMany({ where: { userId, state: { in: ["OPEN", "PENDING"] } }, data: { state: "CANCELLED" } });
  });
}

export async function markTelegramBlocked(prisma: PrismaClient, telegramUserId: string): Promise<void> {
  await prisma.telegramLink.updateMany({
    where: { telegramUserId, state: { in: ["ACTIVE", "PAUSED"] } },
    data: { state: "BLOCKED" }
  });
}

export async function expireTelegramLinkArtifacts(prisma: PrismaClient, now = new Date()): Promise<void> {
  await prisma.telegramLink.deleteMany({ where: { state: "PENDING", pendingExpiresAt: { lt: now } } });
  await prisma.telegramLinkSession.updateMany({
    where: { state: { in: ["OPEN", "PENDING"] }, expiresAt: { lt: now } },
    data: { state: "EXPIRED" }
  });
  const challengeCutoff = new Date(now.getTime() - 60 * 60 * 1000);
  await prisma.telegramLinkChallenge.deleteMany({ where: { expiresAt: { lt: challengeCutoff } } });
  await prisma.telegramLinkChallenge.deleteMany({ where: { consumedAt: { lt: challengeCutoff } } });
}

export async function replaceTelegramSubscriptions(
  prisma: PrismaClient,
  input: { userId: string; subscriptions: TelegramSubscriptionInput[] }
): Promise<TelegramSubscriptionView[]> {
  const link = await prisma.telegramLink.findUnique({ where: { userId: input.userId } });
  if (!link || (link.state !== "ACTIVE" && link.state !== "PAUSED")) {
    throw new TelegramLinkError("TELEGRAM_NOT_LINKED", "Link Telegram before choosing tournaments.", 409);
  }
  const normalized: Array<{
    contestId: string;
    leagueId: bigint;
    season: string;
    squadId: string | null;
    providerSquadId: string | null;
    sourcePreference: string;
    enabled: boolean;
  }> = [];
  const seen = new Set<string>();
  for (const subscription of input.subscriptions) {
    const contestId = subscription.contestId?.trim();
    if (!contestId || seen.has(contestId)) continue;
    seen.add(contestId);
    const squads = await prisma.userFantasySquad.findMany({
      where: { userId: input.userId, contestId },
      select: { id: true, leagueId: true, season: true },
      orderBy: { updatedAt: "desc" }
    });
    const contest = await prisma.fantasyContest.findUnique({ where: { id: contestId }, select: { id: true } });
    if (!contest || squads.length === 0) throw new TelegramLinkError("CONTEST_NOT_AVAILABLE", "Contest is not available for this user.", 404);
    const squadId = subscription.squadId?.trim() || null;
    const selectedSquad = squadId
      ? squads.find((squad) => squad.id === squadId)
      : squads.length === 1
        ? squads[0]!
        : null;
    if (!selectedSquad) throw new TelegramLinkError("SQUAD_REQUIRED", "Choose one of your squads for the contest.", 400);
    const sourcePreference = subscription.sourcePreference ?? "SPORTS_PUBLISHED";
    if (!SOURCE_PREFERENCES.has(sourcePreference)) throw new TelegramLinkError("BAD_SOURCE_PREFERENCE", "Unknown source preference.", 400);
    normalized.push({
      contestId,
      leagueId: selectedSquad.leagueId,
      season: selectedSquad.season,
      squadId: selectedSquad.id,
      providerSquadId: subscription.providerSquadId?.trim() || null,
      sourcePreference,
      enabled: subscription.enabled !== false
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const subscription of normalized) {
      await tx.telegramSubscription.upsert({
        where: { userId_contestId: { userId: input.userId, contestId: subscription.contestId } },
        create: { linkId: link.id, userId: input.userId, ...subscription },
        update: {
          squadId: subscription.squadId,
          providerSquadId: subscription.providerSquadId,
          sourcePreference: subscription.sourcePreference,
          enabled: subscription.enabled
        }
      });
    }
    const keep = normalized.map((subscription) => subscription.contestId);
    await tx.telegramSubscription.deleteMany({ where: { userId: input.userId, contestId: { notIn: keep } } });
  });

  const subscriptions = await prisma.telegramSubscription.findMany({ where: { userId: input.userId }, orderBy: { contestId: "asc" } });
  return subscriptions.map((subscription) => ({
    contestId: subscription.contestId,
    leagueId: subscription.leagueId.toString(),
    season: subscription.season,
    squadId: subscription.squadId,
    providerSquadId: subscription.providerSquadId,
    sourcePreference: subscription.sourcePreference,
    enabled: subscription.enabled
  }));
}
