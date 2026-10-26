/** @spec spec://common/FEAT-009-session-authentication#bootstrap */
import { prisma } from "@/lib/db";
import { hashPassword, normalizeEmail } from "@/lib/auth";

async function main() {
  const [role] = await prisma.$queryRaw<Array<{ privileged: boolean }>>`SELECT rolsuper AS privileged FROM pg_roles WHERE rolname = current_user`;
  if (!role?.privileged) throw new Error("OPERATOR_IDENTITY_REQUIRED");
  const email = process.argv[2] ? normalizeEmail(process.argv[2]) : "";
  if (!email || process.stdin.isTTY) throw new Error("Usage: privileged operator pipes a password to recover-admin.ts <existing-email>.");
  let password = "";
  for await (const chunk of process.stdin) password += chunk;
  password = password.replace(/\r?\n$/, "");
  if (password.length < 8 || password.length > 1024) throw new Error("Password must contain 8–1024 characters.");
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { email }, data: { role: "ADMIN", isActive: true, passwordHash } });
    await tx.$executeRaw`INSERT INTO "AuthBootstrapState" (id, "completedAt", "createdAt")
      VALUES ('first-admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET "completedAt" = COALESCE("AuthBootstrapState"."completedAt", EXCLUDED."completedAt")`;
  });
  console.info(JSON.stringify({ action: "admin-access-recovered", completedAt: new Date().toISOString() }));
}
main().finally(() => prisma.$disconnect());
