/** @spec spec://modules/betting/FEAT-001-virtual-league#feed */
import { fantasySquadLeagueFotMobIds, macheteLeagueDisplayName } from "@/lib/leagues/display";

export const bettingLeagues = fantasySquadLeagueFotMobIds.map(id => ({
  id: Number(id), name: macheteLeagueDisplayName({ providerLeagueId: id })
}));
export const bettingLeagueIds = bettingLeagues.map(l => BigInt(l.id));
