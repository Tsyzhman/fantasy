/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#runtime */
import { prisma } from "../lib/db";
import { createLogger } from "../lib/logger";
import { SorareInsideClient } from "../providers/sorareinside/client";
import { runSorareInsideSync, safeError } from "../machete/sorareinside-sync";
const logger=createLogger("sorareinside:scheduler");
type State={started:boolean;running:boolean;timer?:ReturnType<typeof setTimeout>;client?:SorareInsideClient};
const globalState=globalThis as unknown as {sorareInsideScheduler?:State};

export function nextSorareInsideSyncAt(now:Date):Date {
  const next=new Date(now);next.setUTCMinutes(5,0,0);
  if(next.getTime()<=now.getTime()) next.setUTCHours(next.getUTCHours()+1);
  return next;
}
export function startSorareInsideScheduler() {
  if(process.env.SORAREINSIDE_SYNC_ENABLED!=="true") return;
  const state=globalState.sorareInsideScheduler??(globalState.sorareInsideScheduler={started:false,running:false});
  if(state.started) return;
  const email=process.env.SORAREINSIDE_EMAIL;const password=process.env.SORAREINSIDE_PASSWORD;
  if(!email||!password) {logger.error("SorareInside credentials are missing");return;}
  state.started=true;state.client=new SorareInsideClient({email,password});
  const schedule=()=> {
    const next=nextSorareInsideSyncAt(new Date());
    state.timer=setTimeout(()=>{void run().finally(schedule);},next.getTime()-Date.now());state.timer.unref?.();
    logger.info("Next SorareInside sync scheduled",{runAt:next.toISOString()});
  };
  const run=async()=> {
    if(state.running || process.env.SORAREINSIDE_SYNC_ENABLED!=="true") return;
    state.running=true;
    try {
      const result=await runSorareInsideSync(prisma,state.client!,true);
      logger.info("SorareInside sync finished",{status:result.status,totals:result.totals,startedAt:result.startedAt,finishedAt:result.finishedAt,rssMiB:result.rssMiB});
      for(const team of result.teams.filter(t=>!["APPLIED","UNCHANGED"].includes(t.status))) logger.warn("SorareInside team preserved",{...team,players:team.players?.filter(p=>!p.playerId)});
    } catch(error) {logger.error("SorareInside sync failed; prior flags preserved for unapplied teams",{error:safeError(error)});}
    finally {state.running=false;}
  };
  void run().finally(schedule);
}
