import { UserRole } from "@prisma/client";
import Link from "next/link";

import { FantasyPriceSheetImportForm } from "@/components/machete/FantasyPriceSheetImportForm";
import { FantasySquadPlanner } from "@/components/machete/FantasySquadPlanner";
import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { MacheteShell } from "@/components/machete/MacheteShell";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AutoSubmitForm } from "@/components/players/auto-submit-form";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadSharedLeagueOptions, loadSharedLeagueSeasonOptions, type SharedLeagueSeasonOption } from "@/machete/shared_read_model";
import { loadFantasySquadPlannerData } from "@/machete/squad_planner";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    leagueId?: string;
    season?: string;
  }>;
};

export default async function MacheteSquadPage({ searchParams }: PageProps) {
  const user = await requireCurrentUser();
  const params = await searchParams;
  const [leagues, leagueSeasonOptions] = await Promise.all([loadSharedLeagueOptions(prisma), loadSharedLeagueSeasonOptions(prisma)]);
  const selectedLeagueId =
    params.leagueId && leagues.some((league) => String(league.leagueId) === params.leagueId)
      ? params.leagueId
      : leagues[0]
        ? String(leagues[0].leagueId)
        : "";
  const seasonsForSelectedLeague = selectedLeagueId ? leagueSeasonOptions.filter((league) => String(league.leagueId) === selectedLeagueId) : [];
  const selectedSeason = selectedSeasonValue(params.season, seasonsForSelectedLeague);
  const selectedLeague =
    leagueSeasonOptions.find((league) => String(league.leagueId) === selectedLeagueId && league.season === selectedSeason) ??
    leagues.find((league) => String(league.leagueId) === selectedLeagueId) ??
    null;
  const data = selectedLeague ? await loadFantasySquadPlannerData(prisma, user.id, selectedLeague) : null;

  return (
    <MacheteShell>
      <div className="mt-6">
        <PageBreadcrumbs
          backHref="/machete/leagues"
          backLabel="Back to leagues"
          items={[
            { label: "Machete", href: "/machete/leagues" },
            { label: <I18nText en="Squad" ru="Состав" />, href: "/machete/squad" }
          ]}
        />
      </div>

      <section className="mt-8 rounded border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Fantasy planning" ru="Фэнтези-планирование" /></p>
            <h2 className="mt-2 text-2xl font-bold text-ink"><I18nText en="Squad picker and transfer planner" ru="Состав и трансферный план" /></h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              <I18nText
                en="Build a user squad for each league, project the next rounds, and let Machete suggest transfers that improve the next round without dropping over the selected horizon."
                ru="Собирайте состав для каждой лиги, прогнозируйте ближайшие туры и получайте трансферные подсказки Machete без просадки на выбранном горизонте."
              />
            </p>
          </div>
          <Link href={machetePlayersHref(selectedLeague)} className="inline-flex items-center justify-center rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <I18nText en="Player explorer" ru="Таблица игроков" />
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(420px,1.2fr)]">
          <AutoSubmitForm className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(160px,0.55fr)_auto]">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600"><I18nText en="League" ru="Лига" /></span>
              <select name="leagueId" defaultValue={selectedLeagueId} className="w-full rounded border border-slate-200 px-3 py-2">
                {leagues.map((league) => (
                  <option key={`${league.leagueId}:${league.season}`} value={String(league.leagueId)}>
                    {league.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
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
            <button type="submit" className="self-end rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              <I18nText en="Load" ru="Загрузить" />
            </button>
          </AutoSubmitForm>
          {selectedLeague ? (
            <FantasyPriceSheetImportForm leagueId={String(selectedLeague.leagueId)} season={selectedLeague.season} canImport={user.role === UserRole.ADMIN} />
          ) : null}
        </div>
      </section>

      {selectedLeague && data ? (
        <FantasySquadPlanner
          leagueId={String(selectedLeague.leagueId)}
          season={selectedLeague.season}
          rules={data.rules}
          rounds={data.rounds}
          players={data.players}
          initialSquad={data.squad}
          priceStatus={data.priceStatus}
        />
      ) : (
        <div className="mt-8 rounded border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          <I18nText en="No Machete league data is loaded yet. Run the shared FotMob ingestion first." ru="Данные лиги Machete пока не загружены. Сначала запустите общий FotMob ingestion." />
        </div>
      )}
    </MacheteShell>
  );
}

function selectedSeasonValue(requestedSeason: string | undefined, seasons: SharedLeagueSeasonOption[]) {
  if (requestedSeason && seasons.some((league) => league.season === requestedSeason)) return requestedSeason;
  return seasons.find((league) => league.isCurrent)?.season ?? seasons[0]?.season ?? "";
}

function machetePlayersHref(league: SharedLeagueSeasonOption | null) {
  if (!league) return "/machete/players";

  const query = new URLSearchParams({
    leagueId: String(league.leagueId),
    season: league.season
  });

  return `/machete/players?${query.toString()}`;
}
