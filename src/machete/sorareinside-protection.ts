/** @spec spec://modules/machete/INFRA-004-sorareinside-starters#apply */
export function hasUpcomingSorareLineup(metadata: unknown, now = new Date()): boolean {
  if (!metadata || typeof metadata!=="object" || !("probableLineup" in metadata)) return false;
  const value=metadata.probableLineup;
  return Boolean(value && typeof value==="object" && "source" in value && value.source==="SORAREINSIDE" && "sourceKickoff" in value && typeof value.sourceKickoff==="string" && Date.parse(value.sourceKickoff)>now.getTime());
}
