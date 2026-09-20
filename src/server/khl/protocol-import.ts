/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#protocols */
import type { PrismaClient } from "@prisma/client";
import { lockValidLease, type KhlLease } from "./lease";
import { storeKhlRaw } from "./retention";
import { randomUUID } from "node:crypto";
import { parseKhlProtocol } from "@/providers/khl-mobile/protocol";
import { hockeyTeamLinks } from "@/providers/sports-ru-hockey/teams";
import { bindExternalEntity } from "./data-layer";
import { importProtocols, type ProtocolInput } from "./observations";

const nameKey = (s: string) => s.replace(/\s+(?:19|20)\d{2}(?:\s+нап)?$/g, "").replace(/(?:^|\s)[А-ЯЁ][а-яё]{0,3}\./g, "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).sort().join(" ");
export function protocolIdentityMatches(player: { playerId: string | null; name: string; clubId: string; position: string; birthDate: Date | null }, row: { name: string; position: string; birthDate?: string }, mappedId: string | null | undefined, fantasyClub: string | undefined) {
  if (!player.playerId) return false;
  const birthDate = player.birthDate?.toISOString().slice(0, 10);
  if (birthDate && row.birthDate && birthDate !== row.birthDate) return false;
  // A verified canonical ID survives transfers and fantasy position differences.
  if (mappedId) return player.playerId === mappedId;
  if (player.clubId !== fantasyClub || player.position !== row.position) return false;
  const sharedName = nameKey(player.name).split(' ').some(token => token.length >= 3 && nameKey(row.name).split(' ').includes(token));
  return birthDate && row.birthDate ? birthDate === row.birthDate && sharedName : nameKey(player.name) === nameKey(row.name);
}
export async function importKhlProtocolHtml(db: PrismaClient, input: { contestId: string; officialMatchId: string; html: string; observedAt: Date; dryRun?: boolean; lease?: KhlLease }) {
  const contest = await db.khlContest.findUniqueOrThrow({ where: { id: input.contestId } });
  const mapping = await db.khlExternalEntityMap.findFirstOrThrow({ where: { provider: "KHL", entityType: "match", externalId: input.officialMatchId, match: { seasonId: contest.seasonId } }, include: { match: { include: { home: true, away: true } } } });
  const match = mapping.match!;
  if (match.status !== "FINAL" || match.startsAt > input.observedAt) throw new Error("PROTOCOL_MATCH_NOT_FINAL");
  const parsed = parseKhlProtocol(input.html, input.officialMatchId, mapping.providerScope);
  const source = `https://www.khl.ru/game/${mapping.providerScope}/${input.officialMatchId}/protocol/`;
  const [pool, teams, identities] = await Promise.all([
    db.khlFantasyPlayer.findMany({ where: { contestId: contest.id }, include: { player: true }, take: 1000 }),
    db.khlExternalEntityMap.findMany({ where: { provider: "KHL", entityType: "team", teamId: { in: [match.homeId, match.awayId] } } }),
    db.khlExternalEntityMap.findMany({ where: { provider: "KHL", entityType: "player", providerScope: "global" }, select: { externalId: true, playerId: true }, take: 2001 })
  ]);
  if (identities.length > 2000) throw new Error('PROTOCOL_IDENTITY_LIMIT');
  const rows: ProtocolInput[] = [], unlinked: string[] = [], newLinks: { officialPlayerId: string; playerId: string; name: string; evidence: string }[] = [];
  for (const r of parsed.rows) {
    const team = [match.home, match.away].find(t => nameKey(t.name) === nameKey(r.teamName));
    if (!team) throw new Error("PROTOCOL_CLUB_MISMATCH");
    const officialTeam = teams.find(t => t.teamId === team.id)?.externalId;
    const fantasyClub = hockeyTeamLinks.find(t => t[1] === officialTeam)?.[0];
    const mapped = identities.find(m => m.externalId === r.officialPlayerId)?.playerId;
    const candidates = pool.filter(p => protocolIdentityMatches({ ...p, name: p.player?.name ?? p.name, birthDate: p.player?.birthDate ?? null }, r, mapped, fantasyClub));
    if (candidates.length !== 1) { unlinked.push(`${r.officialPlayerId}:${r.name}`); continue; }
    const playerId = candidates[0].playerId!;
    if (!mapped && (identities.some(m => m.playerId === playerId && m.externalId !== r.officialPlayerId) || r.birthDate && parsed.rows.filter(other => other.teamName === r.teamName && other.position === r.position && other.birthDate === r.birthDate).length > 1)) { unlinked.push(`${r.officialPlayerId}:${r.name}:IDENTITY_CONFLICT`); continue; }
    if (!mapped) newLinks.push({ officialPlayerId: r.officialPlayerId, playerId, name: r.name, evidence: candidates[0].player?.birthDate && r.birthDate ? `independent Sports/official DOB ${r.birthDate}, unique verified club and position` : 'exact full name, position and verified match club' });
    const { officialPlayerId: _id, name: _name, teamName: _team, position: _position, birthDate: _birthDate, ...facts } = r;
    rows.push({ ...facts, playerId, matchId: match.id, clubAtMatchId: team.id, started: null, fullGame: null });
  }
  if (new Set(rows.map(r => r.playerId)).size !== rows.length) throw new Error('PROTOCOL_DUPLICATE_CANONICAL_PLAYER');
  if (input.dryRun) return { matched: rows.length, unlinked, newLinks, attackTimeAvailable: parsed.attackTimeAvailable };
  await db.$transaction(async tx => { await lockValidLease(tx, input.lease);
  for (const link of newLinks) await bindExternalEntity(tx, { provider: "KHL", entityType: "player", providerScope: "global", externalId: link.officialPlayerId, canonicalId: link.playerId, evidence: `${source}; ${link.evidence}: ${link.name}`, verifiedAt: input.observedAt });
  });
  const result = rows.length ? await importProtocols(db, { seasonId: contest.seasonId, source, rows, batchId: randomUUID(), observedAt: input.observedAt, availableAt: input.observedAt, lease: input.lease }) : { changed: 0 };
  await storeKhlRaw(db, { provider: "KHL_PROTOCOL", scope: `${mapping.providerScope}:${input.officialMatchId}`, parserVersion: "khl-protocol-v2", raw: Buffer.from(input.html), now: input.observedAt });
  await db.$transaction(async tx => {
    await lockValidLease(tx, input.lease);
    const key = { provider: "KHL_PROTOCOL", scope: `${input.contestId}:${input.officialMatchId}`, jobType: "MATCH" };
    const cursor = { matched: rows.length, unlinked, attackTimeAvailable: parsed.attackTimeAvailable };
    await tx.khlProviderCheckpoint.upsert({ where: { provider_scope_jobType: key }, create: { ...key, cursor, completedAt: input.observedAt }, update: { cursor, completedAt: input.observedAt } });
  });
  return { ...result, matched: rows.length, unlinked, newLinks, attackTimeAvailable: parsed.attackTimeAvailable };
}
