import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { SortableTable } from "@/components/sortable-table";
import { prisma } from "@/lib/db";
import { formatPositionPoints, scoringFieldGuide } from "@/lib/scoring/field-guide";
import {
  alternativeFormulaFields,
  customFormulaFields,
  customFormulaForPosition,
  defaultFormulaByPosition,
  defaultScoringFormulaByPosition,
  hasAnyAlternativeFormula,
  hasAnyCustomFormula,
  hasAnyScoringFormula,
  scoringFormulaFields
} from "@/lib/scoring/formula-display";
import { validateCustomFormula } from "@/lib/scoring/formula";
import type { ScoringModelSource } from "@/lib/scoring";
import { recalculateSnapshotsForSource } from "@/lib/scoring/recalculate-snapshots";
import { seedRules } from "@/lib/scoring/rules";
import { formulaAlias, sourceFormulaFields, type SourceFormulaField } from "@/lib/scoring/source-field-guide";
import { requireAdminUser } from "@/lib/auth";

type ModelSettingsPageProps = {
  source: ScoringModelSource;
  modeName: ReactNode;
  title: ReactNode;
  description: ReactNode;
  backHref: string;
  backLabel: ReactNode;
  searchParams?: {
    error?: string;
    saved?: string;
  };
};

type FormulaFieldKey = (typeof customFormulaFields)[number]["key"];
type ScoringFieldKey = (typeof scoringFormulaFields)[number]["key"];
type AlternativeFieldKey = (typeof alternativeFormulaFields)[number]["key"];

const sourceConfig: Record<ScoringModelSource, { name: string; description: string; path: string }> = {
  WYSCOUT: {
    name: "Baltika Fantasy 2025/26",
    description: "Position-aware fantasy scoring for Baltika/Wyscout Excel imports.",
    path: "/baltika/models"
  },
  MACHETE: {
    name: "Machete Fantasy 2025/26",
    description: "Position-aware fantasy scoring for Machete/FotMob snapshots.",
    path: "/admin/models/machete"
  }
};

const formulaExamples: Record<ScoringModelSource, { primary: string; scoring: string; alternative: string; fields: string[] }> = {
  WYSCOUT: {
    primary: "1 + {Minutes factor} + 4*{Goals per match} + 3*{Assists per match} - {Yellow cards}",
    scoring: "{Matches played} + 4*{Goals} + 3*{Assists} + {Clean sheets} - {Yellow cards}",
    alternative: "3*{xG per 90} + 3*{xA per 90} + 0.4*{Key passes per 90} + 0.2*{Progressive passes per 90}",
    fields: ["{xG per 90}", "{xA per 90}", "{Key passes per 90}", "{Progressive passes per 90}", "{Round projected xG}"]
  },
  MACHETE: {
    primary: "1 + {Minutes factor} + 4*{Goals per match} + 3*{Assists per match} - {Yellow cards}",
    scoring: "{Matches played} + 4*{Goals} + 3*{Assists} + 0.2*{Shots on target} + 0.2*{Average rating}",
    alternative: "4*{Goals per match} + 2*{Assists per match} + 0.2*{Shots on target} + 0.1*{Key passes} + 0.2*{Average rating}",
    fields: ["{Goals}", "{Goals per match}", "{Assists}", "{Assists per match}", "{Shots on target}", "{Key passes}", "{Average rating}"]
  }
};

