import { I18nText } from "@/components/i18n-text";
import {
  projectionFormulaFieldPaths,
  type ProjectionFormulaConfig
} from "@/machete/projection-formula-config";

const historyWindowFields = ["L1", "L5", "L10", "365"].flatMap((window) => [
  `{Matches ${window}}`,
  `{Minutes ${window}}`,
  `{Minutes per match ${window}}`,
  `{Appearance rate ${window}}`,
  `{Sixty rate ${window}}`,
  `{Full match rate ${window}}`,
  `{xG per 90 ${window}}`,
  `{xA per 90 ${window}}`,
  `{Recoveries per 90 ${window}}`,
  `{Saves per 90 ${window}}`,
  `{Yellow cards per 90 ${window}}`,
  `{Red cards per 90 ${window}}`,
  `{Has data ${window}}`
]);

const sectionMeta = {
  history: {
    en: "1. History windows and player rates",
    ru: "1. Исторические окна и показатели игрока",
    descriptionEn: "These formulas decide how much L1, L5, L10 and 365-day form affects minutes and per-90 rates.",
    descriptionRu: "Эти формулы определяют влияние формы за L1, L5, L10 и 365 дней на минуты и показатели за 90 минут.",
    fields: historyWindowFields
  },
  team: {
    en: "2. Fixture and team forecast",
    ru: "2. Прогноз матча и команды",
    descriptionEn: "Controls FotMob xG/xGA, bookmaker influence, assists per goal and clean-sheet probability.",
    descriptionRu: "Управляет xG/xGA FotMob, влиянием букмекера, ассистами на гол и вероятностью клиншита.",
    fields: ["{Projected xG}", "{Projected xGA}", "{Bookmaker implied xG}", "{Bookmaker odds available}", "{Fixture clean sheet probability}", "{Fixture team over 1.5 probability}", "{Fixture attack multiplier}", "{Fixture defense multiplier}", "{Is home}", "{Is away}", "{Expected goals}", "{Expected goals against}", "{Assists per goal}"]
  },
  allocation: {
    en: "3. Player allocation weights",
    ru: "3. Веса распределения между игроками",
    descriptionEn: "These are the numerators. The engine normalizes them across the team so player shares sum to the team total.",
    descriptionRu: "Это числители долей. Движок нормализует их внутри команды, чтобы индивидуальные доли давали командный итог.",
    fields: ["{Expected minutes}", "{Appearance probability}", "{60 minute probability}", "{Full match probability}", "{Blended xG per 90}", "{Blended xA per 90}", "{Blended recoveries per 90}", "{Blended saves per 90}", "{Blended yellow cards per 90}", "{Blended red cards per 90}", "{Expected goals}", "{Expected goals against}", "{Assists per goal}", "{Clean sheet probability}", "{Bookmaker odds available}", "{Is home}", "{Is away}"]
  },
  scoreByPosition: {
    en: "4. Final fantasy points by position",
    ru: "4. Итоговые фэнтези-очки по позициям",
    descriptionEn: "Uses expected events and probabilities, not opaque pre-multiplied FP modules.",
    descriptionRu: "Использует ожидаемые события и вероятности, а не непрозрачные заранее умноженные FP-модули.",
    fields: ["{Expected minutes}", "{Appearance probability}", "{60 minute probability}", "{Full match probability}", "{Expected goals}", "{Expected assists}", "{Expected clean sheets}", "{Expected saves}", "{Expected recoveries}", "{Expected goals conceded}", "{Expected yellow cards}", "{Expected red cards}"]
  }
} as const;

