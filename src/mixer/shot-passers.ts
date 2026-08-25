export type ShotPasserInput = {
  assist_player_id?: string | null;
  assist_provider_player_id?: string | null;
  assist_player_name?: string | null;
  team_name?: string | null;
  team_id?: string | null;
  provider_team_id?: string | null;
  xg?: number | null;
  minute?: number | null;
  added_time?: number | null;
  event_type?: string | null;
  match_label?: string | null;
  match_date?: string | null;
};

export type ShotPasserSummary = {
  key: string;
  playerName: string;
  teamName: string;
  assists: number;
  xgAssisted: number;
  latestTimestamp: number;
  lastAssist: string;
};

/**
 * Aggregates assisted goal shots per passer for the "top pass creators"
 * table. Only shots with a known assister (goal incidents) are counted.
 */
export function summarizeShotPassers(shots: readonly ShotPasserInput[]): ShotPasserSummary[] {
  const summaries = new Map<string, ShotPasserSummary>();

  for (const shot of shots) {
    const playerKey = shot.assist_player_id ?? shot.assist_provider_player_id ?? shot.assist_player_name?.trim();
    if (!playerKey) continue;
    const key = [playerKey, shot.team_id ?? shot.provider_team_id ?? shot.team_name ?? ""].join(":");
    const existing = summaries.get(key) ?? {
      key,
      playerName: shot.assist_player_name?.trim() || playerKey,
      teamName: shot.team_name ?? "-",
      assists: 0,
      xgAssisted: 0,
      latestTimestamp: 0,
      lastAssist: ""
    };

    existing.assists += 1;
    existing.xgAssisted += shot.xg ?? 0;

    const timestamp = shot.match_date ? new Date(shot.match_date).getTime() : 0;
    if (timestamp >= existing.latestTimestamp) {
      existing.latestTimestamp = timestamp;
      existing.lastAssist = [
        shot.minute !== null && shot.minute !== undefined ? `${shot.minute}${shot.added_time ? `+${shot.added_time}` : ""}'` : null,
        shot.xg !== null && shot.xg !== undefined ? `${shot.xg.toFixed(2)} xG` : null,
        shot.event_type,
        shot.match_label
      ].filter(Boolean).join(" | ");
    }

    summaries.set(key, existing);
  }

  return [...summaries.values()]
    .map((summary) => ({ ...summary, xgAssisted: round(summary.xgAssisted) }))
    .sort((left, right) => right.assists - left.assists || right.xgAssisted - left.xgAssisted || left.playerName.localeCompare(right.playerName));
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
