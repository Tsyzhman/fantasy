import { createHash } from "crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

export async function storeMacheteRawPayload(
  prisma: PrismaClient,
  input: {
    entityType: string;
    providerEntityId?: string | null;
    endpoint?: string | null;
    payload: unknown;
  }
) {
  const json = JSON.stringify(input.payload);
  return prisma.macheteRawPayload.create({
    data: {
      provider: "FOTMOB",
      entityType: input.entityType,
      providerEntityId: input.providerEntityId ?? null,
      endpoint: input.endpoint ?? null,
      payload: input.payload as Prisma.InputJsonValue,
      checksum: createHash("sha256").update(json).digest("hex")
    }
  });
}
