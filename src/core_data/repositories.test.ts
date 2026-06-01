import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { CoreTeamRepository } from "./repositories";

test("core team repository does not overwrite a named team with a FotMob placeholder", async () => {
  const upserts: unknown[] = [];
  const prisma = {
    coreTeam: {
      async upsert(input: unknown) {
        upserts.push(input);
        return {};
      }
    }
  } as unknown as PrismaClient;

  const repository = new CoreTeamRepository(prisma);
  await repository.upsert({
    id: 9879n,
    name: "FotMob team 9879",
    country: null,
    ccode: null,
    rawRef: "9879"
  });
  await repository.upsert({
    id: 9879n,
    name: "Fulham",
    country: "England",
    ccode: "ENG",
    rawRef: "9879"
  });

  assert.deepEqual(upserts[0], {
    where: { id: 9879n },
    update: {
      rawRef: "9879",
      source: "fotmob"
    },
    create: {
      id: 9879n,
      name: "FotMob team 9879",
      country: null,
      ccode: null,
      rawRef: "9879",
      source: "fotmob"
    }
  });
  assert.deepEqual(upserts[1], {
    where: { id: 9879n },
    update: {
      name: "Fulham",
      country: "England",
      ccode: "ENG",
      rawRef: "9879",
      source: "fotmob"
    },
    create: {
      id: 9879n,
      name: "Fulham",
      country: "England",
      ccode: "ENG",
      rawRef: "9879",
      source: "fotmob"
    }
  });
});
