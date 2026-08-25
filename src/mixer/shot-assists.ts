export type ShotAssistEventLike = {
  matchId: bigint;
  playerId: bigint | null;
  minute: number | null;
  addedTime: number | null;
  relatedPlayer: { id: bigint; name: string | null; rawRef: string | null } | null;
};

export type ShotAssistCandidate = { id: bigint; name: string | null; rawRef: string | null };

/**
 * Indexes goal events so shots can be matched with the player who played the
 * final pass. FotMob only publishes the assister on goal incidents, never on
 * individual shotmap entries, so non-goal shots stay without a passer.
 */
export function buildShotAssistIndex(events: readonly ShotAssistEventLike[]) {
  const byExactMinute = new Map<string, ShotAssistCandidate>();
  const byMatchPlayer = new Map<string, ShotAssistCandidate[]>();

  for (const event of events) {
    if (!event.relatedPlayer || !event.playerId) continue;
    const candidate: ShotAssistCandidate = {
      id: event.relatedPlayer.id,
      name: event.relatedPlayer.name,
      rawRef: event.relatedPlayer.rawRef
    };
    byExactMinute.set(exactKey(event.matchId, event.playerId, event.minute, event.addedTime), candidate);
    const looseKey = matchPlayerKey(event.matchId, event.playerId);
    const candidates = byMatchPlayer.get(looseKey) ?? [];
    candidates.push(candidate);
    byMatchPlayer.set(looseKey, candidates);
  }

  return { byExactMinute, byMatchPlayer };
}

export type ShotForAssistLookup = {
  matchId: bigint;
  playerId: bigint | null;
  minute: number | null;
  addedTime: number | null;
};

export function findAssisterForShot(
  index: ReturnType<typeof buildShotAssistIndex>,
  shot: ShotForAssistLookup
): ShotAssistCandidate | null {
  if (!shot.playerId) return null;
  const exact = index.byExactMinute.get(exactKey(shot.matchId, shot.playerId, shot.minute, shot.addedTime));
  if (exact) return exact;
  // Minute bookkeeping differs between the shotmap and the incident feed for
  // some entries; fall back only when the scorer scored exactly once, where
  // the assister is unambiguous even without a minute match.
  const candidates = index.byMatchPlayer.get(matchPlayerKey(shot.matchId, shot.playerId));
  return candidates && candidates.length === 1 ? candidates[0] : null;
}

function exactKey(matchId: bigint, playerId: bigint, minute: number | null, addedTime: number | null) {
  return `${matchId}:${playerId}:${minute ?? ""}:${addedTime ?? ""}`;
}

function matchPlayerKey(matchId: bigint, playerId: bigint) {
  return `${matchId}:${playerId}`;
}
