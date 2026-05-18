import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { formatPositionPoints, scoringFieldGuide } from "@/lib/scoring/field-guide";
import {
  alternativeFormulaFields,
  customFormulaFields,
  customFormulaForPosition,
  defaultFormulaByPosition,
  formulaModeLabel,
  hasAnyAlternativeFormula,
  hasAnyCustomFormula
} from "@/lib/scoring/formula-display";
import { validateCustomFormula } from "@/lib/scoring/formula";
import type { ScoringModelSource } from "@/lib/scoring";
import { seedRules } from "@/lib/scoring/rules";
import { formulaAlias, sourceFormulaFields } from "@/lib/scoring/source-field-guide";

type ModelSettingsPageProps = {
  source: ScoringModelSource;
  modeName: string;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  searchParams?: {
    error?: string;
    saved?: string;
  };
};

type FormulaFieldKey = (typeof customFormulaFields)[number]["key"];
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
    path: "/machete/models"
  }
};

export async function saveModelSettings(formData: FormData) {
  "use server";

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

  const hasFormula = Object.values(formulas).some((formula) => formula.length > 0);
  const hasAlternativeFormula = Object.values(alternativeFormulas).some((formula) => formula.length > 0);

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

  revalidatePath(config.path);
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
              These settings belong only to {modeName}. Baltika and Machete can now use different primary and alternative
              formulas.
              {!model && source === "MACHETE" && wyscoutModel ? " Machete is currently inheriting the Baltika formulas until you save its own settings." : ""}
            </p>
          </div>
          <span className="rounded bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600">
            {displayModel?._count.rules ?? seedRules.length} rules
          </span>
        </div>

        {searchParams?.error ? (
          <div className="mt-5 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {searchParams.error}
          </div>
        ) : null}

        {searchParams?.saved ? (
          <div className="mt-5 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Formula settings saved.
          </div>
        ) : null}

        <form action={saveModelSettings} className="mt-6 space-y-4">
          <input type="hidden" name="modelSource" value={source} />

          <div className="rounded border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-ink">Current primary formula</p>
              <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                {formulaModeLabel(displayModel)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {displayModel?.customFormulaEnabled && hasAnyCustomFormula(displayModel)
                ? customFormulaFields.map((entry) => {
                    const formula = customFormulaForPosition(displayModel, entry.key);

                    return (
                      <FormulaPreview key={entry.position} position={entry.position}>
                        {formula || "Default predicted round rules for this position"}
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
              Default FP predicts one round: minutes are averaged, per-90 metrics are scaled by expected minutes, and totals
              are converted to per-match values.
            </p>
          </div>

          <div>
            <span className="text-sm font-semibold text-ink">Primary fantasy score formulas by position</span>
            <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {customFormulaFields.map((field) => (
                <FormulaTextarea key={field.key} field={field} defaultValue={customFormulaForPosition(displayModel, field.key)} />
              ))}
            </div>
            <label className="mt-3 flex items-center gap-3 text-sm font-medium text-ink">
              <input
                type="checkbox"
                name="customFormulaEnabled"
                defaultChecked={Boolean(displayModel?.customFormulaEnabled)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Use primary custom formulas for new calculations
            </label>
          </div>

          <div className="rounded border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-ink">Alternative score column</p>
              <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-amber-700">
                {displayModel?.alternativeFormulaEnabled && hasAnyAlternativeFormula(displayModel) ? "Alt FP enabled" : "Alt FP disabled"}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Alt FP is an independent second score. It does not replace the primary score.
            </p>
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
              Calculate Alt FP for new calculations
            </label>
          </div>

          <FormulaHelp />

          <button type="submit" className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Save formulas
          </button>
        </form>
      </section>

      <FieldGuideSections />
    </main>
  );
}

function FormulaPreview({ position, children }: { position: string; children: string }) {
  return (
    <div className="rounded bg-white p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{position}</p>
      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-700">{children}</pre>
    </div>
  );
}

function FormulaTextarea({
  field,
  defaultValue,
  accent = "slate",
  rows = 5
}: {
  field: (typeof customFormulaFields)[number] | (typeof alternativeFormulaFields)[number];
  defaultValue: string;
  accent?: "slate" | "amber";
  rows?: number;
}) {
  return (
    <label className="block rounded bg-white p-3">
      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">{field.position}</span>
      <textarea
        name={field.key}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={field.placeholder}
        className={`w-full rounded border border-slate-200 px-3 py-2 font-mono text-sm text-ink outline-none transition ${
          accent === "amber" ? "focus:border-amber-400" : "focus:border-slate-400"
        }`}
      />
    </label>
  );
}

function FormulaHelp() {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <p className="font-semibold text-ink">How to write it</p>
      <p className="mt-2">
        Use numbers and operators <span className="font-mono">+ - * / ( )</span>. Put source fields in braces:
        <span className="font-mono"> {"{Goals}"}</span>, <span className="font-mono">{"{xG/per90}"}</span>,
        <span className="font-mono"> {"{Assists}"}</span>. Field names are normalized automatically.
      </p>
      <p className="mt-2">
        Missing fields count as 0. Example:
        <span className="font-mono"> 4*{"{Goals}"} + 2*{"{xG/per90}"} + 3*{"{Assists}"} - {"{Yellow cards}"}</span>.
        Leave a position empty to use the default rules for that position.
      </p>
      <p className="mt-2">
        Derived aliases are also available:
        <span className="font-mono"> {"{Expected minutes}"}</span>, <span className="font-mono">{"{Minutes factor}"}</span>,
        <span className="font-mono"> {"{Goals per match}"}</span>, <span className="font-mono">{"{Assists per 90}"}</span>.
      </p>
      <p className="mt-2">
        Baltika Team Stats variables are available after schedule/team-stat sync:
        <span className="font-mono"> {"{Team home xG per match}"}</span>,
        <span className="font-mono"> {"{Team away xGA per match}"}</span>,
        <span className="font-mono"> {"{Round projected xG}"}</span>.
      </p>
    </div>
  );
}

function FieldGuideSections() {
  return (
    <>
      <section className="mt-6 rounded border border-slate-200 bg-white p-6 shadow-soft">
        <div>
          <h2 className="text-lg font-semibold text-ink">Scoring fields and aliases</h2>
          <p className="mt-1 text-sm text-slate-600">
            You can write readable field names in braces. They are normalized into metric keys automatically.
          </p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Formula aliases</th>
                <th className="px-3 py-3">Normalized keys</th>
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
          </table>
        </div>
      </section>

      <section className="mt-6 rounded border border-slate-200 bg-white p-6 shadow-soft">
        <div>
          <h2 className="text-lg font-semibold text-ink">All numeric source fields</h2>
          <p className="mt-1 text-sm text-slate-600">
            Numeric fields can be used in formulas. Text, date, and boolean fields are stored as metadata and evaluate to 0.
          </p>
        </div>

        <div className="mt-5 max-h-[560px] overflow-auto rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Group</th>
                <th className="px-3 py-3">Alias</th>
                <th className="px-3 py-3">Normalized key</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Meaning</th>
                <th className="px-3 py-3">Default FP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sourceFormulaFields.map((field) => (
                <tr key={`${field.category}:${field.key}`} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">{field.category}</td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                      {formulaAlias(field.label)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{field.key}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{field.type}</td>
                  <td className="max-w-[360px] px-3 py-3 text-slate-600">{field.meaning}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                    {field.type === "number" || field.type === "money" ? "0, set by formula" : "non-numeric"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