export async function saveModelSettings(formData: FormData) {
  "use server";

  await requireAdminUser();

  const source = String(formData.get("modelSource") ?? "WYSCOUT") === "MACHETE" ? "MACHETE" : "WYSCOUT";
  const config = sourceConfig[source];

  const formulas = Object.fromEntries(
    customFormulaFields.map((field) => [field.key, String(formData.get(field.key) ?? "").trim()])
  ) as Record<FormulaFieldKey, string>;
  const enabled = formData.get("customFormulaEnabled") === "on";

  const alternativeFormulas = Object.fromEntries(
    alternativeFormulaFields.map((field) => [field.key, String(formData.get(field.key) ?? "").trim()])
  ) as Record<AlternativeFieldKey, string>;
  const alternativeEnabled = formData.get("alternativeFormulaEnabled") === "on";

  const scoringFormulas = Object.fromEntries(
    scoringFormulaFields.map((field) => [field.key, String(formData.get(field.key) ?? "").trim()])
  ) as Record<ScoringFieldKey, string>;
  const scoringEnabled = formData.get("scoringFormulaEnabled") === "on";

  for (const field of customFormulaFields) {
    const validation = validateCustomFormula(formulas[field.key]);
    if (!validation.ok) {
      redirect(`${config.path}?error=${encodeURIComponent(`${field.position}: ${validation.message}`)}`);
    }
  }

  for (const field of alternativeFormulaFields) {
    const validation = validateCustomFormula(alternativeFormulas[field.key]);
    if (!validation.ok) {
      redirect(`${config.path}?error=${encodeURIComponent(`Alt ${field.position}: ${validation.message}`)}`);
    }
  }

  for (const field of scoringFormulaFields) {
    const validation = validateCustomFormula(scoringFormulas[field.key]);
    if (!validation.ok) {
      redirect(`${config.path}?error=${encodeURIComponent(`Scoring ${field.position}: ${validation.message}`)}`);
    }
  }

  const hasFormula = Object.values(formulas).some((formula) => formula.length > 0);
  const hasAlternativeFormula = Object.values(alternativeFormulas).some((formula) => formula.length > 0);
  const hasScoringFormula = Object.values(scoringFormulas).some((formula) => formula.length > 0);

  if (enabled && !hasFormula) {
    redirect(`${config.path}?error=${encodeURIComponent("Expected FP custom mode needs at least one formula.")}`);
  }

  if (alternativeEnabled && !hasAlternativeFormula) {
    redirect(`${config.path}?error=${encodeURIComponent("Alt FP needs at least one formula.")}`);
  }

  if (scoringEnabled && !hasScoringFormula) {
    redirect(`${config.path}?error=${encodeURIComponent("Actual FP needs at least one formula.")}`);
  }

  const model = await prisma.fantasyModel.findFirst({
    where: { modelSource: source, isDefault: true, isActive: true }
  });

  const data = {
    customFormula: null,
    customFormulaGk: formulas.customFormulaGk || null,
    customFormulaDef: formulas.customFormulaDef || null,
    customFormulaMid: formulas.customFormulaMid || null,
    customFormulaFwd: formulas.customFormulaFwd || null,
    customFormulaEnabled: enabled && hasFormula,
    scoringFormulaGk: scoringFormulas.scoringFormulaGk || null,
    scoringFormulaDef: scoringFormulas.scoringFormulaDef || null,
    scoringFormulaMid: scoringFormulas.scoringFormulaMid || null,
    scoringFormulaFwd: scoringFormulas.scoringFormulaFwd || null,
    scoringFormulaEnabled: scoringEnabled && hasScoringFormula,
    alternativeFormulaGk: alternativeFormulas.alternativeFormulaGk || null,
    alternativeFormulaDef: alternativeFormulas.alternativeFormulaDef || null,
    alternativeFormulaMid: alternativeFormulas.alternativeFormulaMid || null,
    alternativeFormulaFwd: alternativeFormulas.alternativeFormulaFwd || null,
    alternativeFormulaEnabled: alternativeEnabled && hasAlternativeFormula
  };

  if (model) {
    await prisma.fantasyModel.update({
      where: { id: model.id },
      data
    });
  } else {
    await prisma.fantasyModel.create({
      data: {
        modelSource: source,
        name: config.name,
        description: config.description,
        isDefault: true,
        isActive: true,
        ...data,
        rules: {
          create: seedRules
        }
      }
    });
  }

  await recalculateSnapshotsForSource(prisma, source);

  revalidatePath(config.path);
  revalidatePath(source === "MACHETE" ? "/machete/players" : "/baltika/players");
  revalidatePath(source === "MACHETE" ? "/machete/leagues" : "/baltika/leagues");
  redirect(`${config.path}?saved=1`);
}

