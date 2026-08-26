import { ArrowRight, Database, RadioTower } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { I18nText } from "@/components/i18n-text";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PlayerSource = "machete" | "baltika" | "all";

const sourceCards: Array<{
  source: Exclude<PlayerSource, "all">;
  href: string;
  icon: typeof RadioTower;
  kickerEn: string;
  kickerRu: string;
  titleEn: string;
  titleRu: string;
  descriptionEn: string;
  descriptionRu: string;
}> = [
  {
    source: "machete",
    href: "/machete/players",
    icon: RadioTower,
    kickerEn: "FotMob / Sports.ru",
    kickerRu: "FotMob / Sports.ru",
    titleEn: "Machete players",
    titleRu: "Игроки Мачете",
    descriptionEn: "Use live FotMob aggregates, fantasy price mapping, match windows, starters, and compare mode.",
    descriptionRu: "Работайте с агрегатами FotMob, ценами Sports.ru, окнами матчей, стартерами и сравнением игроков."
  },
  {
    source: "baltika",
    href: "/baltika/players",
    icon: Database,
    kickerEn: "Wyscout Excel",
    kickerRu: "Wyscout Excel",
    titleEn: "Baltika players",
    titleRu: "Игроки Балтики",
    descriptionEn: "Use published Wyscout snapshots with Excel-first filters, starter status, and compare mode.",
    descriptionRu: "Работайте с опубликованными Wyscout-снимками, Excel-фильтрами, статусом старта и сравнением."
  }
];

export default async function PlayersEntryPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const source = parseSource(resolvedSearchParams.source);
  const forwardedParams = paramsWithoutSource(resolvedSearchParams);

  if (source === "machete") redirect(`/machete/players${forwardedParams}`);
  if (source === "baltika") redirect(`/baltika/players${forwardedParams}`);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageBreadcrumbs
        backHref="/"
        backLabel={<I18nText en="Back to workspaces" ru="Назад к режимам" />}
        items={[{ label: <I18nText en="Players" ru="Игроки" />, href: "/players" }]}
      />

      <section className="mt-5 max-w-3xl">
        <p className="kicker">
          <I18nText en="Unified player entry" ru="Единый вход в игроков" />
        </p>
        <h1 className="mt-2 text-3xl font-bold text-ink">
          <I18nText en="Choose a player source" ru="Выберите источник игроков" />
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          <I18nText
            en="Machete and Baltika use different source models today, so the combined view starts as a clean switchboard while preserving filters in the URL."
            ru="Мачете и Балтика пока используют разные модели источников, поэтому общий экран работает как аккуратный переключатель и сохраняет фильтры в URL."
          />
        </p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {sourceCards.map((card) => {
          const Icon = card.icon;
          const href = `${card.href}${forwardedParams}`;

          return (
            <Link
              key={card.source}
              href={href}
              className="group ui-card p-5 transition-[border-color,box-shadow,background-color] hover:border-brand-300 hover:bg-slate-50 hover:shadow-elev"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded border border-slate-200 bg-slate-50 text-brand-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <I18nText en={card.kickerEn} ru={card.kickerRu} />
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-ink">
                      <I18nText en={card.titleEn} ru={card.titleRu} />
                    </h2>
                  </div>
                </div>
                <ArrowRight className="mt-2 h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-ink" />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                <I18nText en={card.descriptionEn} ru={card.descriptionRu} />
              </p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}

function parseSource(value: string | string[] | undefined): PlayerSource {
  const source = Array.isArray(value) ? value[0] : value;
  if (source === "machete" || source === "baltika") return source;
  return "all";
}

function paramsWithoutSource(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "source") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string" && item !== "") query.append(key, item);
    }
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}
