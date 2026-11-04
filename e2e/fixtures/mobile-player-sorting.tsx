/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */
import { useState } from "react";
import { CustomizablePlayerPoolTable, filterPlayerPoolByNameQuery, playerPoolOptionalColumns } from "@/components/machete/PlayerPool";
import { useLanguage } from "@/components/localized-option";
import type { FantasyPlannerPlayer, FantasySquadSelection } from "@/machete/squad_logic";

const footballPlayers: FantasyPlannerPlayer[] = Array.from({ length: 48 }, (_, index) => ({
  id: `sort-${index}`, playerId: `sort-${index}`, name: `Player${String(index).padStart(2, "0")}`, teamId: `club-${index}`, teamName: `Club ${index}`, teamShortName: `FC${index}`,
  leagueName: "Fixture League", position: "MID", positionGroup: "MID", price: index + 1, priceSource: "ESTIMATED", predictedFp: index, valueScore: index,
  roundPoints: [index, index, index], foontasyPoints: index === 0 ? null : index / 2,
  historicalStats: { shots: index === 0 ? null : index === 1 ? 0 : index === 2 || index === 3 ? 5 : index },
  fixtures: ["FC (H)"], fixtureDifficulties: [2]
}));

export function MobilePlayerSortingFixture() {
  const language = useLanguage();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(["nextFp", "foontasy", "fixtures"]);
  const [includeHistory, setIncludeHistory] = useState(true);
  const filtered = filterPlayerPoolByNameQuery(footballPlayers, query);
  const selections = new Map<string, FantasySquadSelection>(selectedIds.map((id, index) => [id, { playerId: id, isStarter: true, isLocked: false, isCaptain: false, isViceCaptain: false, slotIndex: index, purchasePrice: 5 }]));
  return <main style={{ padding: 12 }} className="min-h-screen bg-field" data-testid="mobile-sort-fixture">
    <label>Fixture name filter<input aria-label="Fixture name filter" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <output data-testid="sort-selection">{selectedIds.join(",")}</output>
    <output hidden data-testid="sort-columns">{selectedColumns.join(",")}</output>
    <button type="button" onClick={() => setIncludeHistory(false)}>Remove historical column definitions</button>
    <button type="button" onClick={() => setIncludeHistory(true)}>Restore historical column definitions</button>
    <CustomizablePlayerPoolTable players={filtered} horizon={3} language={language} detailedFormulaTooltips={false}
      availableColumns={playerPoolOptionalColumns(footballPlayers, 3, language).filter((column) => includeHistory || !column.key.startsWith("stat:"))} initialVisibleColumns={["nextFp", "foontasy", "fixtures"]}
      initialColumnWidths={{}} onVisibleColumnsChange={setSelectedColumns} toolbar={null} selectionsByPlayerId={selections} addBlockReason={() => null}
      onAdd={(player) => setSelectedIds((ids) => [...ids, player.playerId])} onRemove={(id) => setSelectedIds((ids) => ids.filter((candidate) => candidate !== id))} />
  </main>;
}
