/** @spec spec://modules/khl/INFRA-002-khl-storage-and-api#schema */
import type { PrismaClient } from '@prisma/client';
import type { KhlHistoricalStats, KhlProtocolArchiveStats, KhlPosition } from '@/khl/contracts';
import { validateProtocolArchive } from '@/khl/protocol-archive';
import { previousHockeySeason } from '@/providers/sports-ru-hockey/history';
import { importHistoricalSeason } from './historical-season';
import { bindExternalEntity } from './data-layer';

export function protocolOnlyHistory(entry: KhlProtocolArchiveStats, seasonKey: string): KhlHistoricalStats {
  validateProtocolArchive(entry);
  return { seasonKey, source: entry.source, sourceKind: 'KHL_PROTOCOL', asOf: entry.asOf, games: entry.games, dnp: 0, totals: entry.totals, officialFp: { sum: 0, count: 0 }, otherPoints: { sum: 0, count: 0 }, protocolStats: entry };
}

const nameKey = (s: string) => s.replace(/\s+(?:19|20)\d{2}(?:\s+нап)?$/g, '').replace(/(?:^|\s)[А-ЯЁ][а-яё]{0,3}\./g, '').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).sort().join(' ');
export function matchingArchiveIdentity(entry: KhlProtocolArchiveStats & {name?:string;position?:KhlPosition}, candidate: {name:string;position:string;stats:KhlHistoricalStats}) {
  return Boolean(entry.name && entry.position && nameKey(entry.name).split(' ').length >= 2 && nameKey(entry.name)===nameKey(candidate.name) && entry.position===candidate.position && entry.games===candidate.stats.games && entry.games>0
    && (['goals','assists','plusMinus','pimMinutes'] as const).every(key=>entry.totals[key].knownGames===entry.games && candidate.stats.totals[key].knownGames===entry.games && entry.totals[key].value===candidate.stats.totals[key].value));
}

export interface ProtocolArchiveBundle {
  version: 1; seasonKey: string; officialSeasonId: string; observedAt: string;
  matches: { id: string; startsAt: string }[];
  entries: (KhlProtocolArchiveStats & {name?:string;position?:KhlPosition})[];
}
export async function importProtocolArchive(db: PrismaClient, contestId: string, bundle: ProtocolArchiveBundle) {
  const contest=await db.khlContest.findUniqueOrThrow({where:{id:contestId},include:{season:true}});
  const seasonKey=previousHockeySeason(contest.season.seasonKey), year=Number(seasonKey.slice(0,4));
  if(bundle.version!==1 || bundle.seasonKey!==seasonKey || !/^\d{1,12}$/.test(bundle.officialSeasonId) || !Number.isFinite(Date.parse(bundle.observedAt)) || Date.parse(bundle.observedAt)>Date.now()
    || !Array.isArray(bundle.matches) || bundle.matches.length>1000 || !bundle.matches.length || !Array.isArray(bundle.entries) || bundle.entries.length>1500
    || new Set(bundle.entries.map(e=>e.officialPlayerId)).size!==bundle.entries.length || new Set(bundle.matches.map(m=>m.id)).size!==bundle.matches.length
    || bundle.matches.some(m=>!/^\d{1,12}$/.test(m.id) || !Number.isFinite(Date.parse(m.startsAt)) || Date.parse(m.startsAt)<Date.UTC(year,7,1) || Date.parse(m.startsAt)>=Date.UTC(year+1,6,1))) throw new Error('ARCHIVE_PROTOCOL_BUNDLE_INVALID');
  const ids=new Set(bundle.matches.map(m=>m.id));
  for(const entry of bundle.entries){validateProtocolArchive(entry);if(entry.officialSeasonId!==bundle.officialSeasonId || Date.parse(entry.asOf!)>Date.parse(bundle.observedAt) || entry.matchIds.some(id=>!ids.has(id)) || entry.name!==undefined && (typeof entry.name!=='string' || entry.name.length>200) || entry.position!==undefined && !['G','D','F'].includes(entry.position))throw new Error('ARCHIVE_PROTOCOL_SCOPE_INVALID');}
  const mappings=await db.khlExternalEntityMap.findMany({where:{provider:'KHL',entityType:'player',providerScope:'global',externalId:{in:bundle.entries.map(e=>e.officialPlayerId)},player:{fantasyPlayers:{some:{contestId,active:true}}}},take:1500});
  const histories=await db.khlHistoricalSeason.findMany({where:{seasonKey,player:{fantasyPlayers:{some:{contestId,active:true}}}},include:{player:{include:{fantasyPlayers:{where:{contestId,active:true},take:2}}}},take:1000});
  let imported=0,changed=0,newLinks=0;
  const linkedPlayers=new Set(mappings.flatMap(m=>m.playerId?[m.playerId]:[]));
  for(const entry of bundle.entries){let map=mappings.find(m=>m.externalId===entry.officialPlayerId);
    if(!map && entry.name){
      const candidates=histories.filter(h=>!linkedPlayers.has(h.playerId) && h.player.fantasyPlayers.length===1 && matchingArchiveIdentity(entry,{name:h.player.name,position:h.player.fantasyPlayers[0].position,stats:h.aggregates as unknown as KhlHistoricalStats}));
      const ambiguous=bundle.entries.filter(e=>e.name && nameKey(e.name)===nameKey(entry.name!)).length!==1;
      if(candidates.length===1 && !ambiguous){map=await db.$transaction(tx=>bindExternalEntity(tx,{provider:'KHL',entityType:'player',providerScope:'global',externalId:entry.officialPlayerId,canonicalId:candidates[0].playerId,evidence:`${entry.source}; ${seasonKey}; exact full name, position, GP/G/A/PM/PIM match Sports history`,verifiedAt:new Date(bundle.observedAt)}));linkedPlayers.add(candidates[0].playerId);newLinks++;}
    }
    if(!map?.playerId)continue;
    const history=histories.find(h=>h.playerId===map.playerId);
    if(!history && !entry.games)continue;
    const old=history?.aggregates as unknown as KhlHistoricalStats | undefined;
    const aggregates=old && old.sourceKind !== 'KHL_PROTOCOL' ? {...old,protocolStats:entry} : protocolOnlyHistory(entry,seasonKey);
    if(await importHistoricalSeason(db,{playerId:map.playerId,providerSeasonId:history?.providerSeasonId ?? entry.officialSeasonId,aggregates,observedAt:new Date(bundle.observedAt),protocolOnly:true}))changed++;
    imported++;
  }
  return {imported,changed,newLinks,unmapped:bundle.entries.length-imported,seasonKey,matches:bundle.matches.length};
}