export async function ModelSettingsPage({
  source,
  modeName,
  title,
  description,
  backHref,
  backLabel,
  searchParams
}: ModelSettingsPageProps) {
  await requireAdminUser();

  const [model, wyscoutModel] = await Promise.all([
    prisma.fantasyModel.findFirst({
      where: { modelSource: source, isDefault: true, isActive: true },
      include: {
        _count: {
          select: { rules: true }
        }
      }
    }),
    source === "MACHETE"
      ? prisma.fantasyModel.findFirst({
          where: { modelSource: "WYSCOUT", isDefault: true, isActive: true },
          include: {
            _count: {
              select: { rules: true }
            }
          }
        })
      : null
  ]);
  const displayModel = model ?? wyscoutModel;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href={backHref} className="text-sm font-semibold text-slate-600 hover:text-ink">
        {backLabel}
      </Link>
      <div className="mt-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{modeName}</p>
        <h1 className="mt-2 text-3xl font-bold text-ink">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{description}</p>
      </div>

      <section className="mt-6 rounded border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">{model?.name ?? sourceConfig[source].name}</h2>
            <p className="mt-1 text-sm text-slate-600">
              <I18nText
                en={<>These settings belong only to {modeName}. Baltika and Machete can use different primary and alternative formulas.</>}
                ru={<>Эти настройки относятся только к режиму {modeName}. Балтика и Machete могут использовать разные основные и альтернативные формулы.</>}
              />
              {!model && source === "MACHETE" && wyscoutModel ? " Machete is currently inheriting the Baltika formulas until you save its own settings." : ""}
            </p>
          </div>
          <span className="rounded bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600">
            {displayModel?._count.rules ?? seedRules.length} <I18nText en="rules" ru="правил" />
          </span>
        </div>

        {searchParams?.error ? (
          <div className="mt-5 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {searchParams.error}
          </div>
        ) : null}

        {searchParams?.saved ? (
          <div className="mt-5 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <I18nText en="Saved. Expected FP, Actual FP and Alt FP were recalculated for existing player snapshots." ru="Сохранено. Expected FP, Actual FP и Alt FP пересчитаны для уже загруженных игроков." />
          </div>
        ) : null}

        <form action={saveModelSettings} className="mt-6 space-y-4">
          <input type="hidden" name="modelSource" value={source} />

          <ScoreMap source={source} displayModel={displayModel} />

          <div className="rounded border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-ink"><I18nText en="Current Expected FP calculation" ru="Текущий расчет Expected FP" /></p>
              <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                <FormulaModeLabel model={displayModel} />
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {displayModel?.customFormulaEnabled && hasAnyCustomFormula(displayModel)
                ? customFormulaFields.map((entry) => {
                    const formula = customFormulaForPosition(displayModel, entry.key);

                    return (
                      <FormulaPreview key={entry.position} position={entry.position}>
                        {formula || <I18nText en="Default predicted round rules for this position" ru="Встроенные правила прогноза тура для этой позиции" />}
                      </FormulaPreview>
                    );
                  })
                : defaultFormulaByPosition.map((entry) => (
                    <FormulaPreview key={entry.position} position={entry.position}>
                      {entry.formula}
                    </FormulaPreview>
                  ))}
            </div>

            <p className="mt-3 text-xs text-slate-500">
              <I18nText
                en="This is the formula behind the green Expected FP column. If custom formulas are off, Expected FP uses the built-in predicted-round scoring."
                ru="Это формула зеленой колонки Expected FP. Если свои формулы выключены, Expected FP считается по встроенным правилам прогноза тура."
              />
            </p>
          </div>

          <div className="rounded border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink"><I18nText en="Edit Expected FP formulas" ru="Редактировать формулы Expected FP" /></p>
                <p className="mt-1 text-xs text-slate-600">
                  <I18nText en="These formulas replace the green Expected FP column for the positions you fill in." ru="Эти формулы заменяют зеленую колонку Expected FP для заполненных позиций." />
                </p>
              </div>
              <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-emerald-700"><I18nText en="Primary score" ru="Основные очки" /></span>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {customFormulaFields.map((field) => (
                <FormulaTextarea key={field.key} field={field} defaultValue={editableExpectedFormula(displayModel, field.key)} />
              ))}
            </div>
            <label className="mt-3 flex items-center gap-3 text-sm font-medium text-ink">
              <input
                type="checkbox"
                name="customFormulaEnabled"
                defaultChecked={Boolean(displayModel?.customFormulaEnabled)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <I18nText en="Use primary custom formulas" ru="Использовать свои основные формулы" />
            </label>
          </div>

          <div className="rounded border border-sky-200 bg-sky-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">
                  <I18nText en="Current Actual FP formulas" ru="Текущие формулы Реальные FP" />
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  <I18nText
                    en="Edit the formulas already used by the blue Actual FP column."
                    ru="Редактируйте формулы, которые уже используются в синей колонке Реальные FP."
                  />
                </p>
              </div>
              <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-sky-700">
                <I18nText en="Actual scoring" ru="Фактические очки" />
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {scoringFormulaFields.map((field) => (
                <FormulaTextarea
                  key={field.key}
                  field={field}
                  defaultValue={editableScoringFormula(displayModel, field.key)}
                  accent="sky"
                  rows={4}
                />
              ))}
            </div>
            <label className="mt-3 flex items-center gap-3 text-sm font-medium text-ink">
              <input
                type="checkbox"
                name="scoringFormulaEnabled"
                defaultChecked={Boolean(displayModel?.scoringFormulaEnabled)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <I18nText en="Use custom Actual FP formulas" ru="Использовать свои формулы Реальные FP" />
            </label>
          </div>

          <div className="rounded border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink"><I18nText en="Edit Alt FP formulas" ru="Редактировать формулы Alt FP" /></p>
                <p className="mt-1 text-xs text-slate-600">
                  <I18nText en="These formulas fill the amber Alt FP column. They do not change Expected FP." ru="Эти формулы заполняют желтую колонку Alt FP и не меняют Expected FP." />
                </p>
              </div>
              <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-amber-700"><I18nText en="Comparison score" ru="Очки для сравнения" /></span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {alternativeFormulaFields.map((field) => (
                <FormulaTextarea
                  key={field.key}
                  field={field}
                  defaultValue={customFormulaForPosition(displayModel, field.key)}
                  accent="amber"
                  rows={4}
                />
              ))}
            </div>
            <label className="mt-3 flex items-center gap-3 text-sm font-medium text-ink">
              <input
                type="checkbox"
                name="alternativeFormulaEnabled"
                defaultChecked={Boolean(displayModel?.alternativeFormulaEnabled)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <I18nText en="Calculate Alt FP" ru="Считать Alt FP" />
            </label>
          </div>

          <FormulaHelp source={source} />

          <button type="submit" className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            <I18nText en="Save and recalculate scores" ru="Сохранить и пересчитать очки" />
          </button>
        </form>
      </section>

      <FieldGuideSections />
    </main>
  );
}

