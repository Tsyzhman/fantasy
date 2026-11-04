/** @spec spec://common/PROP-002-editorial-sport-design#contracts */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MobilePlayerSortingFixture } from "./mobile-player-sorting";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { CommandPalette } from "@/components/command-palette";
import { ColumnResizeHandle } from "@/components/machete/ColumnResizeHandle";
import { FantasySquadPlanner } from "@/components/machete/FantasySquadPlanner";
import { alternativeFiveRoundFpTitle, playerPrimaryHorizonForecastTitle } from "@/components/machete/planner-explanations";
import { SortableTable, type SortDirection } from "@/components/sortable-table";
import { defaultFantasyHistorySettings } from "@/machete/squad-history-settings";
import { createFantasySquadRoundPlans, type FantasyPlannerPlayer, type FantasyPositionGroup, type FantasySquadRules, type FantasySquadSelection } from "@/machete/squad_logic";

const router: AppRouterInstance = {
  bfcacheId: "isolated-ui-fixture",
  push(href) { document.querySelector("#navigation-result")!.textContent = href; },
  replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {}
};

const positions: FantasyPositionGroup[] = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "GK", "DEF", "MID", "FWD", "DEF", "MID", "FWD"];
const players: FantasyPlannerPlayer[] = positions.map((positionGroup, index) => ({
  id: `fixture-${index}`, playerId: `fixture-${index}`, teamId: `club-${index}`, name: `Fixture Player ${index + 1}`,
  teamName: `Fixture Club ${index + 1}`, teamShortName: `FC${index + 1}`, leagueName: "Fixture League", position: positionGroup,
  positionGroup, price: 5, priceSource: "ESTIMATED", predictedFp: 4, valueScore: 0.8, roundPoints: [4, 5, 6, 7, 8],
  alternativeRoundPoints: [3, 4, 5, 6, 7], fixtures: ["FCA (H)", "FCB (A)", "FCC (H)"], fixtureDifficulties: [2, 3, 2]
}));
const selections: FantasySquadSelection[] = players.slice(0, 15).map((player, index) => ({
  playerId: player.playerId, isStarter: index < 11, isLocked: false, isCaptain: index === 5, isViceCaptain: index === 6,
  slotIndex: index, purchasePrice: 5
}));
const rules: FantasySquadRules = {
  budgetLimit: 100, squadSize: 15, starterSize: 11, benchSize: 4, maxPlayersPerTeam: 3,
  positionLimits: { GK: 2, DEF: 5, MID: 5, FWD: 3 }, starterPositionLimits: { GK: { min: 1, max: 1 }, DEF: { min: 3, max: 5 }, MID: { min: 2, max: 5 }, FWD: { min: 1, max: 3 } },
  horizonOptions: [3, 5], sourceLabel: "Isolated browser fixture"
};

function TableFixture() {
  const [addCount, setAddCount] = useState(0);
  const [removeCount, setRemoveCount] = useState(0);
  const [headerCount, setHeaderCount] = useState(0);
  const [submitCount, setSubmitCount] = useState(0);
  const [width, setWidth] = useState(100);
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);
  return <section aria-label="Table fixture" style={{ margin: "1rem 0", overflowX: "auto" }}>
    <p data-testid="counts">add:{addCount} remove:{removeCount} header:{headerCount} submit:{submitCount}</p>
    <SortableTable data-testid="native-table">
      <thead><tr>
        <th data-sort-key="name" style={{ position: "relative", minWidth: width }}>
          <span>Player</span><button type="button" onClick={() => setHeaderCount((value) => value + 1)}>Header action</button>
          <ColumnResizeHandle label="Player" language="en" width={width} onWidthChange={setWidth} onPointerDown={() => {}} onDoubleClick={() => setWidth(100)} />
        </th><th data-sort-disabled="true">Controls</th>
      </tr></thead>
      <tbody>
        <tr data-row="B"><td>Beta</td><td><button type="button" onClick={() => setAddCount((value) => value + 1)}>Add</button><label><input type="checkbox" />Selected</label></td></tr>
        <tr data-row="A"><td>Alpha</td><td><button type="button" onClick={() => setRemoveCount((value) => value + 1)}>Remove</button><a href="#link-activated">Player details</a></td></tr>
        <tr><td colSpan={2}><form onSubmit={(event) => { event.preventDefault(); setSubmitCount((value) => value + 1); }}><input aria-label="Native text" /><button type="submit">Submit</button></form></td></tr>
      </tbody>
    </SortableTable>
    <SortableTable data-testid="managed-table" managedClientSort clientSort={sort} onClientSortChange={setSort}>
      <thead><tr><th data-sort-key="points" data-sort-default-direction="desc">Points</th></tr></thead><tbody><tr><td>4</td></tr></tbody>
    </SortableTable>
    <SortableTable data-testid="server-table" serverSortParam="fixtureSort" defaultSort="points:desc">
      <thead><tr><th data-sort-key="points">Server points</th></tr></thead><tbody><tr><td>4</td></tr></tbody>
    </SortableTable>
  </section>;
}

function Fixture() {
  return <AppRouterContext.Provider value={router}><main style={{ padding: 16 }}>
    <header style={{ display: "flex", gap: 16, alignItems: "center" }}><h1>Isolated keyboard fixture</h1><CommandPalette showAdmin /></header>
    <input aria-label="Outside input" /><output id="navigation-result" />
    <output hidden data-testid="primary-tooltip-probe">{playerPrimaryHorizonForecastTitle({ ...players[0], roundPoints: [null, 4, 8] as unknown as number[] }, "en", 12, 3)}</output>
    <output hidden data-testid="alternative-tooltip-probe">{alternativeFiveRoundFpTitle("ru", 3)}</output>
    <TableFixture />
    <FantasySquadPlanner userId="fixture-user" leagueId="fixture-league" season="2026/27" provider="SPORTS_RU"
      playerPoolHref={new URLSearchParams(location.search).has("pendingPool") ? "/api/fixture-pool" : undefined}
      rules={rules} players={players} rounds={Array.from({ length: 5 }, (_, index) => ({ id: String(index), label: `Round ${index + 1}`, startsAt: null, fixtureCount: 9 }))}
      bookmakerFavorites={[]} initialSquad={{ id: null, name: "Fixture squad", leagueId: "fixture-league", season: "2026/27", horizonRounds: 3, selections, roundPlans: createFantasySquadRoundPlans(selections) }}
      readiness={{ leagueId: "fixture-league", season: "2026/27", ready: false, reasons: ["NO_INCREMENTAL_INGESTION"], activePlayers: 18, upcomingFixtures: 9, maximumAgeHours: 24, audit: null, ingestion: null }}
      sportsRuSquadStatus={null} historySettings={defaultFantasyHistorySettings} initialVisiblePlayerPoolColumns={[]} initialPlayerPoolColumnWidths={{}} />
  </main></AppRouterContext.Provider>;
}

const mobileSortFixture = new URLSearchParams(location.search).get("mobileSort");
createRoot(document.getElementById("root")!).render(<StrictMode>{mobileSortFixture
  ? <AppRouterContext.Provider value={router}><MobilePlayerSortingFixture /></AppRouterContext.Provider>
  : <Fixture />}</StrictMode>);
