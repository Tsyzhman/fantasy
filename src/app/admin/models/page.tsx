import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { formatPositionPoints, scoringFieldGuide } from "@/lib/scoring/field-guide";
import {
  customFormulaFields,
  customFormulaForPosition,
  defaultFormulaByPosition,
  formulaModeLabel,
  hasAnyCustomFormula
} from "@/lib/scoring/formula-display";
import { validateCustomFormula } from "@/lib/scoring/formula";
import { seedRules } from "@/lib/scoring/rules";
import { formulaAlias, sourceFormulaFields } from "@/lib/scoring/source-field-guide";

type PageProps = {
  searchParams?: {
    error?: string;
    saved?: string;
  };
};

export const dynamic = "force-dynamic";

async function saveCustomFormula(formData: FormData) {
  "use server";

  const formulas = Object.fromEntries(
    customFormulaFields.map((field) => [field.key, String(formData.get(field.key) ?? "").trim()])
  ) as Record<(typeof customFormulaFields)[number]["key"], string>;
  const enabled = formData.get("customFormulaEnabled") === "on";

  for (const field of customFormulaFields) {
    const validation = validateCustomFormula(formulas[field.key]);
    if (!validation.ok) {
      redirect(`/admin/models?error=${encodeURIComponent(`${field.position}: ${validation.message}`)}`);
    }
  }

  const hasFormula = Object.values(formulas).some((formula) => formula.length > 0);

  const model = await prisma.fantasyModel.findFirst({
    where: { isDefault: true, isActive: true }
  });

  if (model) {
    await prisma.fantasyModel.update({
      where: { id: model.id },
      data: {
        customFormula: null,
        customFormulaGk: formulas.customFormulaGk || null,
        customFormulaDef: formulas.customFormulaDef || null,
        customFormulaMid: formulas.customFormulaMid || null,
        customFormulaFwd: formulas.customFormulaFwd || null,
        customFormulaEnabled: enabled && hasFormula
      }
    });
  } else {
    await prisma.fantasyModel.create({
      data: {
        name: "Fantasy 2025/26",
        description: "Position-aware fantasy scoring based on the 2025/26 rules table.",
        isDefault: true,
        isActive: true,
        customFormula: null,
        customFormulaGk: formulas.customFormulaGk || null,
        customFormulaDef: formulas.customFormulaDef || null,
        customFormulaMid: formulas.customFormulaMid || null,
        customFormulaFwd: formulas.customFormulaFwd || null,
        customFormulaEnabled: enabled && hasFormula,
        rules: {
          create: seedRules
        }
      }
    });
  }

  revalidatePath("/admin/models");
  redirect("/admin/models?saved=1");
}