function ScoreMap({
  source,
  displayModel
}: {
  source: ScoringModelSource;
  displayModel:
    | {
        customFormulaEnabled?: boolean | null;
        customFormula?: string | null;
        customFormulaGk?: string | null;
        customFormulaDef?: string | null;
        customFormulaMid?: string | null;
        customFormulaFwd?: string | null;
        alternativeFormulaEnabled?: boolean | null;
        alternativeFormulaGk?: string | null;
        alternativeFormulaDef?: string | null;
        alternativeFormulaMid?: string | null;
        alternativeFormulaFwd?: string | null;
        scoringFormulaEnabled?: boolean | null;
        scoringFormulaGk?: string | null;
        scoringFormulaDef?: string | null;
        scoringFormulaMid?: string | null;
        scoringFormulaFwd?: string | null;
      }
    | null
    | undefined;
}) {
  const altEnabled = Boolean(displayModel?.alternativeFormulaEnabled && hasAnyAlternativeFormula(displayModel));

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
      <div className="rounded border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-semibold uppercase text-emerald-700"><I18nText en="Green table column" ru="Зеленая колонка таблицы" /></p>
        <h3 className="mt-1 text-base font-semibold text-ink">Expected FP</h3>
        <p className="mt-2 text-sm text-slate-700">
          <I18nText
            en="Main predicted score. It uses either the built-in predicted-round rules or your primary formulas."
            ru="Основные прогнозные очки. Используют встроенные правила прогноза тура или ваши основные формулы."
          />
        </p>
        <p className="mt-3 text-xs font-semibold text-emerald-700"><FormulaModeLabel model={displayModel} /></p>
      </div>
      <div className="rounded border border-sky-200 bg-sky-50 p-4">
        <p className="text-xs font-semibold uppercase text-sky-700"><I18nText en="Blue table column" ru="Синяя колонка таблицы" /></p>
        <h3 className="mt-1 text-base font-semibold text-ink">Actual FP</h3>
        <p className="mt-2 text-sm text-slate-700">
          <I18nText
            en="Actual aggregate score from loaded totals. This is separate from prediction."
            ru="Фактические суммарные очки по загруженным итогам. Это отдельно от прогноза."
          />
        </p>
        <p className="mt-3 text-xs font-semibold text-sky-700"><ScoringFormulaModeLabel model={displayModel} /></p>
      </div>
      <div className="rounded border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-semibold uppercase text-amber-700"><I18nText en="Amber table column" ru="Желтая колонка таблицы" /></p>
        <h3 className="mt-1 text-base font-semibold text-ink">Alt FP</h3>
        <p className="mt-2 text-sm text-slate-700">
          <I18nText
            en="Optional second score for comparison. It appears only when Alt FP is enabled and has a formula."
            ru="Дополнительные очки для сравнения. Появляются, когда Alt FP включен и есть формула."
          />
        </p>
        <p className="mt-3 text-xs font-semibold text-amber-700"><AltStatusLabel enabled={altEnabled} /></p>
      </div>
      <div className="rounded border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase text-slate-500"><I18nText en="Save behavior" ru="После сохранения" /></p>
        <h3 className="mt-1 text-base font-semibold text-ink"><I18nText en="Recalculate now" ru="Пересчет сразу" /></h3>
        <p className="mt-2 text-sm text-slate-700">
          <I18nText
            en={<>Saving updates existing {source === "MACHETE" ? "Machete/FotMob" : "Baltika/Wyscout"} snapshots immediately. Future syncs and imports use the same formulas.</>}
            ru={<>Сохранение сразу обновляет существующие снимки {source === "MACHETE" ? "Machete/FotMob" : "Baltika/Wyscout"}. Будущие синхронизации и импорты используют те же формулы.</>}
          />
        </p>
      </div>
    </div>
  );
}

