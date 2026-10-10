/** @spec spec://common/INFRA-006-continuous-deployment#runtime */
import { PrismaClient } from "@prisma/client";

import { hasDatabaseUrl, isDatabaseConfigured } from "@/lib/database-url";
import { recordSqlQuery } from "@/server/runtime-diagnostics";

function createPrismaClient() {
  const client = new PrismaClient({ log: [{ emit: "event", level: "query" }, "error"] });
  client.$on("query", event => recordSqlQuery(event.query, event.duration));
  return client;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient();

// Production instrumentation and route bundles must share the same pool too.
globalForPrisma.prisma = prisma;

export { hasDatabaseUrl, isDatabaseConfigured };