export default async function AdminModelsPage({ searchParams }: PageProps) {
  const model = await prisma.fantasyModel.findFirst({
    where: { isDefault: true, isActive: true },
    include: {
      _count: {
        select: { rules: true }
      }
    }
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admin</p>
      <h1 className="mt-2 text-3xl font-bold text-ink">Fantasy model</h1>

      <section className="mt-6 rounded border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">{model?.name ?? "Fantasy 2025/26"}</h2>
            <p className="mt-1 text-sm text-slate-600">
              This is one platform-wide fantasy model shared by every league. Default rules predict points for one upcoming
              round from imported averages; enabled custom formulas override them by position.
            </p>
          </div>
          <span className="rounded bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600">
            {model?._count.rules ?? seedRules.length} rules
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

        <form action={saveCustomFormula} className="mt-6 space-y-4">
          <div className="rounded border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-ink">Текущая формула</p>
              <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                {formulaModeLabel(model)}
              </span>
            </div>

            {model?.customFormulaEnabled && hasAnyCustomFormula(model) ? (
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {customFormulaFields.map((entry) => {
                  const formula = customFormulaForPosition(model, entry.key);

                  return (
                    <div key={entry.position} className="rounded bg-white p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">{entry.position}</p>
                      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-700">
                        {formula || "Default predicted round rules for this position"}
                      </pre>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {defaultFormulaByPosition.map((entry) => (
                  <div key={entry.position} className="rounded bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">{entry.position}</p>
                    <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-700">
                      {entry.formula}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-3 text-xs text-slate-500">
              Default FP is predicted for one round: minutes are averaged as minutes_played / matches_played, per-90 metrics
              are scaled by expected minutes, and totals are converted to per-match values.
            </p>
          </div>

          <div>
            <span className="text-sm font-semibold text-ink">Custom fantasy score formulas by position</span>
            <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {customFormulaFields.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">{field.position}</span>
                  <textarea
                    name={field.key}
                    defaultValue={customFormulaForPosition(model, field.key)}
                    rows={5}
                    placeholder={field.placeholder}
                    className="w-full rounded border border-slate-200 px-3 py-2 font-mono text-sm text-ink outline-none transition focus:border-slate-400"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-ink">How to write it</p>
            <p className="mt-2">
              Use numbers and operators <span className="font-mono">+ - * / ( )</span>. Put source fields in braces:
              <span className="font-mono"> {"{Goals}"}</span>, <span className="font-mono">{"{xG/per90}"}</span>,
              <span className="font-mono"> {"{Assists}"}</span>. Field names are normalized automatically, so
              <span className="font-mono"> {"{Yellow cards}"}</span> becomes
              <span className="font-mono"> yellow_cards</span>.
            </p>
            <p className="mt-2">
              Missing fields count as 0. Example:
              <span className="font-mono"> 4*{"{Goals}"} + 2*{"{xG/per90}"} + 3*{"{Assists}"} - {"{Yellow cards}"}</span>.
              Leave a position empty to use the default rules for that position.
            </p>
            <p className="mt-2">
              Any numeric Excel field from the full field list below can be used. Fields that are not part of the default
              scoring table have 0 fantasy points by default; assign their weight directly in the formula, for example
              <span className="font-mono"> 0.4*{"{Touches in box per 90}"}</span>.
            </p>
          </div>

          <label className="flex items-center gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              name="customFormulaEnabled"
              defaultChecked={Boolean(model?.customFormulaEnabled)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Use custom formula for new imports
          </label>

          <button type="submit" className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Save formula
          </button>
        </form>
      </section>

      <section className="mt-6 rounded border border-slate-200 bg-white p-6 shadow-soft">
        <div>
          <h2 className="text-lg font-semibold text-ink">Поля, alias и ФО</h2>
          <p className="mt-1 text-sm text-slate-600">
            В фигурных скобках можно писать человекочитаемые названия колонок. Они автоматически превращаются в normalized
            keys: например <span className="font-mono">{"{Yellow cards}"}</span> станет{" "}
            <span className="font-mono">yellow_cards</span>.
          </p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Действие</th>
                <th className="px-3 py-3">Alias для формулы</th>
                <th className="px-3 py-3">Normalized keys</th>
                <th className="px-3 py-3 text-right">ВР</th>
                <th className="px-3 py-3 text-right">ЗЩ</th>
                <th className="px-3 py-3 text-right">ПЗЩ</th>
                <th className="px-3 py-3 text-right">НАП</th>
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
          <h2 className="text-lg font-semibold text-ink">Все поля Excel для формул</h2>
          <p className="mt-1 text-sm text-slate-600">
            Числовые поля можно использовать в кастомной формуле. Текстовые, даты и boolean-поля хранятся как metadata, но
            в математической формуле дают 0. Для дополнительных метрик ФО по умолчанию не задано: вес задается прямо в
            формуле.
          </p>
        </div>

        <div className="mt-5 max-h-[560px] overflow-auto rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Группа</th>
                <th className="px-3 py-3">Alias</th>
                <th className="px-3 py-3">Normalized key</th>
                <th className="px-3 py-3">Тип</th>
                <th className="px-3 py-3">Значение</th>
                <th className="px-3 py-3">ФО по умолчанию</th>
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
                    {field.type === "number" || field.type === "money" ? "0, задается формулой" : "не числовое"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