function FormulaModeLabel({ model }: { model?: Parameters<typeof hasAnyCustomFormula>[0] }) {
  return model?.customFormulaEnabled && hasAnyCustomFormula(model) ? (
    <I18nText en="Custom formulas by position" ru="Свои формулы по позициям" />
  ) : (
    <I18nText en="Default predicted round rules" ru="Встроенные правила прогноза тура" />
  );
}

function ScoringFormulaModeLabel({ model }: { model?: Parameters<typeof hasAnyScoringFormula>[0] }) {
  return model?.scoringFormulaEnabled && hasAnyScoringFormula(model) ? (
    <I18nText en="Custom scoring formulas by position" ru="Свои формулы фактических очков по позициям" />
  ) : (
    <I18nText en="Default aggregate scoring rules" ru="Встроенные правила фактических очков" />
  );
}

function AltStatusLabel({ enabled }: { enabled: boolean }) {
  return enabled ? <I18nText en="Alt FP enabled" ru="Alt FP включен" /> : <I18nText en="Alt FP disabled" ru="Alt FP выключен" />;
}

function FormulaPreview({ position, children }: { position: string; children: ReactNode }) {
  return (
    <div className="rounded bg-white p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{position}</p>
      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-700">{children}</pre>
    </div>
  );
}

function editableExpectedFormula(model: Parameters<typeof customFormulaForPosition>[0], key: string) {
  return customFormulaForPosition(model, key).trim() || defaultFormulaByPosition.find((entry) => entry.key === key)?.formula || "";
}

function editableScoringFormula(model: Parameters<typeof customFormulaForPosition>[0], key: string) {
  return customFormulaForPosition(model, key).trim() || defaultScoringFormulaByPosition.find((entry) => entry.key === key)?.formula || "";
}

function FormulaTextarea({
  field,
  defaultValue,
  accent = "slate",
  rows = 5
}: {
  field: (typeof customFormulaFields)[number] | (typeof alternativeFormulaFields)[number] | (typeof scoringFormulaFields)[number];
  defaultValue: string;
  accent?: "slate" | "amber" | "sky";
  rows?: number;
}) {
  const focusClass =
    accent === "amber" ? "focus:border-amber-400" : accent === "sky" ? "focus:border-sky-400" : "focus:border-slate-400";

  return (
    <label className="block rounded bg-white p-3">
      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">{field.position}</span>
      <textarea
        name={field.key}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={field.placeholder}
        className={`w-full rounded border border-slate-200 px-3 py-2 font-mono text-sm text-ink outline-none transition ${focusClass}`}
      />
    </label>
  );
}

function FormulaHelp({ source }: { source: ScoringModelSource }) {
  const examples = formulaExamples[source];

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <p className="font-semibold text-ink"><I18nText en="Formula syntax and examples" ru="Синтаксис формул и примеры" /></p>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded bg-white p-3">
          <p className="text-xs font-semibold uppercase text-slate-500"><I18nText en="Expected FP example" ru="Пример Expected FP" /></p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-700">{examples.primary}</pre>
        </div>
        <div className="rounded bg-white p-3">
          <p className="text-xs font-semibold uppercase text-slate-500"><I18nText en="Actual FP example" ru="Пример Actual FP" /></p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-700">{examples.scoring}</pre>
        </div>
        <div className="rounded bg-white p-3">
          <p className="text-xs font-semibold uppercase text-slate-500"><I18nText en="Alt FP example" ru="Пример Alt FP" /></p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-700">{examples.alternative}</pre>
        </div>
      </div>
      <p className="mt-3">
        <I18nText
          en={<>Use numbers, <span className="font-mono">+ - * / ( )</span>, and fields in braces. Missing fields count as 0. Empty Expected FP and Actual FP formulas fall back to built-in rules; empty Alt FP formulas show no Alt FP for that position.</>}
          ru={<>Используйте числа, <span className="font-mono">+ - * / ( )</span> и поля в фигурных скобках. Отсутствующие поля считаются как 0. Пустые формулы Expected FP и Actual FP возвращаются к встроенным правилам; пустые формулы Alt FP не показывают Alt FP для позиции.</>}
        />
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {examples.fields.map((field) => (
          <span key={field} className="rounded bg-white px-2 py-1 font-mono text-xs text-slate-700">
            {field}
          </span>
        ))}
      </div>
    </div>
  );
}

