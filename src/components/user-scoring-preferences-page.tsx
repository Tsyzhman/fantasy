import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { alternativeFormulaFields, friendAlternativeFormulaDefaults } from "@/lib/scoring/formula-display";
import { parseUserScoringPreferenceForm } from "@/lib/scoring/user-preferences";

type SearchParams = { error?: string; saved?: string; reset?: string };
type FormulaField = (typeof alternativeFormulaFields)[number];

export async function saveUserMacheteScoringPreferences(formData: FormData) {
  "use server";

  const user = await requireCurrentUser();
  if (formData.get("intent") === "reset") {
    await prisma.userScoringPreference.deleteMany({ where: { userId: user.id, modelSource: "MACHETE" } });
    revalidateUserScoringPaths();
    redirect("/machete/models?reset=1");
  }

  const parsed = parseUserScoringPreferenceForm(formData);
  if (!parsed.ok) redirect(`/machete/models?error=${encodeURIComponent(parsed.error)}`);

  await prisma.userScoringPreference.upsert({
    where: { userId_modelSource: { userId: user.id, modelSource: "MACHETE" } },
    create: { userId: user.id, modelSource: "MACHETE", ...parsed.data },
    update: parsed.data
  });
  revalidateUserScoringPaths();
  redirect("/machete/models?saved=1");
}

export async function UserScoringPreferencesPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requireCurrentUser();
  const preference = await prisma.userScoringPreference.findUnique({
    where: { userId_modelSource: { userId: user.id, modelSource: "MACHETE" } }
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/machete/players" className="text-sm font-semibold text-slate-600 hover:text-ink">
        <I18nText en="Back to Machete players" ru="Назад к игрокам Machete" />
      </Link>
      <div className="mt-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Machete</p>
        <h1 className="mt-2 text-3xl font-bold text-ink"><I18nText en="My Alt FP formula" ru="Моя формула Alt FP" /></h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          <I18nText
            en="Alt FP in the squad planner starts with the adapted method below for every user. You can change it only for your account; Expected FP and Actual FP remain global."
            ru="В планировщике состава Alt FP для всех пользователей изначально считается по адаптированной методике ниже. Здесь вы можете изменить её только для своей учётной записи; Expected FP и Actual FP остаются глобальными."
          />
        </p>
      </div>

      {searchParams?.error ? <Notice tone="error">{searchParams.error}</Notice> : null}
      {searchParams?.saved ? <Notice tone="success"><I18nText en="Your Alt FP formula was saved." ru="Ваша формула Alt FP сохранена." /></Notice> : null}
      {searchParams?.reset ? <Notice tone="success"><I18nText en="Personal override was removed; the shared adapted Alt method is active." ru="Личное переопределение удалено; используется общая адаптированная методика Alt." /></Notice> : null}

      <form action={saveUserMacheteScoringPreferences} className="mt-6 space-y-6">
        <FormulaSection
          title={<I18nText en="My Alt FP override" ru="Моя формула Alt FP" />}
          description={<I18nText en="Enable this to replace the shared amber Alt FP forecast in your squad planner." ru="Включите, чтобы заменить общий жёлтый прогноз Alt FP в своём планировщике состава." />}
          fields={alternativeFormulaFields}
          preference={preference}
          defaults={friendAlternativeFormulaDefaults}
          enabledName="alternativeFormulaEnabled"
          enabled={preference?.alternativeFormulaEnabled ?? false}
        />

        <div className="flex flex-wrap gap-3">
          <button type="submit" name="intent" value="save" className="rounded bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800">
            <I18nText en="Save my Alt FP" ru="Сохранить мою Alt FP" />
          </button>
          <button type="submit" name="intent" value="reset" formNoValidate className="rounded border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50">
            <I18nText en="Use shared Alt method" ru="Использовать общую методику Alt" />
          </button>
        </div>
      </form>
    </main>
  );
}

function FormulaSection({
  title,
  description,
  fields,
  preference,
  defaults,
  enabledName,
  enabled
}: {
  title: ReactNode;
  description: ReactNode;
  fields: readonly FormulaField[];
  preference: Partial<Record<FormulaField["key"], string | null>> | null;
  defaults: Partial<Record<FormulaField["key"], string | null>>;
  enabledName: "alternativeFormulaEnabled";
  enabled: boolean;
}) {
  return (
    <section className="rounded border border-amber-200 bg-amber-50 p-5">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <p className="mt-2 text-xs text-slate-500">
        <I18nText
          en="Adaptations: FotMob xG/xA and match history replace spreadsheet chessboards; missing team recovery/save chessboards use player rates. Bookmaker odds and goals-conceded penalties are excluded from Alt."
          ru="Адаптации: вместо Excel-шахматок используются xG/xA и история матчей FotMob; отсутствующие командные шахматки recoveries/saves заменены показателями игроков. Коэффициенты букмекеров и штраф за пропущенные голы в Alt не входят."
        />
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="text-sm font-semibold text-slate-700">
            {field.position}
            <textarea
              name={field.key}
              rows={4}
              maxLength={4_000}
              defaultValue={typeof preference?.[field.key] === "string" && preference[field.key]?.trim()
                ? String(preference[field.key])
                : String(defaults[field.key] ?? "")}
              placeholder={field.placeholder}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-normal"
            />
          </label>
        ))}
      </div>
      <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-ink">
        <input type="checkbox" name={enabledName} defaultChecked={enabled} className="h-4 w-4 rounded border-slate-300" />
        <I18nText en="Use my personal override" ru="Использовать моё личное переопределение" />
      </label>
    </section>
  );
}

function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return <div className={`mt-5 rounded border px-4 py-3 text-sm ${tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}

function revalidateUserScoringPaths() {
  for (const path of ["/machete/models", "/machete/players", "/machete/squad", "/compare"]) revalidatePath(path);
}
