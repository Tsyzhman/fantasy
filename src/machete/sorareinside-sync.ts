/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#root */
import { Prisma, type PrismaClient } from "@prisma/client";
import { SorareInsideClient, nearestTeamGames, type SourceLineup } from "../providers/sorareinside/client";
import { resolveSourcePlayer, resolveSourceTeam, type IdentityTeam } from "./sorareinside-identity";
import { applyProbableLineupTeamPlan, type ProbableLineupTeamPlan } from "./probable-lineup-sync";
import { enqueueCurrentXiTeamsSnapshotRefresh } from "./fantasy-player-pool-refresh-queue";
import { corroboratedSorareRosterRepair, loadSorareRosterEvidence, restoreSorareRosterMembers, sorareRosterIdentity,
  type SorareRosterRepair, type SorareRosterEvidence } from "./sorareinside-roster";

const PROVIDER="SORAREINSIDE";
const LEAGUE_COUNTRY: Record<string,string>={"47":"ENG","48":"ENG","53":"FRA","54":"GER","55":"ITA","57":"NED","61":"POR","63":"RUS","71":"TUR","87":"ESP"};
type Mapping={type:"TEAM"|"PLAYER";sourceId:string;internalId:bigint;matchedBy:string};
export type SorareTeamReport={leagueId:string;season:string;teamId:string;team:string;sourceTeamId?:string;fixtureId?:string;kickoff?:string;lineupId?:string|null;status:string;problems:string[];restoredRosterPlayerIds?:string[];players?:Array<{sourceId:string;name:string;playerId:string|null;reason:string}>};
export type SorareSyncReport={status:string;startedAt:string;finishedAt?:string;apply:boolean;teams:SorareTeamReport[];totals:Record<string,number>;rssMiB?:number};