function FieldGuideSections() {
  return (
    <>
      <section className="mt-6 rounded border border-slate-200 bg-white p-6 shadow-soft">
        <div>
          <h2 className="text-lg font-semibold text-ink"><I18nText en="Scoring fields and aliases" ru="Поля очков и псевдонимы" /></h2>
          <p className="mt-1 text-sm text-slate-600">
            <I18nText
              en="You can write readable field names in braces. They are normalized into metric keys automatically."
              ru="В формулах можно писать понятные названия полей в фигурных скобках. Они автоматически приводятся к ключам метрик."
            />
          </p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <SortableTable className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3"><I18nText en="Action" ru="Действие" /></th>
                <th className="px-3 py-3"><I18nText en="Formula aliases" ru="Алиасы формулы" /></th>
                <th className="px-3 py-3"><I18nText en="Normalized keys" ru="Нормализованные ключи" /></th>
                <th className="px-3 py-3 text-right">GK</th>
                <th className="px-3 py-3 text-right">DEF</th>
                <th className="px-3 py-3 text-right">MID</th>
                <th className="px-3 py-3 text-right">FWD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scoringFieldGuide.map((field) => (
                <tr key={field.action} className="align-top">
                  <td className="max-w-[260px] px-3 py-3">
                    <p className="font-medium text-ink">{field.action}</p>
                    <p className="mt-1 text-xs text-slate-500">{field.meaning}</p>
                    {field.note ? <p className="mt-1 text-xs text-slate-500">{field.note}</p> : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[280px] flex-wrap gap-1.5">
                      {field.formulaAliases.map((alias) => (
                        <span key={alias} className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                          {alias}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[260px] flex-wrap gap-1.5">
                      {field.normalizedKeys.map((key) => (
                        <span key={key} className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                          {key}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-ink">{formatPositionPoints(field.points, "GK")}</td>
                  <td className="px-3 py-3 text-right font-semibold text-ink">{formatPositionPoints(field.points, "DEF")}</td>
                  <td className="px-3 py-3 text-right font-semibold text-ink">{formatPositionPoints(field.points, "MID")}</td>
                  <td className="px-3 py-3 text-right font-semibold text-ink">{formatPositionPoints(field.points, "FWD")}</td>
                </tr>
              ))}
            </tbody>
          </SortableTable>
        </div>
      </section>

      <section className="mt-6 rounded border border-slate-200 bg-white p-6 shadow-soft">
        <div>
          <h2 className="text-lg font-semibold text-ink"><I18nText en="All numeric source fields" ru="Все числовые поля источника" /></h2>
          <p className="mt-1 text-sm text-slate-600">
            <I18nText
              en="Numeric fields can be used in formulas. Text, date, and boolean fields are stored as metadata and evaluate to 0."
              ru="Числовые поля можно использовать в формулах. Текст, даты и boolean хранятся как метаданные и в формулах считаются как 0."
            />
          </p>
        </div>

        <div className="mt-5 max-h-[560px] overflow-auto rounded border border-slate-200">
          <SortableTable className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3"><I18nText en="Group" ru="Группа" /></th>
                <th className="px-3 py-3"><I18nText en="Alias" ru="Алиас" /></th>
                <th className="px-3 py-3"><I18nText en="Normalized key" ru="Нормализованный ключ" /></th>
                <th className="px-3 py-3"><I18nText en="Type" ru="Тип" /></th>
                <th className="px-3 py-3"><I18nText en="Meaning" ru="Смысл" /></th>
                <th className="px-3 py-3"><I18nText en="Default FP" ru="FP по умолчанию" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sourceFormulaFields.map((field) => (
                <tr key={`${field.category}:${field.key}`} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500"><SourceCategoryLabel category={field.category} /></td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                      {formulaAlias(field.label)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{field.key}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600"><SourceTypeLabel type={field.type} /></td>
                  <td className="max-w-[360px] px-3 py-3 text-slate-600">
                    <I18nText en={field.meaning} ru={sourceFieldMeaningRu(field)} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                    {field.type === "number" || field.type === "money" ? (
                      <I18nText en="0, set by formula" ru="0, задается формулой" />
                    ) : (
                      <I18nText en="non-numeric" ru="не число" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </SortableTable>
        </div>
      </section>
    </>
  );
}

function SourceCategoryLabel({ category }: { category: string }) {
  const ru: Record<string, string> = {
    Core: "Основное",
    Defending: "Оборона",
    Discipline: "Дисциплина",
    Attacking: "Атака",
    Shooting: "Удары",
    Creation: "Создание моментов",
    Crossing: "Навесы",
    Passing: "Пасы",
    Progression: "Продвижение мяча",
    Goalkeeper: "Вратарь",
    "Set pieces": "Стандарты",
    "Team form": "Форма команды",
    Schedule: "Календарь"
  };

  return <I18nText en={category} ru={ru[category] ?? category} />;
}

function SourceTypeLabel({ type }: { type: SourceFormulaField["type"] }) {
  const ru: Record<SourceFormulaField["type"], string> = {
    number: "число",
    money: "деньги",
    date: "дата",
    text: "текст",
    boolean: "да/нет"
  };

  return <I18nText en={type} ru={ru[type]} />;
}

function sourceFieldMeaningRu(field: SourceFormulaField) {
  const special: Record<string, string> = {
    Player: "Имя игрока. Это метаданные: текстовые поля в формулах считаются как 0.",
    Team: "Название команды. Это метаданные: текстовые поля в формулах считаются как 0.",
    Position: "Исходная позиция игрока. Приложение также нормализует ее в GK/DEF/MID/FWD.",
    Age: "Возраст игрока.",
    "Market value": "Рыночная стоимость игрока в евро после парсинга.",
    "Contract expires": "Дата окончания контракта. Это метаданные: даты в формулах считаются как 0.",
    "Birth country": "Страна рождения. Это метаданные: текстовые поля в формулах считаются как 0.",
    "Passport country": "Страна паспорта. Это метаданные: текстовые поля в формулах считаются как 0.",
    Foot: "Рабочая нога. Это метаданные: текстовые поля в формулах считаются как 0.",
    "On loan": "Статус аренды. Это метаданные: boolean-поля в формулах считаются как 0.",
    "Save rate, %": "Процент отраженных ударов.",
    "Goal conversion, %": "Процент реализации ударов в голы.",
    "Penalty conversion, %": "Процент реализации пенальти.",
    "Team home matches": "Количество загруженных домашних матчей Team Stats для этой команды.",
    "Team home xG": "Суммарный xG команды в загруженных домашних матчах.",
    "Team home xGA": "Суммарный xGA команды в загруженных домашних матчах.",
    "Team home xG per match": "Средний xG команды в загруженных домашних матчах.",
    "Team home xGA per match": "Средний xGA команды в загруженных домашних матчах.",
    "Team away matches": "Количество гостевых строк Team Stats, полученных из домашних загрузок соперников.",
    "Team away xG": "Суммарный xG команды в загруженных гостевых матчах.",
    "Team away xGA": "Суммарный xGA команды в загруженных гостевых матчах.",
    "Team away xG per match": "Средний xG команды в загруженных гостевых матчах.",
    "Team away xGA per match": "Средний xGA команды в загруженных гостевых матчах.",
    "Team overall xG per match": "Средний xG команды по всем загруженным матчам Team Stats.",
    "Team overall xGA per match": "Средний xGA команды по всем загруженным матчам Team Stats.",
    "Next fixture count": "1, если у команды есть следующий матч; иначе 0.",
    "Round fixture count": "Количество матчей команды в ближайшем запланированном туре.",
    "Next round": "Номер следующего тура из источника календаря.",
    "Next is home": "1, если первый следующий матч домашний; иначе 0.",
    "Next is away": "1, если первый следующий матч гостевой; иначе 0.",
    "Next team xG per match": "Атакующая форма команды для стороны первого следующего матча.",
    "Next team xGA per match": "Оборонительная форма команды для стороны первого следующего матча.",
    "Next opponent xG per match": "Атакующая форма соперника для стороны первого следующего матча.",
    "Next opponent xGA per match": "Оборонительная форма соперника для стороны первого следующего матча.",
    "Next projected xG": "Прогнозный xG команды для первого следующего матча.",
    "Next projected xGA": "Прогнозный xGA команды для первого следующего матча.",
    "Round projected xG": "Суммарный прогнозный xG команды по всем матчам ближайшего тура.",
    "Round projected xGA": "Суммарный прогнозный xGA команды по всем матчам ближайшего тура.",
    "Round projected xG avg": "Средний прогнозный xG команды по матчам ближайшего тура.",
    "Round projected xGA avg": "Средний прогнозный xGA команды по матчам ближайшего тура."
  };
  if (special[field.label]) return special[field.label];

  if (field.label.endsWith(" per 90")) {
    return `${metricNameRu(field.label.replace(/ per 90$/, ""))} за 90 минут.`;
  }
  if (field.label.endsWith(" per match")) {
    return `${metricNameRu(field.label.replace(/ per match$/, ""))} в среднем за матч.`;
  }
  if (field.label.startsWith("Accurate ")) {
    return `Точность: ${metricNameRu(field.label.replace(/^Accurate /, "").replace(/, %$/, ""))}.`;
  }
  if (field.label.endsWith(", %")) {
    return `Доля или процент: ${metricNameRu(field.label.replace(/, %$/, ""))}.`;
  }
  if (field.label.startsWith("PAdj ")) {
    return `${metricNameRu(field.label.replace(/^PAdj /, ""))} с поправкой на владение.`;
  }
  if (field.label.startsWith("Average ")) {
    return `Среднее значение: ${metricNameRu(field.label.replace(/^Average /, ""))}.`;
  }
  if (field.type === "text" || field.type === "date" || field.type === "boolean") {
    return `${metricNameRu(field.label)}. Это метаданные: в формулах считается как 0.`;
  }

  return `${metricNameRu(field.label)} за загруженный период.`;
}

function metricNameRu(label: string) {
  const dictionary: Record<string, string> = {
    "Matches played": "матчи",
    "Minutes played": "минуты",
    Goals: "голы",
    xG: "xG",
    Assists: "ассисты",
    xA: "xA",
    Height: "рост",
    Weight: "вес",
    Duels: "единоборства",
    "Duels won": "выигранные единоборства",
    "Successful defensive actions": "успешные оборонительные действия",
    "Defensive duels": "оборонительные единоборства",
    "Defensive duels won": "выигранные оборонительные единоборства",
    "Aerial duels": "верховые единоборства",
    "Aerial duels won": "выигранные верховые единоборства",
    "Sliding tackles": "подкаты",
    "Shots blocked": "заблокированные удары",
    Interceptions: "перехваты",
    Fouls: "фолы",
    "Yellow cards": "желтые карточки",
    "Red cards": "красные карточки",
    "Successful attacking actions": "успешные атакующие действия",
    "Non-penalty goals": "голы без пенальти",
    "Head goals": "голы головой",
    Shots: "удары",
    "Shots on target": "удары в створ",
    "Assists per 90": "ассисты за 90 минут",
    Crosses: "навесы",
    "Crosses from left flank": "навесы с левого фланга",
    "Crosses from right flank": "навесы с правого фланга",
    "Crosses to goalie box": "навесы во вратарскую",
    Dribbles: "дриблинг",
    "Successful dribbles": "успешный дриблинг",
    "Offensive duels": "атакующие единоборства",
    "Offensive duels won": "выигранные атакующие единоборства",
    "Touches in box": "касания в штрафной",
    "Progressive runs": "прогрессивные рывки",
    "Received passes": "полученные передачи",
    "Received long passes": "полученные длинные передачи",
    "Fouls suffered": "заработанные фолы",
    Passes: "пасы",
    "Forward passes": "пасы вперед",
    "Back passes": "пасы назад",
    "Lateral passes": "поперечные пасы",
    "Short / medium passes": "короткие и средние пасы",
    "Long passes": "длинные пасы",
    "pass length, m": "длина паса, м",
    "long pass length, m": "длина длинного паса, м",
    "Shot assists": "пасы под удар",
    "Second assists": "вторые ассисты",
    "Third assists": "третьи ассисты",
    "Smart passes": "умные пасы",
    "Key passes": "ключевые пасы",
    "Passes to final third": "пасы в финальную треть",
    "Passes to penalty area": "пасы в штрафную",
    "Through passes": "разрезающие пасы",
    "Deep completions": "глубокие завершенные передачи",
    "Deep completed crosses": "глубокие завершенные навесы",
    "Progressive passes": "прогрессивные пасы",
    "Conceded goals": "пропущенные голы",
    "Shots against": "удары по воротам",
    "Clean sheets": "сухие матчи",
    "xG against": "xGA",
    "Prevented goals": "предотвращенные голы",
    "Back passes received as GK": "пасы назад, полученные вратарем",
    Exits: "выходы вратаря",
    "Free kicks": "штрафные",
    "Direct free kicks": "прямые штрафные",
    "Direct free kicks on target": "прямые штрафные в створ",
    Corners: "угловые",
    "Penalties taken": "исполненные пенальти"
  };

  return dictionary[label] ?? label;
}
