/** @spec spec://modules/betting/FEAT-001-virtual-league#ui */
import { requireCurrentUser } from "@/lib/auth";
import { BettingLeague } from "./ui";
export const dynamic="force-dynamic";
export default async function BettingPage(){const user=await requireCurrentUser();return <BettingLeague admin={user.role==="ADMIN"}/>;}
