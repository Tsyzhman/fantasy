import { ArrowRight, Crosshair, Database, RadioTower } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { I18nText } from "@/components/i18n-text";

const mixerPhotoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/KitchenAid_Stand_Mixer.jpg/960px-KitchenAid_Stand_Mixer.jpg";

const modes = [
  {
    nameEn: "Machete",
    nameRu: "Мачете",
    href: "/machete/leagues",
    imageSrc: "/mode-logos/fotmob-mode.png",
    imageClassName: "h-20 w-20 object-contain",
    icon: RadioTower,
    kickerEn: "FotMob mode",
    kickerRu: "Режим FotMob",
    titleEn: "Live data scouting",
    titleRu: "Скаутинг на данных FotMob",
    descriptionEn: "Sync leagues, teams, fixtures and player stats from FotMob, then compare players through fantasy scoring.",
    descriptionRu: "Синхронизируйте лиги, команды, календарь и статистику игроков FotMob, а затем сравнивайте игроков по fantasy-очкам.",
    ctaEn: "Open Machete",
    ctaRu: "Открыть Мачете"
  },
  {
    nameEn: "Baltika",
    nameRu: "Балтика",
    href: "/baltika/leagues",
    imageSrc: "/mode-logos/wyscout-mode.jpg",
    imageClassName: "h-20 w-20 rounded-full object-cover",
    icon: Database,
    kickerEn: "Wyscout Excel mode",
    kickerRu: "Режим Wyscout Excel",
    titleEn: "Excel-first fantasy workspace",
    titleRu: "Fantasy-работа через Excel",
    descriptionEn: "Upload Wyscout player files and Team Stats spreadsheets by team or in bulk, then publish clean fantasy datasets.",
    descriptionRu: "Загружайте Wyscout-файлы игроков и Team Stats по одной команде или массово, затем публикуйте готовые fantasy-данные.",
    ctaEn: "Open Baltika",
    ctaRu: "Открыть Балтику"
  },
  {
    nameEn: "MiXerr",
    nameRu: "Миксер",
    href: "/mixerr",
    imageSrc: mixerPhotoUrl,
    imageClassName: "h-20 w-20 rounded-full object-cover",
    imageExternal: true,
    icon: Crosshair,
    kickerEn: "FotMob shot-map mode",
    kickerRu: "Режим shot-map FotMob",
    titleEn: "Shot-map comparison",
    titleRu: "Сравнение карт ударов",
    descriptionEn: "Collect individual FotMob shots with coordinates, then compare team attacking maps, conceded maps and player shot maps.",
    descriptionRu: "Собирайте удары FotMob с координатами, затем сравнивайте атакующие, допущенные и индивидуальные карты ударов.",
    ctaEn: "Open MiXerr",
    ctaRu: "Открыть MiXerr"
  }
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          <I18nText en="Choose workspace" ru="Выберите режим" />
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          <I18nText en="Fantasy Scout" ru="Fantasy Scout" />
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          <I18nText
            en="Two workflows for the same goal: find useful fantasy players faster. Pick Machete for FotMob sync or Baltika for Wyscout Excel imports."
            ru="Два рабочих сценария для одной цели: быстрее находить полезных fantasy-игроков. Выберите Мачете для синхронизации FotMob или Балтику для импортов Wyscout Excel."
          />
        </p>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {modes.map((mode) => {
          const Icon = mode.icon;

          return (
            <Link
              key={mode.href}
              href={mode.href}
              className="group rounded border border-slate-200 bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="mode-logo-frame mode-logo-frame-choice">
                    {mode.imageExternal ? (
                      <img src={mode.imageSrc} alt="" className={`mode-logo-image ${mode.imageClassName}`} />
                    ) : (
                      <Image
                        src={mode.imageSrc}
                        alt=""
                        width={96}
                        height={96}
                        className={`mode-logo-image ${mode.imageClassName}`}
                        priority
                      />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <Icon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                      <I18nText en={mode.kickerEn} ru={mode.kickerRu} />
                    </p>
                    <h2 className="mt-2 text-2xl font-bold text-ink">
                      <I18nText en={mode.nameEn} ru={mode.nameRu} />
                    </h2>
                  </div>
                </div>
                <ArrowRight className="mt-2 h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-ink" />
              </div>

              <div className="mt-6">
                <h3 className="text-base font-semibold text-ink">
                  <I18nText en={mode.titleEn} ru={mode.titleRu} />
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  <I18nText en={mode.descriptionEn} ru={mode.descriptionRu} />
                </p>
              </div>

              <span className="mt-6 inline-flex items-center gap-2 rounded bg-ink px-3 py-2 text-sm font-semibold text-white group-hover:bg-slate-700">
                <I18nText en={mode.ctaEn} ru={mode.ctaRu} />
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