export async function runSorareInsideSync(db:PrismaClient, client:SorareInsideClient, apply=false):Promise<SorareSyncReport> {
  // Hold one bounded lock connection; short flag transactions use the other pool
  // connections. CLI and the worker share this lock, including across replicas.
  return db.$transaction(async lock=> {
    const [row]=await lock.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_xact_lock(hashtext('sorareinside-sync')) AS locked`;
    if(!row.locked) return {status:"ALREADY_RUNNING",startedAt:new Date().toISOString(),apply,teams:[],totals:{}};
    return syncLocked(db,client,apply);
  },{timeout:15*60_000,maxWait:5000});
}

async function syncLocked(db:PrismaClient,client:SorareInsideClient,apply:boolean):Promise<SorareSyncReport> {
  const now=new Date(); const deadline=now.getTime()+12*60_000;
  const report:SorareSyncReport={status:"SUCCEEDED",startedAt:now.toISOString(),apply,teams:[],totals:{}};
  const scopes=await db.fantasyPlayerPrice.groupBy({by:["leagueId","season"]});
  const seasons=await db.leagueSeason.findMany({
    where:{isCurrent:true,OR:scopes.map(s=>({leagueId:s.leagueId,season:s.season})),NOT:{leagueId:{in:[44n,50n,77n]}}},
    select:{leagueId:true,season:true,league:{select:{name:true}},teams:{where:{active:true},select:{team:{select:{id:true,name:true,country:true}},players:{select:{player:{select:{id:true,name:true,birthDate:true}},active:true,position:true,shirtNumber:true,isStarter:true}}}}}
  });
  if(!seasons.length) throw new Error("SorareInside: no current fantasy club scopes");
  const maps=await db.providerEntityMap.findMany({where:{provider:PROVIDER,providerSeason:"GLOBAL"}});
  const saved=new Map<string,typeof maps[number]>(); const reverse=new Map<string,string>();
  for(const m of maps) {
    const key=`${m.providerEntityType}:${m.providerEntityId}`;
    saved.set(key,m);
    if(m.status!=="MATCHED" || !m.internalEntityId) continue;
    const back=`${m.internalEntityType}:${m.internalEntityId}`;
    if(reverse.has(back) && reverse.get(back)!==m.providerEntityId) throw new Error("SorareInside: conflicting stored ID mappings");
    reverse.set(back,m.providerEntityId);
  }
  const savedId=(type:string,id:string) => {
    const m=saved.get(`${type}:${id}`);
    if(!m) return undefined;
    // An explicitly rejected/unmatched ID also blocks implicit name fallback.
    return m.status==="MATCHED" && /^\d+$/.test(m.internalEntityId??"") ? BigInt(m.internalEntityId!) : -1n;
  };
  const catalog=new Map<string,IdentityTeam>();
  for(const s of seasons) for(const t of s.teams) {
    const id=String(t.team.id); const country=t.team.country??LEAGUE_COUNTRY[String(s.leagueId)]??null;
    if(!catalog.get(id)?.country) catalog.set(id,{...t.team,country});
  }
  const games=await client.schedule(now);
  const next=nearestTeamGames(games,now);
  const assignments=new Map<string,typeof next extends Map<string,infer T>?T:never>();
  const pendingTeams=new Map<string,Mapping>();
  for(const selected of next.values()) {
    const match=resolveSourceTeam(selected.team,[...catalog.values()],savedId("TEAM",selected.team.id));
    if(!match) continue;
    const id=String(match.id);
    if(assignments.has(id)) throw new Error(`SorareInside: multiple source teams map to ${id}`);
    assignments.set(id,selected);
    pendingTeams.set(id,{type:"TEAM",sourceId:selected.team.id,internalId:match.id,matchedBy:"EXACT_TEAM_COUNTRY"});
  }
  if(assignments.size>400) throw new Error("SorareInside: team request limit");
  const priceBirths=await db.fantasyPlayerPrice.findMany({where:{OR:seasons.map(s=>({leagueId:s.leagueId,season:s.season})),playerId:{not:null},providerBirthDate:{not:null}},select:{playerId:true,providerBirthDate:true}});
  const births=new Map<string,Date|null>();
  for(const p of priceBirths) { const id=String(p.playerId); const prior=births.get(id); if(births.has(id) && prior?.getTime()!==p.providerBirthDate?.getTime()) births.set(id,null); else if(!births.has(id)) births.set(id,p.providerBirthDate); }
  const evidenceByTeam=new Map<string,SorareRosterEvidence[]>();
  for(const row of await loadSorareRosterEvidence(db,seasons.map(s=>({leagueId:s.leagueId,season:s.season})),now)) {
    const id=String(row.teamId); const rows=evidenceByTeam.get(id)??[]; rows.push(row); evidenceByTeam.set(id,rows);
  }
  // Only one lineup body is held at a time, even for teams in multiple contests.
  for(const [id,team] of catalog) {
    if(Date.now()>deadline) throw new Error("SorareInside: run deadline exceeded");
    const selected=assignments.get(id);
    let lineup:SourceLineup|null=null; let fetchError:string|null=null;
    if(selected?.lineupId) try {lineup=await client.lineup(selected);} catch(error) {fetchError=safeError(error);}
    for(const season of seasons) {
      const t=season.teams.find(t=>String(t.team.id)===id); if(!t) continue;
      const entry:SorareTeamReport={leagueId:String(season.leagueId),season:season.season,teamId:id,team:team.name,status:"NO_MATCH_OR_TEAM_MAPPING",problems:[]};
      report.teams.push(entry);
      if(!selected) continue;
      Object.assign(entry,{sourceTeamId:selected.team.id,fixtureId:selected.game.id,kickoff:selected.game.kickoff,lineupId:selected.lineupId});
      if(!selected.lineupId) {entry.status="NO_PREDICTION_FOR_NEAREST_MATCH";continue;}
      if(!lineup) {entry.status="SOURCE_ERROR";entry.problems.push(fetchError??"Missing lineup");continue;}
      const scope={leagueId:season.leagueId,season:season.season,teamId:team.id};
      const teamEvidence=evidenceByTeam.get(id)??[];
      const repairs=new Map<string,SorareRosterRepair>();
      const activeOtherClub=new Set(season.teams.filter(other=>other.team.id!==team.id)
        .flatMap(other=>other.players.filter(p=>p.active).map(p=>String(p.player.id))));
      const roster=t.players.flatMap(member=> {
        if(!member.active) {
          const repair=lineup.players.map(source=>corroboratedSorareRosterRepair(source,member,scope,teamEvidence,
            activeOtherClub.has(String(member.player.id)))).find(repair=>repair!==null);
          if(!repair) return [];
          repairs.set(String(member.player.id),repair);
        }
        return [sorareRosterIdentity({...member.player,birthDate:member.player.birthDate??births.get(String(member.player.id))??null},teamEvidence)];
      });
      const resolved=lineup.players.map(p=>({source:p,...resolveSourcePlayer(p,roster,savedId("PLAYER",p.id))}));
      entry.players=resolved.map(p=>({sourceId:p.source.id,name:p.source.name,playerId:p.player?String(p.player.id):null,reason:p.reason}));
      const targets=resolved.flatMap(p=>p.player?[p.player.id]:[]);
      if(targets.length!==11 || new Set(targets.map(String)).size!==11) {entry.status="PLAYERS_UNMAPPED";continue;}
      const pending:Mapping[]=[pendingTeams.get(id)!,...resolved.map(p=>({type:"PLAYER" as const,sourceId:p.source.id,internalId:p.player!.id,matchedBy:p.reason}))];
      if(pending.some(m=>reverse.has(`${m.type}:${m.internalId}`)&&reverse.get(`${m.type}:${m.internalId}`)!==m.sourceId)) {entry.status="MAPPING_CONFLICT";continue;}
      const selectedRepairs=targets.flatMap(playerId=>{const repair=repairs.get(String(playerId));return repair?[repair]:[];});
      if(selectedRepairs.length) entry.restoredRosterPlayerIds=selectedRepairs.map(repair=>String(repair.evidence.playerId));
      const sourceLineup={source:"SORAREINSIDE" as const,sourceUrl:`https://sorareinside.com/lineup?lineupId=${lineup.id}`,sourceTeamCode:selected.team.id,sourceFixtureId:selected.game.id,sourceKickoff:selected.game.kickoff,sourceLineupId:lineup.id,teamName:selected.team.name,opponentName:selected.opponent.name,venue:selected.home?"HOME" as const:"AWAY" as const,formation:lineup.formation,sourceUpdatedText:lineup.updatedAt,players:lineup.players.map(p=>({name:p.name,fullName:p.slug.replaceAll("-"," "),providerCode:p.id,shirtNumber:null}))};
      const current=t.players.filter(p=>p.isStarter).map(p=>p.player.id);
      const changed=current.length!==11 || targets.some(p=>!current.includes(p));
      const plan:ProbableLineupTeamPlan={source:"SORAREINSIDE",sourceUrl:sourceLineup.sourceUrl,leagueId:season.leagueId,leagueName:season.league.name,season:season.season,fetchedAt:now,sourceLineup,teamId:team.id,databaseTeamName:team.name,teamMatchedBy:"PROVIDER_CODE",teamConfidence:1,status:changed?"READY":"UNCHANGED",playerResolutions:[],currentStarterIds:current,targetPlayerIds:targets,startersToSet:targets.filter(p=>!current.includes(p)).length,startersToClear:current.filter(p=>!targets.includes(p)).length,problems:[]};
      entry.status=plan.status;
      if(apply) try {
        const outcome=await applyProbableLineupTeamPlan(db,plan,new Date(),(change,tx)=>enqueueCurrentXiTeamsSnapshotRefresh(tx,change),async tx=> {
          for(const m of pending) await persistMapping(tx,m);
        },async tx=>restoreSorareRosterMembers(tx,scope,selectedRepairs));
        entry.status=outcome.status;
        for(const m of pending) reverse.set(`${m.type}:${m.internalId}`,m.sourceId);
      } catch(error) {entry.status="APPLY_ERROR";entry.problems.push(safeError(error));}
    }
  }
  for(const team of report.teams) report.totals[team.status]=(report.totals[team.status]??0)+1;
  if(report.teams.some(t=>!["APPLIED","READY","UNCHANGED"].includes(t.status))) report.status="PARTIAL";
  report.finishedAt=new Date().toISOString();report.rssMiB=Math.round(process.memoryUsage().rss/1048576);
  return report;
}

async function persistMapping(tx:Prisma.TransactionClient,m:Mapping) {
  const row=await tx.providerEntityMap.upsert({
    where:{provider_providerSeason_providerEntityType_providerEntityId_internalEntityType:{provider:PROVIDER,providerSeason:"GLOBAL",providerEntityType:m.type,providerEntityId:m.sourceId,internalEntityType:m.type}},
    create:{provider:PROVIDER,providerSeason:"GLOBAL",providerEntityType:m.type,providerEntityId:m.sourceId,providerEntityCode:m.sourceId,internalEntityType:m.type,internalEntityId:String(m.internalId),matchedBy:m.matchedBy,confidence:1,status:"MATCHED"},update:{}
  });
  if(row.status!=="MATCHED" || row.internalEntityId!==String(m.internalId)) throw new Error("SorareInside: mapping changed while applying");
}
export function safeError(error:unknown) { return error instanceof Error ? (error.message.startsWith("SorareInside") ? error.message : "Import failed; inspect internal validation and source availability") : "Import failed"; }
