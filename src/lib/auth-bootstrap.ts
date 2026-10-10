/** @spec spec://common/FEAT-009-session-authentication#bootstrap */
import { Prisma, UserRole, type PrismaClient } from "@prisma/client";

type BootstrapClient = Pick<PrismaClient, "$queryRaw" | "$executeRaw" | "user">;
const bootstrapId = "first-admin";

export async function isAdminBootstrapRequired(prisma: BootstrapClient) {
  const rows = await prisma.$queryRaw<Array<{ completedAt: Date | null }>>`
    SELECT "completedAt" FROM "AuthBootstrapState" WHERE id = ${bootstrapId}
  `;
  if (rows[0]?.completedAt) return false;
  return (await prisma.user.count({ where: { role: UserRole.ADMIN, passwordHash: { not: null } } })) === 0;
}

/** The caller owns the transaction; completion and account creation commit together. */
export async function completeAdminBootstrap(
  tx: Prisma.TransactionClient,
  input: { email: string; name: string | null; passwordHash: string }
) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${bootstrapId}, 0))`);
  if (!(await isAdminBootstrapRequired(tx))) return null;
  const user = await tx.user.upsert({
    where: { email: input.email },
    create: { ...input, role: UserRole.ADMIN, isActive: true, lastLoginAt: new Date() },
    update: { name: input.name, passwordHash: input.passwordHash, role: UserRole.ADMIN, isActive: true, lastLoginAt: new Date() }
  });
  await tx.$executeRaw`
    INSERT INTO "AuthBootstrapState" (id, "completedAt", "createdAt")
    VALUES (${bootstrapId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET "completedAt" = EXCLUDED."completedAt"
  `;
  return user;
}
