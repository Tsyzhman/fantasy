import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { SectionCrumb } from "@/components/section-crumb";
import { ProjectionFormulaEditor } from "@/components/projection-formula-editor";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  friendAltProjectionFormulaConfig,
  parseProjectionFormulaConfig,
  projectionFormulaConfigFromFormData,
  type ProjectionFormulaConfig
} from "@/machete/projection-formula-config";

type SearchParams = { error?: string; saved?: string; reset?: string };

export async function saveUserMacheteScoringPreferences(formData: FormData) {
  "use server";

  const user = await requireCurrentUser();
  if (formData.get("intent") === "reset") {
    await prisma.userScoringPreference.deleteMany({ where: { userId: user.id, modelSource: "MACHETE" } });
    revalidateUserScoringPaths();
    redirect("/machete/models?reset=1");
  }

  const parsed = projectionFormulaConfigFromFormData(
    formData,
    "alternativeProjection",
    friendAltProjectionFormulaConfig
  );
  if (parsed.issues.length > 0) {
    const issue = parsed.issues[0];
    redirect(`/machete/models?error=${encodeURIComponent(`Alt ${issue.path}: ${issue.message}`)}`);
  }

  const data = {
    scoringFormulaGk: null,
    scoringFormulaDef: null,
    scoringFormulaMid: null,
    scoringFormulaFwd: null,
    scoringFormulaEnabled: false,
    alternativeFormulaGk: null,
    alternativeFormulaDef: null,
    alternativeFormulaMid: null,
    alternativeFormulaFwd: null,
    alternativeFormulaEnabled: false,
    alternativeProjectionFormulaConfig: parsed.config
  };

  await prisma.userScoringPreference.upsert({
    where: { userId_modelSource: { userId: user.id, modelSource: "MACHETE" } },
    create: { userId: user.id, modelSource: "MACHETE", ...data },
    update: data
  });
  revalidateUserScoringPaths();
  redirect("/machete/models?saved=1");
}

export async function UserScoringPreferencesPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requireCurrentUser();
  const preference = await prisma.userScoringPreference.findUnique({
    where: { userId_modelSource: { userId: user.id, modelSource: "MACHETE" } }
  });
  const projectionConfig = editableAlternativeProjectionConfig(preference);
  const hasPersonalProjection = preference?.alternativeProjectionFormulaConfig != null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
      <SectionCrumb
        heading={false}
        items={[
          { label: "Machete", href: "/machete/leagues" },
          { label: <I18nText en="Model" ru="Модель" /> }
        ]}
      />
      <div className="mt-4">
        <h1 className="text-2xl font-bold text-ink"><I18nText en="My Alt FP formula" ru="Моя формула Alt FP" /></h1>
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
        <section className="rounded border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink"><I18nText en="My Alt FP projection" ru="Мой прогноз Alt FP" /></h2>
              <p className="mt-1 text-sm text-slate-600">
                <I18nText
                  en="Saving creates a complete personal four-stage projection. Until then, the shared adapted method is used."
                  ru="После сохранения будет использоваться ваш личный четырёхэтапный прогноз. До этого действует общая адаптированная методика."
                />
              </p>
            </div>
            <span className="w-fit rounded bg-white px-2 py-1 text-xs font-semibold text-amber-700">
              {hasPersonalProjection
                ? <I18nText en="Personal override" ru="Личная настройка" />
                : <I18nText en="Shared baseline" ru="Общая база" />}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            <I18nText
              en="Adaptations: FotMob history replaces spreadsheet chessboards; missing team recovery/save chessboards use player rates. Bookmaker odds and goals-conceded penalties are excluded from Alt."
              ru="Адаптации: история FotMob заменяет Excel-шахматки; при отсутствии командных шахматок recoveries/saves используются показатели игроков. Коэффициенты букмекеров и штраф за пропущенные голы в Alt не входят."
            />
          </p>
          <div className="mt-4">
            <ProjectionFormulaEditor config={projectionConfig} prefix="alternativeProjection" tone="amber" />
          </div>
        </section>

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

function editableAlternativeProjectionConfig(preference: {
  alternativeProjectionFormulaConfig: unknown;
  alternativeFormulaEnabled: boolean;
  alternativeFormulaGk: string | null;
  alternativeFormulaDef: string | null;
  alternativeFormulaMid: string | null;
  alternativeFormulaFwd: string | null;
} | null): ProjectionFormulaConfig {
  const parsed = parseProjectionFormulaConfig(
    preference?.alternativeProjectionFormulaConfig,
    friendAltProjectionFormulaConfig
  ).config;
  if (preference?.alternativeProjectionFormulaConfig != null || !preference?.alternativeFormulaEnabled) return parsed;

  return {
    ...parsed,
    scoreByPosition: {
      GK: preference.alternativeFormulaGk?.trim() || parsed.scoreByPosition.GK,
      DEF: preference.alternativeFormulaDef?.trim() || parsed.scoreByPosition.DEF,
      MID: preference.alternativeFormulaMid?.trim() || parsed.scoreByPosition.MID,
      FWD: preference.alternativeFormulaFwd?.trim() || parsed.scoreByPosition.FWD
    }
  };
}

function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return <div className={`mt-5 rounded border px-4 py-3 text-sm ${tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}

function revalidateUserScoringPaths() {
  for (const path of ["/machete/models", "/machete/players", "/machete/squad", "/compare"]) revalidatePath(path);
}
