/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#mapping */
import { normalizeLineupIdentity } from "./probable-lineup-parsers";
import { probableLineupTeamScore } from "./probable-lineup-sync";
import type { SourcePlayer, SourceTeam } from "../providers/sorareinside/client";
import { SORARE_TEAM_ALIASES } from "../providers/sorareinside/team-aliases";
import { REVIEWED_SORARE_PLAYER_IDS } from "../providers/sorareinside/reviewed-player-ids";

export type IdentityPlayer = { id: bigint; name: string; birthDate: Date | null };
export type IdentityTeam = { id: bigint; name: string; country: string | null };
const COUNTRIES: Record<string,string> = { ENG:"gb-eng", SCO:"gb-sct", FRA:"fr", GER:"de", ESP:"es", ITA:"it", POR:"pt", NED:"nl", RUS:"ru", TUR:"tr", BEL:"be", AUT:"at", GRE:"gr", DEN:"dk", SUI:"ch", NOR:"no", CRO:"hr", CZE:"cz", CYP:"cy", ISR:"il", SRB:"rs", UKR:"ua", POL:"pl", SWE:"se" };

export function resolveSourceTeam(source: SourceTeam, teams: IdentityTeam[], savedId?: bigint): IdentityTeam | null {
  if (savedId !== undefined) return teams.find(t=>t.id===savedId) ?? null;
  const alias=SORARE_TEAM_ALIASES[`${source.country}|${source.name}`];
  if(alias) {const matches=teams.filter(t=>t.name===alias);return matches.length===1?matches[0]:null;}
  const candidates = teams.filter(t => {
    const country = t.country === "WAL" ? "gb-wls" : t.country ? COUNTRIES[t.country.toUpperCase()] ?? t.country.toLowerCase() : null;
    return country === source.country && probableLineupTeamScore(source.name,t.name)>=0.98;
  });
  return candidates.length===1 ? candidates[0] : null;
}

export function resolveSourcePlayer(source: SourcePlayer, roster: IdentityPlayer[], savedId?: bigint): { player: IdentityPlayer | null; reason: string } {
  const reviewed=REVIEWED_SORARE_PLAYER_IDS[source.id];
  const knownId=savedId??reviewed?.playerId;
  if (knownId !== undefined) {
    if(savedId===undefined && source.birthDate!==reviewed.birthDate) return {player:null,reason:"REVIEWED_ID_BIRTH_DATE_CONFLICT"};
    const player=roster.find(p=>p.id===knownId);
    if (!player) return { player:null, reason:"ID_NOT_IN_ACTIVE_ROSTER" };
    if (source.birthDate && player.birthDate && source.birthDate!==player.birthDate.toISOString().slice(0,10)) return {player:null,reason:"BIRTH_DATE_CONFLICT"};
    return {player,reason:savedId===undefined?"REVIEWED_UUID":"PROVIDER_ID"};
  }
  const names = [source.name,source.slug.replace(/-\d{4}-\d{2}-\d{2}$/,"").replaceAll("-"," ")].map(normalizeLineupIdentity);
  const candidates=roster.filter(p=>names.includes(normalizeLineupIdentity(p.name)));
  const compatible=candidates.filter(p=>!source.birthDate || !p.birthDate || source.birthDate===p.birthDate.toISOString().slice(0,10));
  if (compatible.length===1) return {player:compatible[0],reason:"EXACT_NAME_IN_TEAM"};
  if(candidates.length>0) return {player:null,reason:compatible.length===0?"BIRTH_DATE_CONFLICT":"AMBIGUOUS"};
  // Birthday alone is insufficient: two different players can share a birthday.
  // Require a meaningful common name token as independent corroboration.
  const ignored=new Set(["de","del","dos","da","van","der","den","di","the","junior"]);
  const tokens=new Set(names.flatMap(n=>n.split(" ")).filter(n=>n.length>=3&&!ignored.has(n)));
  const birthdayCandidates=roster.filter(p=>source.birthDate && p.birthDate?.toISOString().slice(0,10)===source.birthDate);
  const corroborated=birthdayCandidates.filter(p=>normalizeLineupIdentity(p.name).split(" ").some(t=>tokens.has(t)));
  if(corroborated.length===1) return {player:corroborated[0],reason:"BIRTH_DATE_AND_NAME_IN_TEAM"};
  if(corroborated.length>1) return {player:null,reason:"AMBIGUOUS"};
  return {player:null,reason:candidates.length>0 && compatible.length===0 ? "BIRTH_DATE_CONFLICT" : compatible.length>1 ? "AMBIGUOUS" : "UNMAPPED"};
}

export { hasUpcomingSorareLineup } from "./sorareinside-protection";
