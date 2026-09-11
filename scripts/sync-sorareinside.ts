/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#runtime */
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { SorareInsideClient } from "../src/providers/sorareinside/client";
import { runSorareInsideSync, safeError } from "../src/machete/sorareinside-sync";

async function main() {
  if(process.argv.includes("--help")) {console.log("sync-sorareinside [--apply] [--json]: default is dry-run. Requires DATABASE_URL, SORAREINSIDE_EMAIL, SORAREINSIDE_PASSWORD.");return;}
  for(const arg of process.argv.slice(2)) if(!["--apply","--json"].includes(arg)) throw new Error("SorareInside: unknown CLI option");
  for(const file of [".env.local",".env"]) if(existsSync(file)) process.loadEnvFile(file);
  const email=process.env.SORAREINSIDE_EMAIL;const password=process.env.SORAREINSIDE_PASSWORD;
  if(!email||!password) throw new Error("SorareInside: missing SORAREINSIDE_EMAIL / SORAREINSIDE_PASSWORD");
  const db=new PrismaClient();
  try {
    const report=await runSorareInsideSync(db,new SorareInsideClient({email,password}),process.argv.includes("--apply"));
    console.log(JSON.stringify(report,null,2));
    if(report.teams.some(t=>["SOURCE_ERROR","APPLY_ERROR","MAPPING_CONFLICT"].includes(t.status))) process.exitCode=1;
  } finally {await db.$disconnect();}
}
void main().catch(error=>{console.error(safeError(error));process.exitCode=1;});
