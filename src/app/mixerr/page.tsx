import { ShotMapExplorer } from "@/components/mixerr/ShotMapExplorer";
import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { CompetitionCheckboxList } from "@/components/ui/competition-checkbox-list";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/ui/active-filter-chips";
import { CopyCurrentLinkButton } from "@/components/ui/copy-current-link-button";
import { FilterShell } from "@/components/ui/filter-shell";
import { ResultsToolbar } from "@/components/ui/results-toolbar";
import { prisma } from "@/lib/db";
import { compactPlayerDisplayName } from "@/lib/players/display-name";
import Link from "next/link";
import {
  loadSharedLeagueOptions,
  loadSharedLeagueSeasonOptions,
  loadSharedLeagueTeams,
  loadSharedTeamCompetitionOptions,
  loadSharedTeamPlayers,
  sharedCompetitionKey,
  type SharedLeagueSeasonOption,
  type SharedPlayerOption,
  type SharedTeamCompetitionOption,
  type SharedTeamOption
} from "@/machete/shared_read_model";
import {
  get_player_shots_for_team_window,
  get_shot_map_comparison_for_windows,
  get_team_shots_for_window
} from "@/lib/shot-maps";
import { matchWindowLabel, matchWindowLabelRu, matchWindowModeValue, parseMacheteMatchWindow } from "@/scoring/machete/match-window";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

type MixerrSearchParams = {
  leagueId?: string;
  season?: string;
  attackingTeamId?: string;
  defendingTeamId?: string;
  attackingCompetitionKey?: SearchParamValue;
  defendingCompetitionKey?: SearchParamValue;
  playerId?: string;
  matchWindow?: string;
  defendingMatchWindow?: string;
};

