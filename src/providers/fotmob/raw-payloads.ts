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
  if (input.entityType === "FIXTURE_DETAILS" || input.endpoint === "getFixtureDetails") {
    throw new Error("FotMob match details must be stored through core_data.raw_match_payloads, not MacheteRawPayload.");
  }

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
