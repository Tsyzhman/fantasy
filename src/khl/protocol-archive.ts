/** @spec spec://modules/khl/INFRA-001-khl-data-ingestion#providers */
import { seasonStatFields, type KhlProtocolArchiveStats } from './contracts';
import { summarizeHockeyHistory } from './history-projection';
import type { KhlProtocolRow } from '@/providers/khl-mobile/protocol';

export function summarizeProtocolArchive(input: { officialPlayerId: string; officialSeasonId: string; rows: { matchId: string; row: KhlProtocolRow }[]; observedAt: string }): KhlProtocolArchiveStats {
  if (input.rows.some(r => r.row.officialPlayerId !== input.officialPlayerId) || new Set(input.rows.map(r => r.matchId)).size !== input.rows.length) throw new Error('ARCHIVE_MATCH_DUPLICATE_OR_IDENTITY');
  const played = input.rows.filter(r => r.row.participationStatus === 'PLAYED');
  const paired = played.filter(r => r.row.goals !== null && r.row.shotsOnGoal !== null);
  const summary = summarizeHockeyHistory(played.map(r => ({ ...r.row, points: null })), '', '');
  const stats = { games: played.length, totals: summary.totals, asOf: input.observedAt,
    officialPlayerId: input.officialPlayerId, officialSeasonId: input.officialSeasonId,
    source: `https://www.khl.ru/players/${input.officialPlayerId}/`,
    matchIds: input.rows.map(r => r.matchId).sort(),
    pairedGoals: paired.reduce((s, r) => s + r.row.goals!, 0), pairedShots: paired.reduce((s, r) => s + r.row.shotsOnGoal!, 0), pairedGames: paired.length };
  validateProtocolArchive(stats);
  return stats;
}
export function validateProtocolArchive(s: KhlProtocolArchiveStats) {
  if (!s || !/^\d{1,12}$/.test(s.officialPlayerId) || !/^\d{1,12}$/.test(s.officialSeasonId)
    || s.source !== `https://www.khl.ru/players/${s.officialPlayerId}/`
    || !s.asOf || !Number.isFinite(Date.parse(s.asOf)) || !Number.isInteger(s.games) || s.games < 0 || s.games > 100
    || !Array.isArray(s.matchIds) || s.matchIds.length > 100 || s.matchIds.length < s.games || new Set(s.matchIds).size !== s.matchIds.length || s.matchIds.some(id => !/^\d{1,12}$/.test(id))
    || seasonStatFields.some(key => { const v=s.totals?.[key]; return !v || !Number.isInteger(v.knownGames) || v.knownGames < 0 || v.knownGames > s.games || (v.knownGames === 0) !== (v.value === null) || v.value !== null && (!Number.isFinite(v.value) || key !== 'plusMinus' && v.value < 0); })
    || [s.pairedGames, s.pairedGoals, s.pairedShots].some(n => !Number.isSafeInteger(n) || n < 0) || s.pairedGames > s.games || s.pairedGoals > s.pairedShots
    || s.pairedShots > (s.totals.shotsOnGoal.value ?? 0) || s.pairedGoals > (s.totals.goals.value ?? 0)) throw new Error('ARCHIVE_PROTOCOL_STATS_INVALID');
}
