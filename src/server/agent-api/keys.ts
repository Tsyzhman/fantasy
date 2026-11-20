/** @spec spec://modules/agents/FEAT-016-personal-agent-api#keys */
import { createHash, randomBytes } from "node:crypto";
import { apiError } from "@/lib/api-handler";
import type { AuthUser } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { agentScopes, type AgentActor } from "./contract";

export const activeKeyLimit = 20;
const pageSize = 20;
const publicFields = {
  id: true, name: true, scopes: true, createdAt: true,
  expiresAt: true, revokedAt: true, lastUsedAt: true
} as const;

type KeyRow = {
  id: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};

function knownScopes(values: readonly unknown[]) {
  return agentScopes.filter(scope => values.includes(scope));
}

function publicKey(row: KeyRow) {
  const status = row.revokedAt ? "revoked" : row.expiresAt.getTime() <= Date.now() ? "expired" : "active";
  return {
    id: row.id,
    name: row.name,
    scopes: knownScopes(row.scopes),
    status,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null
  };
}

export type AgentKeySummary = ReturnType<typeof publicKey>;
export type AgentKeyPage = Awaited<ReturnType<typeof listAgentKeys>>;

function secretHash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function invalidKey() {
  return apiError("UNAUTHORIZED", "A valid personal agent key is required.", 401);
}

export async function createAgentKey(userId: string, input: Record<string, unknown>) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw apiError("INVALID_NAME", "Choose a key name of 1 to 80 characters.", 400);
  }
  const selected = input.scopes;
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > agentScopes.length) {
    throw apiError("INVALID_SCOPES", "Choose at least one valid permission.", 400);
  }
  const scopes = knownScopes(selected);
  if (scopes.length !== selected.length) {
    throw apiError("INVALID_SCOPES", "Each permission must be valid and appear once.", 400);
  }
  const expiry = input.expiresAt;
  const timestamp = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (typeof expiry !== "string" || !timestamp.test(expiry)) {
    throw apiError("INVALID_EXPIRY", "Provide an ISO date and time with a time zone.", 400);
  }
  const expiresAt = new Date(expiry);
  const calendarDay = expiry.slice(0, 10);
  const midnight = new Date(calendarDay + "T00:00:00Z");
  if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(midnight.getTime()) || !midnight.toISOString().startsWith(calendarDay)) {
    throw apiError("INVALID_EXPIRY", "Choose a valid calendar date.", 400);
  }

  const secret = `fs_agent_${randomBytes(32).toString("base64url")}`;
  const key = await prisma.$transaction(async tx => {
    // Every creator for this owner takes the same lock before counting active keys.
    const owners = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "User" WHERE id = ${userId} AND "isActive" FOR UPDATE
    `;
    if (!owners.length) throw apiError("UNAUTHORIZED", "An active account is required.", 401);
    const now = new Date();
    if (expiresAt <= now) throw apiError("INVALID_EXPIRY", "Choose a future expiry time.", 400);
    const count = await tx.agentKey.count({ where: { userId, revokedAt: null, expiresAt: { gt: now } } });
    if (count >= activeKeyLimit) throw apiError("KEY_LIMIT", "Revoke an active key before creating another.", 409);
    return tx.agentKey.create({
      data: { userId, name, scopes, expiresAt, secretHash: secretHash(secret) },
      select: publicFields
    });
  });
  return { key: publicKey(key), secret };
}

export async function listAgentKeys(userId: string, cursor?: string | null) {
  let before: { id: string; createdAt: Date } | null = null;
  if (cursor != null) {
    if (cursor.length <= 128) {
      before = await prisma.agentKey.findFirst({ where: { userId, id: cursor }, select: { id: true, createdAt: true } });
    }
    if (!before) throw apiError("INVALID_CURSOR", "Invalid key list cursor.", 400);
  }
  const rows = await prisma.agentKey.findMany({
    where: {
      userId,
      ...(before && { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] })
    },
    select: publicFields,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1
  });
  const keys = rows.slice(0, pageSize).map(publicKey);
  return { keys, nextCursor: rows.length > pageSize ? keys[pageSize - 1].id : null };
}

export async function revokeAgentKey(userId: string, id: string) {
  const changed = await prisma.agentKey.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (changed.count === 0 && !await prisma.agentKey.findFirst({ where: { id, userId }, select: { id: true } })) {
    throw apiError("NOT_FOUND", "Key not found.", 404);
  }
}

/** @spec spec://modules/agents/FEAT-016-personal-agent-api#authorization */
export async function authenticateAgentKey(request: Request): Promise<AgentActor> {
  const match = /^Bearer (fs_agent_[A-Za-z0-9_-]{43})$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) throw invalidKey();
  if (!isDatabaseConfigured()) throw apiError("DATABASE_NOT_CONFIGURED", "Agent access is unavailable.", 503);

  // Prisma stores DateTime as a UTC timestamp without time zone. Compare in UTC even in a local-time database.
  const [row] = await prisma.$queryRaw<(AuthUser & { keyId: string; scopes: string[] })[]>`
    UPDATE "AgentKey" AS k SET "lastUsedAt" = GREATEST(k."lastUsedAt", statement_timestamp() AT TIME ZONE 'UTC')
    FROM "User" AS u
    WHERE k."secretHash" = CAST(${secretHash(match[1])} AS CHAR(64)) AND k."revokedAt" IS NULL
      AND k."expiresAt" > (statement_timestamp() AT TIME ZONE 'UTC') AND u.id = k."userId" AND u."isActive"
    RETURNING k.id AS "keyId", k.scopes, u.id, u.email, u.name, u.role, u.franchise, u."isActive"
  `;
  if (!row) throw invalidKey();
  const { keyId, scopes, ...user } = row;
  return { keyId, user, scopes: knownScopes(scopes) };
}

// A body may take time to arrive. Resolve the owner and grants again at the operation boundary.
export async function currentAgentActor(identity: AgentActor): Promise<AgentActor> {
  const key = await prisma.agentKey.findFirst({
    where: { id: identity.keyId, userId: identity.user.id, revokedAt: null, expiresAt: { gt: new Date() }, user: { isActive: true } },
    select: {
      id: true, scopes: true,
      user: { select: { id: true, email: true, name: true, role: true, franchise: true, isActive: true } }
    }
  });
  if (!key) throw invalidKey();
  return { keyId: key.id, user: key.user, scopes: knownScopes(key.scopes) };
}