const fieldLabels: Record<string, { en: string; ru: string }> = {
  expectedMinutes: { en: "Expected minutes", ru: "Ожидаемые минуты" },
  appearanceProbability: { en: "Appearance probability", ru: "Вероятность выхода" },
  sixtyProbability: { en: "60-minute probability", ru: "Вероятность 60+ минут" },
  fullMatchProbability: { en: "Full-match probability", ru: "Вероятность полного матча" },
  xgRate: { en: "Blended xG per 90", ru: "Смешанный xG за 90" },
  xaRate: { en: "Blended xA per 90", ru: "Смешанный xA за 90" },
  recoveryRate: { en: "Recoveries per 90", ru: "Возвраты мяча за 90" },
  saveRate: { en: "Saves per 90", ru: "Сейвы за 90" },
  yellowRate: { en: "Yellow cards per 90", ru: "Жёлтые карточки за 90" },
  redRate: { en: "Red cards per 90", ru: "Красные карточки за 90" },
  expectedGoals: { en: "Team expected goals", ru: "Ожидаемые голы команды" },
  expectedGoalsAgainst: { en: "Team expected goals against", ru: "Ожидаемые пропущенные команды" },
  assistsPerGoal: { en: "Assists per goal", ru: "Ассисты на гол" },
  cleanSheetProbability: { en: "Clean-sheet probability", ru: "Вероятность клиншита" },
  goals: { en: "Goal allocation weight", ru: "Вес распределения голов" },
  assists: { en: "Assist allocation weight", ru: "Вес распределения ассистов" },
  recoveries: { en: "Recovery allocation weight", ru: "Вес распределения возвратов" },
  saves: { en: "Save allocation weight", ru: "Вес распределения сейвов" },
  cardExposure: { en: "Card exposure", ru: "Экспозиция карточек" },
  GK: { en: "GK final FP", ru: "Итоговое ФО GK" },
  DEF: { en: "DEF final FP", ru: "Итоговое ФО DEF" },
  MID: { en: "MID final FP", ru: "Итоговое ФО MID" },
  FWD: { en: "FWD final FP", ru: "Итоговое ФО FWD" }
};

export function ProjectionFormulaEditor({
  config,
  prefix,
  tone = "emerald"
}: {
  config: ProjectionFormulaConfig;
  prefix: string;
  tone?: "emerald" | "amber";
}) {
  const border = tone === "amber" ? "border-amber-200" : "border-emerald-200";
  const background = tone === "amber" ? "bg-amber-50" : "bg-emerald-50";

  return (
    <div className="space-y-4">
      {Object.entries(sectionMeta).map(([section, meta]) => {
        const fields = projectionFormulaFieldPaths.filter(([candidate]) => candidate === section);
        return (
          <section key={section} className={`rounded border ${border} ${background} p-4`}>
            <h3 className="font-semibold text-ink"><I18nText en={meta.en} ru={meta.ru} /></h3>
            <p className="mt-1 text-xs text-slate-600"><I18nText en={meta.descriptionEn} ru={meta.descriptionRu} /></p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {fields.map(([, key]) => {
                const label = fieldLabels[key] ?? { en: key, ru: key };
                const value = (config[section as keyof ProjectionFormulaConfig] as unknown as Record<string, string>)[key];
                return (
                  <label key={key} className="rounded bg-white p-3 text-xs font-semibold text-slate-600">
                    <I18nText en={label.en} ru={label.ru} />
                    <textarea
                      name={`${prefix}.${section}.${key}`}
                      defaultValue={value}
                      rows={section === "scoreByPosition" ? 5 : 3}
                      maxLength={4_000}
                      spellCheck={false}
                      className="mt-1 w-full rounded border border-slate-200 px-3 py-2 font-mono text-xs font-normal leading-5 text-ink outline-none focus:border-slate-400"
                    />
                  </label>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {meta.fields.map((field) => <code key={field} className="rounded bg-white px-2 py-1 text-[11px] text-slate-600">{field}</code>)}
            </div>
          </section>
        );
      })}
      <p className="rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        <I18nText
          en="Syntax: + - * / ^, parentheses, min, max, clamp, abs, sqrt, pow, exp, log, if, coalesce, safe_div, gt/gte/lt/lte/eq and poisson_groups. Formulas are parsed safely without eval."
          ru="Синтаксис: + - * / ^, скобки, min, max, clamp, abs, sqrt, pow, exp, log, if, coalesce, safe_div, gt/gte/lt/lte/eq и poisson_groups. Формулы разбираются безопасно, без eval."
        />
      </p>
    </div>
  );
}