type PageProps = {
  searchParams?: Promise<MixerrSearchParams>;
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
  const [leagueOptions, leagueSeasonOptions] = await Promise.all([loadSharedLeagueOptions(prisma), loadSharedLeagueSeasonOptions(prisma)]);
  const selectedLeagueId =
    resolvedSearchParams.leagueId && leagueOptions.some((league) => String(league.leagueId) === resolvedSearchParams.leagueId)
      ? resolvedSearchParams.leagueId
      : leagueOptions[0]
        ? String(leagueOptions[0].leagueId)
        : "";
  const seasonsForSelectedLeague = selectedLeagueId ? leagueSeasonOptions.filter((league) => String(league.leagueId) === selectedLeagueId) : [];
  const selectedSeason = selectedSeasonValue(resolvedSearchParams.season, seasonsForSelectedLeague);
  const selectedLeague =
    leagueSeasonOptions.find((league) => String(league.leagueId) === selectedLeagueId && league.season === selectedSeason) ??
    leagueOptions.find((league) => String(league.leagueId) === selectedLeagueId) ??
    null;
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
  const activeFilterChips = buildMixerrActiveChips({
    searchParams: resolvedSearchParams,
    selectedLeague,
    selectedSeason,
    attackingTeam,
    defendingTeam,
    selectedAttackingCompetitions,
    selectedDefendingCompetitions,
    player,
    matchWindow,
    defendingMatchWindow
  });

  const [teamShots, playerShots, comparison] = attackingTeamId
    ? await Promise.all([
        get_team_shots_for_window(prisma, attackingTeamId, matchWindow, attackingShotContext),
        playerId ? get_player_shots_for_team_window(prisma, playerId, attackingTeamId, matchWindow, attackingShotContext) : Promise.resolve([]),
        defendingTeamId
          ? get_shot_map_comparison_for_windows(prisma, attackingTeamId, defendingTeamId, matchWindow, defendingMatchWindow, attackingShotContext, defendingShotContext)
          : Promise.resolve(emptyComparison(attackingTeamId, defendingTeamId))
      ])
    : [[], [], emptyComparison(attackingTeamId, defendingTeamId)];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 2xl:max-w-[1600px] 3xl:max-w-[1760px]">
      <section className="border-b border-slate-200 pb-6">
        <p className="kicker">MiXerr / FotMob</p>
        <h1 className="mt-2 text-[clamp(26px,3.4vw,40px)] font-bold leading-[1.08] tracking-[-0.03em] text-ink"><I18nText en="MiXerr shot maps" ru="Карты ударов Миксер" /></h1>
      </section>

      <FilterShell
        className="mt-6"
        title={<I18nText en="Comparison setup" ru="Настройка сравнения" />}
        resetHref="/mixerr"
      >
      <AutoSubmitForm className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-9">
        <label className="text-sm xl:order-1 xl:col-span-2">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="League" ru="Лига" /></span>
          <select name="leagueId" defaultValue={selectedLeagueId} className="w-full rounded border border-slate-200 px-3 py-2">
            {leagueOptions.map((league) => (
              <option key={String(league.leagueId)} value={String(league.leagueId)}>
                {league.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm xl:order-2">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Season" ru={"\u0421\u0435\u0437\u043e\u043d"} /></span>
          <select name="season" defaultValue={selectedSeason} disabled={!selectedLeagueId} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            <LocalizedOption value="" en="Choose league first" ru={"\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043b\u0438\u0433\u0443"} />
            {seasonsForSelectedLeague.map((league) => (
              <option key={`${league.leagueId}:${league.season}`} value={league.season}>
                {league.season}{league.isCurrent ? " - current" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm xl:order-3 xl:col-span-2">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Team A" ru="Команда А" /></span>
          <select name="attackingTeamId" defaultValue={attackingTeamId} disabled={!selectedLeague} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            {teams.map((team) => (
              <option key={String(team.id)} value={String(team.id)}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="text-sm xl:order-6 xl:col-span-3">
          <legend className="mb-1 block font-medium text-slate-600"><I18nText en="Team A competitions" ru="Турниры команды А" /></legend>
          <CompetitionCheckboxList
            name="attackingCompetitionKey"
            selectedKeys={checkedAttackingCompetitionKeys}
            emptyLabel={<I18nText en="No competitions for Team A." ru="Нет турниров для команды А." />}
            options={attackingCompetitionOptions.map((competition) => ({
              key: competition.key,
              label: `${competition.displayName} - ${competition.primaryScope.season}`,
              description: <I18nText en={`${competition.matchesCount} shots-source matches`} ru={`Матчей-источников: ${competition.matchesCount}`} />,
              disabled: !attackingTeam
            }))}
          />
        </fieldset>
        <label className="text-sm xl:order-4 xl:col-span-2">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Team B" ru="Команда B" /></span>
          <select name="defendingTeamId" defaultValue={defendingTeamId} disabled={!selectedLeague} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            {teams.map((team) => (
              <option key={String(team.id)} value={String(team.id)}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="text-sm xl:order-7 xl:col-span-3">
          <legend className="mb-1 block font-medium text-slate-600"><I18nText en="Team B competitions" ru="Турниры команды B" /></legend>
          <CompetitionCheckboxList
            name="defendingCompetitionKey"
            selectedKeys={checkedDefendingCompetitionKeys}
            emptyLabel={<I18nText en="No competitions for Team B." ru="Нет турниров для команды B." />}
            options={defendingCompetitionOptions.map((competition) => ({
              key: competition.key,
              label: `${competition.displayName} - ${competition.primaryScope.season}`,
              description: <I18nText en={`${competition.matchesCount} shots-source matches`} ru={`Матчей-источников: ${competition.matchesCount}`} />,
              disabled: !defendingTeam
            }))}
          />
        </fieldset>
        <label className="text-sm xl:order-5 xl:col-span-2">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Player" ru="Игрок" /></span>
          <select name="playerId" defaultValue={playerId} disabled={!attackingTeam} className="w-full rounded border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            {players.map((player) => (
              <option key={String(player.id)} value={String(player.id)}>
                {compactPlayerDisplayName(player.name)}{player.position ? ` - ${player.position}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm xl:order-8">
          <span className="mb-1 block font-medium text-slate-600"><I18nText en="Team A matches" ru="Матчи команды А" /></span>
          <select name="matchWindow" defaultValue={matchWindowModeValue(matchWindow)} className="w-full rounded border border-slate-200 px-3 py-2">
            <MatchWindowOptions />
          </select>
        </label>
        <label className="text-sm xl:order-9">
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
            season: selectedLeague?.season,
            attackingTeamId: defendingTeamId,
            defendingTeamId: attackingTeamId,
            matchWindow: matchWindowModeValue(defendingMatchWindow),
            defendingMatchWindow: matchWindowModeValue(matchWindow)
          })}
          className="btn-brand inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold shadow-elev"
        >
          <span aria-hidden="true">⇄</span>
          <I18nText en="Swap teams" ru="Поменять команды" />
        </Link>
        {matchWindowModeValue(matchWindow) !== matchWindowModeValue(defendingMatchWindow) ? (
          <span role="status" className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            <I18nText
              en={`Mismatched windows: A=${matchWindowLabel(matchWindow)} · B=${matchWindowLabel(defendingMatchWindow)}`}
              ru={`Разные окна: А=${matchWindowLabelRu(matchWindow)} · B=${matchWindowLabelRu(defendingMatchWindow)}`}
            />
          </span>
        ) : null}
      </div>
      </FilterShell>
      <ActiveFilterChips className="mt-3" chips={activeFilterChips} resetHref="/mixerr" />

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
            en={`A ${teamShots.length} · B conceded ${comparison.defending_conceded_shots.length} · Player ${playerShots.length}`}
            ru={`A ${teamShots.length} · B допущено ${comparison.defending_conceded_shots.length} · Игрок ${playerShots.length}`}
          />
        }
      >
        <CopyCurrentLinkButton />
      </ResultsToolbar>

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
          playerShots={playerShots}
          overlayShots={{
            attacking: comparison.attacking_shots,
            conceded: comparison.defending_conceded_shots
          }}
          zoneSummary={comparison.summary.zones}
        />
      )}
    </main>
  );
}

function selectedSeasonValue(requestedSeason: string | undefined, seasons: SharedLeagueSeasonOption[]) {
  if (requestedSeason && seasons.some((league) => league.season === requestedSeason)) return requestedSeason;
  return seasons.find((league) => league.isCurrent)?.season ?? seasons[0]?.season ?? "";
}

function buildMixerrActiveChips({
  searchParams,
  selectedLeague,
  selectedSeason,
  attackingTeam,
  defendingTeam,
  selectedAttackingCompetitions,
  selectedDefendingCompetitions,
  player,
  matchWindow,
  defendingMatchWindow
}: {
  searchParams: MixerrSearchParams;
  selectedLeague: SharedLeagueSeasonOption | null;
  selectedSeason: string;
  attackingTeam: SharedTeamOption | null;
  defendingTeam: SharedTeamOption | null;
  selectedAttackingCompetitions: MixerrCompetitionOption[];
  selectedDefendingCompetitions: MixerrCompetitionOption[];
  player: SharedPlayerOption | null;
  matchWindow: ReturnType<typeof parseMacheteMatchWindow>;
  defendingMatchWindow: ReturnType<typeof parseMacheteMatchWindow>;
}): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (searchParams.leagueId && selectedLeague) {
    chips.push({
      key: `league:${selectedLeague.leagueId}`,
      label: <><I18nText en="League" ru={"\u041b\u0438\u0433\u0430"} />: {selectedLeague.displayName}</>,
      removeHref: mixerrFilterHrefWithout(
        searchParams,
        "leagueId",
        "season",
        "attackingTeamId",
        "defendingTeamId",
        "attackingCompetitionKey",
        "defendingCompetitionKey",
        "playerId"
      )
    });
  }

  if (searchParams.season && selectedSeason) {
    chips.push({
      key: `season:${selectedSeason}`,
      label: <><I18nText en="Season" ru={"\u0421\u0435\u0437\u043e\u043d"} />: {selectedSeason}</>,
      removeHref: mixerrFilterHrefWithout(searchParams, "season", "attackingTeamId", "defendingTeamId", "attackingCompetitionKey", "defendingCompetitionKey", "playerId")
    });
  }

  if (searchParams.attackingTeamId && attackingTeam) {
    chips.push({
      key: `team-a:${attackingTeam.id}`,
      label: <><I18nText en="Team A" ru={"\u041a\u043e\u043c\u0430\u043d\u0434\u0430 \u0410"} />: {attackingTeam.name}</>,
      removeHref: mixerrFilterHrefWithout(searchParams, "attackingTeamId", "attackingCompetitionKey", "playerId")
    });
  }

  if (searchParams.defendingTeamId && defendingTeam) {
    chips.push({
      key: `team-b:${defendingTeam.id}`,
      label: <><I18nText en="Team B" ru={"\u041a\u043e\u043c\u0430\u043d\u0434\u0430 B"} />: {defendingTeam.name}</>,
      removeHref: mixerrFilterHrefWithout(searchParams, "defendingTeamId", "defendingCompetitionKey")
    });
  }

  for (const competition of selectedAttackingCompetitions) {
    chips.push({
      key: `team-a-comp:${competition.key}`,
      label: <><I18nText en="Team A comp" ru={"\u0422\u0443\u0440\u043d\u0438\u0440 A"} />: {mixerrCompetitionLabel(competition)}</>,
      removeHref: mixerrFilterHrefRemovingCompetition(searchParams, "attackingCompetitionKey", competition)
    });
  }

  for (const competition of selectedDefendingCompetitions) {
    chips.push({
      key: `team-b-comp:${competition.key}`,
      label: <><I18nText en="Team B comp" ru={"\u0422\u0443\u0440\u043d\u0438\u0440 B"} />: {mixerrCompetitionLabel(competition)}</>,
      removeHref: mixerrFilterHrefRemovingCompetition(searchParams, "defendingCompetitionKey", competition)
    });
  }

  if (searchParams.playerId && player) {
    chips.push({
      key: `player:${player.id}`,
      label: <><I18nText en="Player" ru={"\u0418\u0433\u0440\u043e\u043a"} />: {compactPlayerDisplayName(player.name)}</>,
      removeHref: mixerrFilterHrefWithout(searchParams, "playerId")
    });
  }

  if (searchParams.matchWindow) {
    chips.push({
      key: `window-a:${matchWindowModeValue(matchWindow)}`,
      label: <><I18nText en="Team A window" ru={"\u041e\u043a\u043d\u043e A"} />: {matchWindowLabel(matchWindow)}</>,
      removeHref: mixerrFilterHrefWithout(searchParams, "matchWindow")
    });
  }

  if (searchParams.defendingMatchWindow) {
    chips.push({
      key: `window-b:${matchWindowModeValue(defendingMatchWindow)}`,
      label: <><I18nText en="Team B window" ru={"\u041e\u043a\u043d\u043e B"} />: {matchWindowLabel(defendingMatchWindow)}</>,
      removeHref: mixerrFilterHrefWithout(searchParams, "defendingMatchWindow")
    });
  }

  return chips;
}

function groupMixerrCompetitionOptions(options: SharedTeamCompetitionOption[]): MixerrCompetitionOption[] {
  const grouped = new Map<string, MixerrCompetitionOption>();

  for (const option of options) {
    const key = sharedCompetitionKey(option.leagueId, option.season);
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

  return [...grouped.values()].sort((left, right) => left.displayName.localeCompare(right.displayName) || dateMs(right.updatedAt) - dateMs(left.updatedAt));
}

function selectedTeamCompetitionOptions(value: SearchParamValue, options: MixerrCompetitionOption[]) {
  const requestedKeys = new Set(searchParamValues(value));
  if (requestedKeys.size === 0) return [];
  return options.filter(
    (option) =>
      requestedKeys.has(option.key) ||
      requestedKeys.has(mixerrCompetitionKey(option.leagueId)) ||
      option.scopes.some((scope) => requestedKeys.has(sharedCompetitionKey(scope.leagueId, scope.season)) || requestedKeys.has(mixerrCompetitionKey(scope.leagueId)))
  );
}

function defaultCompetitionOptionsForSelectedLeague(selectedLeague: SharedLeagueSeasonOption | null, options: MixerrCompetitionOption[]) {
  if (!selectedLeague) return [];
  return options.filter((option) => option.scopes.some((scope) => scope.leagueId === selectedLeague.leagueId && scope.season === selectedLeague.season));
}

function buildShotContext(competitions: MixerrCompetitionOption[], selectedLeague: SharedLeagueSeasonOption | null) {
  if (competitions.length > 0) {
    return {
      competitionScopes: competitions.flatMap((competition) => competition.scopes)
    };
  }

  return selectedLeague ? { leagueId: selectedLeague.leagueId, season: selectedLeague.season } : {};
}

function mixerrCompetitionLabel(competition: MixerrCompetitionOption) {
  return `${competition.displayName} ${competition.primaryScope.season}`;
}

function mixerrFilterHrefWithout(params: MixerrSearchParams, ...keys: Array<keyof MixerrSearchParams>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (keys.includes(key as keyof MixerrSearchParams)) continue;
    for (const item of searchParamValues(value)) query.append(key, item);
  }
  const qs = query.toString();
  return `/mixerr${qs ? `?${qs}` : ""}`;
}

function mixerrFilterHrefRemovingCompetition(params: MixerrSearchParams, key: keyof MixerrSearchParams, competition: MixerrCompetitionOption) {
  const valuesToRemove = new Set([
    competition.key,
    mixerrCompetitionKey(competition.leagueId),
    ...competition.scopes.map((scope) => sharedCompetitionKey(scope.leagueId, scope.season))
  ]);
  const query = new URLSearchParams();
  for (const [paramKey, value] of Object.entries(params)) {
    const items = searchParamValues(value);
    for (const item of items) {
      if (paramKey === key && valuesToRemove.has(item)) continue;
      query.append(paramKey, item);
    }
  }
  const qs = query.toString();
  return `/mixerr${qs ? `?${qs}` : ""}`;
}

function mixerrSwapHref(params: {
  leagueId?: string;
  season?: string;
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
      <LocalizedOption value="last3" en="Last 3 team matches" ru="Последние 3 матча команды" />
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
