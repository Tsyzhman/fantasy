import type { PrismaClient } from "@prisma/client";

import { CORE_SCHEMA_VERSION, DEFAULT_PARSER_VERSION, payloadHash } from "./models";
import { RawPayloadRepository } from "./repositories";

export async function store_raw_match_payload(
  prisma: PrismaClient,
  input: {
    matchId: bigint;
    payload: unknown;
    isFinal: boolean;
    parserVersion?: string;
    schemaVersion?: string;
  }
) {
  const hash = payloadHash(input.payload);
  const repository = new RawPayloadRepository(prisma);

  return repository.upsert({
    matchId: input.matchId,
    payload: input.payload,
    payloadHash: hash,
    parserVersion: input.parserVersion ?? DEFAULT_PARSER_VERSION,
    schemaVersion: input.schemaVersion ?? CORE_SCHEMA_VERSION,
    isFinal: input.isFinal
  });
}

export async function get_raw_match_payload(prisma: PrismaClient, matchId: bigint) {
  return new RawPayloadRepository(prisma).find(matchId);
}

