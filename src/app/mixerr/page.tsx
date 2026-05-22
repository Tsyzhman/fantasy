import { ShotMapExplorer } from "@/components/mixerr/ShotMapExplorer";
import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { CompetitionCheckboxList } from "@/components/ui/competition-checkbox-list";
import { FilterShell } from "@/components/ui/filter-shell";
import { ResultsToolbar } from "@/components/ui/results-toolbar";
import { prisma } from "@/lib/db";
import Link from "next/link";
import {
  loadSharedLeagueOptions,
  loadSharedLeagueTeams,
  loadSharedTeamCompetitionOptions,
  loadSharedTeamPlayers,
  sharedCompetitionKey,
  type SharedLeagueSeasonOption,
  type SharedTeamCompetitionOption
} from "@/machete/shared_read_model";
import {
  get_player_shots_for_team_window,
  get_shot_map_comparison_for_windows,
  get_team_conceded_shots_for_window,
  get_team_shots_for_window
} from "@/lib/shot-maps";
import { matchWindowLabel, matchWindowLabelRu, matchWindowModeValue, parseMacheteMatchWindow } from "@/scoring/machete/match-window";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

type PageProps = {
  searchParams?: Promise<{
    leagueId?: string;
    attackingTeamId?: string;
    defendingTeamId?: string;
    attackingCompetitionKey?: SearchParamValue;
    defendingCompetitionKey?: SearchParamValue;
    playerId?: string;
    matchWindow?: string;
    defendingMatchWindow?: string;
  }>;
};

type MixerrCompetitionOption = Omit<SharedTeamCompetitionOption, "key" | "season" | "matchesCount" | "latestMatchDate"> & {
  key: string;
  matchesCount: number;
  latestMatchDate: Date | null;
  primaryScope: {
    leagueId: bigint;
    season: string;
  };
  scopes: Array<{
    leagueId: bigint;
    season: string;
  }>;
};

