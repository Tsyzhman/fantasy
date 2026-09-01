import type { CsvColumn } from "@/lib/csv";
import { jsonError, requiredSearchParam, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isFantasySquadLeague } from "@/lib/leagues/display";
import { FPL_PROVIDER } from "@/lib/providers/fpl";
import { parseTableExportFormat, tableExportResponse } from "@/lib/table-export";
import { loadSharedLeagueSeason } from "@/machete/shared_read_model";
import { parseFantasyHistorySettings } from "@/machete/squad-history";
import { loadFantasySquadPlannerData } from "@/machete/squad_planner";
import type { FantasyPlannerPlayer, FantasySquadSelection } from "@/machete/squad_logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SquadExportRow = {
  slot: number;
  playerId: string;
  playerName: string;
  teamName: string;
  position: string | null;
  role: string;
  captain: string;
  locked: string;
  price: number | null;
  priceSource: string | null;
  predictedFp: number | null;
  nextRoundPoints: number | null;
  horizonPoints: number;
  valueScore: number | null;
  fixtures: string;
  roundPoints: number[];
};

export const GET = withApiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const format = parseTableExportFormat(params.get("format"));
  if (!format) return jsonError("INVALID_FORMAT", "format must be csv or xlsx.", 400);

  const leagueId = requiredSearchParam(params, "leagueId");
  const league = await loadSharedLeagueSeason(prisma, leagueId, params.get("season"));
  if (!league || !isFantasySquadLeague(league)) return jsonError("NOT_FOUND", "League season not found.", 404);

  const squadId = params.get("squadId");
  const provider = normalizeProvider(params.get("provider"));
  const historySettings = parseFantasyHistorySettings({
    historyScope: params.get("historyScope"),
    historyWindow: params.get("historyWindow"),
    historySeason: params.getAll("historySeason")
  });
  const data = await loadFantasySquadPlannerData(prisma, auth.user.id, league, squadId, { historySettings, provider });
  if (squadId && data.squad.id !== squadId) return jsonError("SQUAD_NOT_FOUND", "Squad not found.", 404);
  const roundCount = Math.min(data.squad.horizonRounds, data.rounds.length);
  const rows = squadExportRows(data.squad.selections, data.players, roundCount);
  const columns = squadExportColumns(roundCount);

  return tableExportResponse({
    rows,
    columns,
    format,
    filename: `squad-${String(league.leagueId)}-${league.season}-${data.squad.id ?? "new"}`,
    sheetName: "Squad"
  });
});

function normalizeProvider(value: string | null) {
  return value?.trim().toUpperCase() === FPL_PROVIDER ? FPL_PROVIDER : "SPORTS_RU";
}

function squadExportRows(selections: FantasySquadSelection[], players: FantasyPlannerPlayer[], roundCount: number): SquadExportRow[] {
  const playersById = new Map(players.map((player) => [player.playerId, player]));

  return [...selections]
    .sort((left, right) => left.slotIndex - right.slotIndex)
    .map((selection, index) => {
      const player = playersById.get(selection.playerId);
      const roundPoints = player?.roundPoints.slice(0, roundCount) ?? [];

      return {
        slot: selection.slotIndex + 1 || index + 1,
        playerId: selection.playerId,
        playerName: player?.name ?? `Player ${selection.playerId}`,
        teamName: player?.teamName ?? "",
        position: player?.position ?? null,
        role: squadRole(selection),
        captain: selection.isCaptain ? "captain" : selection.isViceCaptain ? "vice-captain" : "",
        locked: selection.isLocked ? "yes" : "no",
        price: selection.purchasePrice ?? player?.price ?? null,
        priceSource: player?.priceSource ?? null,
        predictedFp: player?.predictedFp ?? null,
        nextRoundPoints: roundPoints[0] ?? null,
        horizonPoints: roundPoints.reduce((total, points) => total + points, 0),
        valueScore: player?.valueScore ?? null,
        fixtures: player?.fixtures.slice(0, roundCount).filter(Boolean).join(" | ") ?? "",
        roundPoints
      };
    });
}

function squadExportColumns(roundCount: number): CsvColumn<SquadExportRow>[] {
  return [
    { header: "Slot", value: (row) => row.slot },
    { header: "Player ID", value: (row) => row.playerId },
    { header: "Player", value: (row) => row.playerName },
    { header: "Team", value: (row) => row.teamName },
    { header: "Position", value: (row) => row.position },
    { header: "Role", value: (row) => row.role },
    { header: "Captain", value: (row) => row.captain },
    { header: "Locked", value: (row) => row.locked },
    { header: "Price", value: (row) => row.price },
    { header: "Price source", value: (row) => row.priceSource },
    { header: "Predicted FP", value: (row) => row.predictedFp },
    { header: "Next round FP", value: (row) => row.nextRoundPoints },
    { header: "Horizon FP", value: (row) => row.horizonPoints },
    { header: "Value score", value: (row) => row.valueScore },
    ...Array.from({ length: roundCount }, (_, index) => ({
      header: `Round ${index + 1} FP`,
      value: (row: SquadExportRow) => row.roundPoints[index] ?? null
    })),
    { header: "Fixtures", value: (row) => row.fixtures }
  ];
}

function squadRole(selection: FantasySquadSelection) {
  return selection.isStarter ? "starter" : "bench";
}