export default async function MixerrPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const leagueOptions = await loadSharedLeagueOptions(prisma);
  const selectedLeague = leagueOptions.find((league) => String(league.leagueId) === resolvedSearchParams.leagueId) ?? leagueOptions[0] ?? null;
  const teams = selectedLeague ? await loadSharedLeagueTeams(prisma, selectedLeague.leagueId, selectedLeague.season) : [];
  const attackingTeam = teams.find((team) => String(team.id) === resolvedSearchParams.attackingTeamId) ?? teams[0] ?? null;
  const defendingTeam = teams.find((team) => String(team.id) === resolvedSearchParams.defendingTeamId) ?? teams.find((team) => team.id !== attackingTeam?.id) ?? attackingTeam;
  const attackingTeamId = attackingTeam ? String(attackingTeam.id) : "";
  const defendingTeamId = defendingTeam ? String(defendingTeam.id) : "";
  const matchWindow = parseMacheteMatchWindow({ mode: resolvedSearchParams.matchWindow });
  const defendingMatchWindow = parseMacheteMatchWindow({ mode: resolvedSearchParams.defendingMatchWindow ?? resolvedSearchParams.matchWindow });
  const attackingCompetitionRows = attackingTeam ? await loadSharedTeamCompetitionOptions(prisma, attackingTeam.id) : [];
  const defendingCompetitionRows = defendingTeam ? await loadSharedTeamCompetitionOptions(prisma, defendingTeam.id) : [];
  const attackingCompetitionOptions = groupMixerrCompetitionOptions(attackingCompetitionRows);
  const defendingCompetitionOptions = groupMixerrCompetitionOptions(defendingCompetitionRows);
  const selectedAttackingCompetitions = selectedTeamCompetitionOptions(resolvedSearchParams.attackingCompetitionKey, attackingCompetitionOptions);
  const selectedDefendingCompetitions = selectedTeamCompetitionOptions(resolvedSearchParams.defendingCompetitionKey, defendingCompetitionOptions);
  const activeAttackingCompetitions =
    selectedAttackingCompetitions.length > 0 ? selectedAttackingCompetitions : defaultCompetitionOptionsForSelectedLeague(selectedLeague, attackingCompetitionOptions);
  const activeDefendingCompetitions =
    selectedDefendingCompetitions.length > 0 ? selectedDefendingCompetitions : defaultCompetitionOptionsForSelectedLeague(selectedLeague, defendingCompetitionOptions);
  const checkedAttackingCompetitionKeys = activeAttackingCompetitions.map((competition) => competition.key);
  const checkedDefendingCompetitionKeys = activeDefendingCompetitions.map((competition) => competition.key);
  const playerScope = activeAttackingCompetitions[0]?.primaryScope ?? selectedLeague;
  const players = playerScope && attackingTeam ? await loadSharedTeamPlayers(prisma, playerScope.leagueId, playerScope.season, attackingTeam.id) : [];
  const player = players.find((candidate) => String(candidate.id) === resolvedSearchParams.playerId) ?? players[0] ?? null;
  const playerId = player ? String(player.id) : "";
  const attackingShotContext = buildShotContext(activeAttackingCompetitions, selectedLeague);
  const defendingShotContext = buildShotContext(activeDefendingCompetitions, selectedLeague);

  const [teamShots, concededShots, playerShots, comparison] = attackingTeamId
    ? await Promise.all([
        get_team_shots_for_window(prisma, attackingTeamId, matchWindow, attackingShotContext),
        get_team_conceded_shots_for_window(prisma, attackingTeamId, matchWindow, attackingShotContext),
        playerId ? get_player_shots_for_team_window(prisma, playerId, attackingTeamId, matchWindow, attackingShotContext) : Promise.resolve([]),
        defendingTeamId
          ? get_shot_map_comparison_for_windows(prisma, attackingTeamId, defendingTeamId, matchWindow, defendingMatchWindow, attackingShotContext, defendingShotContext)
          : Promise.resolve(emptyComparison(attackingTeamId, defendingTeamId))
      ])
    : [[], [], [], emptyComparison(attackingTeamId, defendingTeamId)];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">MiXerr / FotMob</p>
        <h1 className="mt-2 text-3xl font-bold text-ink"><I18nText en="MiXerr shot maps" ru="Карты ударов Миксер" /></h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          <I18nText
            en="Compare attacking shot locations, conceded shot locations and player shot maps from stored FotMob match payloads."
            ru="Сравнивайте точки своих ударов, допущенные удары и карты ударов игроков по сохраненным payload матчей FotMob."
          />
        </p>
      </section>

      <FilterShell
        className="mt-6"
        title={<I18nText en="Comparison setup" ru="Настройка сравнения" />}
        description={<I18nText en="Pick teams, competition scopes and match windows; the shot map updates from the URL state." ru="Выберите команды, турниры и окна матчей; карта ударов обновляется из состояния URL." />}
        resetHref="/mixerr"
      >
      <AutoSubmitForm className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-8">
        <label className="text-sm xl:order-1 xl:col-span-2">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="League" ru="Лига" /></span>
          <select name="leagueId" defaultValue={selectedLeague ? String(selectedLeague.leagueId) : ""} className="w-full rounded border border-slate-200 px-3 py-2">
            {leagueOptions.map((league) => (
              <option key={`${league.leagueId}:${league.season}`} value={String(league.leagueId)}>
                {league.displayName} - {league.season}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm xl:order-2 xl:col-span-2">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Team A" ru="Команда А" /></span>
          <select name="attackingTeamId" defaultValue={attackingTeamId} disabled={!selectedLeague} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            {teams.map((team) => (
              <option key={String(team.id)} value={String(team.id)}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="text-sm xl:order-5 xl:col-span-3">
          <legend className="mb-1 block font-medium text-slate-600"><I18nText en="Team A competitions" ru="Турниры команды А" /></legend>
          <CompetitionCheckboxList
            name="attackingCompetitionKey"
            selectedKeys={checkedAttackingCompetitionKeys}
            emptyLabel={<I18nText en="No competitions for Team A." ru="Нет турниров для команды А." />}
            options={attackingCompetitionOptions.map((competition) => ({
              key: competition.key,
              label: competition.displayName,
              description: <I18nText en={`${competition.matchesCount} shots-source matches`} ru={`Матчей-источников: ${competition.matchesCount}`} />,
              disabled: !attackingTeam
            }))}
          />
        </fieldset>
        <label className="text-sm xl:order-3 xl:col-span-2">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Team B" ru="Команда B" /></span>
          <select name="defendingTeamId" defaultValue={defendingTeamId} disabled={!selectedLeague} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            {teams.map((team) => (
              <option key={String(team.id)} value={String(team.id)}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="text-sm xl:order-6 xl:col-span-3">
          <legend className="mb-1 block font-medium text-slate-600"><I18nText en="Team B competitions" ru="Турниры команды B" /></legend>
          <CompetitionCheckboxList
            name="defendingCompetitionKey"
            selectedKeys={checkedDefendingCompetitionKeys}
            emptyLabel={<I18nText en="No competitions for Team B." ru="Нет турниров для команды B." />}
            options={defendingCompetitionOptions.map((competition) => ({
              key: competition.key,
              label: competition.displayName,
              description: <I18nText en={`${competition.matchesCount} shots-source matches`} ru={`Матчей-источников: ${competition.matchesCount}`} />,
              disabled: !defendingTeam
            }))}
          />
        </fieldset>
        <label className="text-sm xl:order-4 xl:col-span-2">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Player" ru="Игрок" /></span>
          <select name="playerId" defaultValue={playerId} disabled={!attackingTeam} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            {players.map((player) => (
              <option key={String(player.id)} value={String(player.id)}>
                {player.name}{player.position ? ` - ${player.position}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm xl:order-7">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Team A matches" ru="Матчи команды А" /></span>
          <select name="matchWindow" defaultValue={matchWindowModeValue(matchWindow)} className="w-full rounded border border-slate-200 px-3 py-2">
            <MatchWindowOptions />
          </select>
        </label>
        <label className="text-sm xl:order-8">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Team B matches" ru="Матчи команды B" /></span>
          <select name="defendingMatchWindow" defaultValue={matchWindowModeValue(defendingMatchWindow)} className="w-full rounded border border-slate-200 px-3 py-2">
            <MatchWindowOptions />
          </select>
        </label>
      </AutoSubmitForm>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={mixerrSwapHref({
            leagueId: selectedLeague ? String(selectedLeague.leagueId) : undefined,
            attackingTeamId: defendingTeamId,
            defendingTeamId: attackingTeamId,
            matchWindow: matchWindowModeValue(defendingMatchWindow),
            defendingMatchWindow: matchWindowModeValue(matchWindow)
          })}
          className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <I18nText en="Swap teams" ru="Поменять команды" />
        </Link>
      </div>
      </FilterShell>

      <ResultsToolbar
        className="mt-5"
        title={
          <I18nText
            en={`${attackingTeam?.name ?? "Team A"} vs ${defendingTeam?.name ?? "Team B"}`}
            ru={`${attackingTeam?.name ?? "Команда А"} против ${defendingTeam?.name ?? "Команда B"}`}
          />
        }
        meta={
          <I18nText
            en={`${teamShots.length} attacking shots, ${concededShots.length} conceded shots, ${playerShots.length} selected-player shots.`}
            ru={`Свои удары: ${teamShots.length}; допущенные: ${concededShots.length}; удары выбранного игрока: ${playerShots.length}.`}
          />
        }
        resetHref="/mixerr"
      />

      {leagueOptions.length === 0 || teams.length === 0 ? (
        <section className="mt-6 rounded border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-soft">
          <I18nText
            en="No shared FotMob league rosters are synced yet. Run the safe DB update, then let the 03:00 incremental ingestion populate league seasons, teams and players."
            ru="Общие составы лиг FotMob еще не синхронизированы. Запустите безопасное обновление БД, затем дождитесь инкрементальной загрузки в 03:00: она заполнит сезоны лиг, команды и игроков."
          />
        </section>
      ) : (
        <ShotMapExplorer
          teamShots={teamShots}
          concededShots={concededShots}
          playerShots={playerShots}
          overlayShots={{
            attacking: comparison.attacking_shots,
            conceded: comparison.defending_conceded_shots
          }}
          zoneSummary={comparison.summary.zones}
          windowLabel={matchWindowLabel(matchWindow)}
          defendingWindowLabel={matchWindowLabel(defendingMatchWindow)}
          windowLabelRu={matchWindowLabelRu(matchWindow)}
          defendingWindowLabelRu={matchWindowLabelRu(defendingMatchWindow)}
        />
      )}
    </main>
  );
}

function groupMixerrCompetitionOptions(options: SharedTeamCompetitionOption[]): MixerrCompetitionOption[] {
  const grouped = new Map<string, MixerrCompetitionOption>();

  for (const option of options) {
    const key = mixerrCompetitionKey(option.leagueId);
    const scope = { leagueId: option.leagueId, season: option.season };
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...option,
        key,
        matchesCount: option.matchesCount,
        latestMatchDate: option.latestMatchDate,
        primaryScope: scope,
        scopes: [scope]
      });
      continue;
    }

    const optionIsNewer = dateMs(option.latestMatchDate) > dateMs(existing.latestMatchDate);
    existing.matchesCount += option.matchesCount;
    if (!existing.scopes.some((item) => item.leagueId === scope.leagueId && item.season === scope.season)) {
      existing.scopes.push(scope);
    }
    if (optionIsNewer) existing.latestMatchDate = option.latestMatchDate;
    if (option.isCurrent || (!existing.isCurrent && optionIsNewer)) {
      existing.primaryScope = scope;
    }
    existing.isCurrent = existing.isCurrent || option.isCurrent;
    if (dateMs(option.updatedAt) > dateMs(existing.updatedAt)) existing.updatedAt = option.updatedAt;
  }

  return [...grouped.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function selectedTeamCompetitionOptions(value: SearchParamValue, options: MixerrCompetitionOption[]) {
  const requestedKeys = new Set(searchParamValues(value));
  if (requestedKeys.size === 0) return [];
  return options.filter(
    (option) => requestedKeys.has(option.key) || option.scopes.some((scope) => requestedKeys.has(sharedCompetitionKey(scope.leagueId, scope.season)))
  );
}

function defaultCompetitionOptionsForSelectedLeague(selectedLeague: SharedLeagueSeasonOption | null, options: MixerrCompetitionOption[]) {
  if (!selectedLeague) return [];
  const key = mixerrCompetitionKey(selectedLeague.leagueId);
  return options.filter((option) => option.key === key);
}

function buildShotContext(competitions: MixerrCompetitionOption[], selectedLeague: SharedLeagueSeasonOption | null) {
  if (competitions.length > 0) {
    return {
      competitionScopes: competitions.flatMap((competition) => competition.scopes)
    };
  }

  return selectedLeague ? { leagueId: selectedLeague.leagueId, season: selectedLeague.season } : {};
}

function mixerrSwapHref(params: {
  leagueId?: string;
  attackingTeamId?: string;
  defendingTeamId?: string;
  matchWindow?: string;
  defendingMatchWindow?: string;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return `/mixerr?${query.toString()}`;
}

function searchParamValues(value: SearchParamValue) {
  return (Array.isArray(value) ? value : [value]).filter((item): item is string => Boolean(item));
}

function mixerrCompetitionKey(leagueId: string | number | bigint) {
  return `league:${leagueId}`;
}

function dateMs(value: Date | null) {
  return value?.getTime() ?? 0;
}

function MatchWindowOptions() {
  return (
    <>
      <LocalizedOption value="last5" en="Last 5 team matches" ru="Последние 5 матчей команды" />
      <LocalizedOption value="last10" en="Last 10 team matches" ru="Последние 10 матчей команды" />
      <LocalizedOption value="last15" en="Last 15 team matches" ru="Последние 15 матчей команды" />
      <LocalizedOption value="current" en="Current season" ru="Текущий сезон" />
      <LocalizedOption value="previous" en="Previous season" ru="Предыдущий сезон" />
      <LocalizedOption value="all" en="All loaded matches" ru="Все загруженные матчи" />
    </>
  );
}

function emptyComparison(attackingTeamId: string, defendingTeamId: string) {
  return {
    attacking_team_id: attackingTeamId,
    defending_team_id: defendingTeamId,
    attacking_shots: [],
    defending_conceded_shots: [],
    summary: {
      attacking_shots_count: 0,
      attacking_xg: 0,
      attacking_goals: 0,
      conceded_shots_count: 0,
      conceded_xg: 0,
      conceded_goals: 0,
      zones: {
        attacking: { left_shots: 0, center_shots: 0, right_shots: 0, left_xg: 0, center_xg: 0, right_xg: 0 },
        conceded: { left_shots: 0, center_shots: 0, right_shots: 0, left_xg: 0, center_xg: 0, right_xg: 0 }
      }
    }
  };
}
