import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { loadBetaAcceptanceEvidence } from "@/beta/acceptance-evidence";
import {
  betaModeratedEnvironments,
  buildBetaUserTestReport,
  validateBetaReviewInput,
  type BetaModeratedEnvironment,
  type BetaReviewInput
} from "@/beta/user-test";
import { AdminNav } from "@/components/admin/AdminNav";
import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

const reportWindowDays = 30;

export const dynamic = "force-dynamic";

export default async function AdminBetaTestPage({ searchParams }: PageProps) {
  await requireAdminUser();
  const resolvedSearchParams = (await searchParams) ?? {};
  const since = betaReportWindowStart();
  const [runs, acceptanceEvidence] = await Promise.all([prisma.betaTestRun.findMany({
    where: { startedAt: { gte: since } },
    select: {
      id: true,
      userId: true,
      deviceClass: true,
      synthetic: true,
      valid: true,
      withoutHelp: true,
      transferReasonUnderstood: true,
      usabilityRating: true,
      criticalIssue: true,
      moderatedEnvironment: true,
      invalidReason: true,
      submittedAt: true,
      startedAt: true,
      observations: {
        select: {
          kind: true,
          name: true,
          route: true,
          value: true,
          rating: true,
          count: true,
          createdAt: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }
    },
    orderBy: [{ startedAt: "asc" }, { id: "asc" }]
  }), loadBetaAcceptanceEvidence()]);
  const report = buildBetaUserTestReport(runs, acceptanceEvidence);
  const errorMessage = betaReviewErrorMessage(resolvedSearchParams.error);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AdminNav />
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            <I18nText en="Administration" ru="Администрирование" />
          </p>
          <h1 className="mt-2 text-3xl font-bold text-ink">
            <I18nText en="Moderated beta test" ru="Модерируемый beta-тест" />
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            <I18nText
              en={`Real-user journey, RUM, and moderator reviews for the last ${reportWindowDays} days. Synthetic QA never enters the human or RUM gates.`}
              ru={`Реальный пользовательский сценарий, RUM и moderator review за последние ${reportWindowDays} дней. Synthetic QA никогда не входит в human- или RUM-gate.`}
            />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/beta-test/report" download className="rounded border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <I18nText en="Download JSON report" ru="Скачать JSON-отчёт" />
          </a>
          <Link href="/admin/users" className="rounded border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <I18nText en="Create participant account" ru="Создать аккаунт участника" />
          </Link>
          <span className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white">
            <I18nText en="Participant URL: /beta-test" ru="URL участника: /beta-test" />
          </span>
        </div>
      </div>

      {errorMessage ? (
        <p className="mt-6 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <I18nText en={errorMessage.en} ru={errorMessage.ru} />
        </p>
      ) : null}
      {resolvedSearchParams.saved ? (
        <p className="mt-6 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <I18nText en={`Review saved for ${resolvedSearchParams.saved}.`} ru={`Review сохранён для ${resolvedSearchParams.saved}.`} />
        </p>
      ) : null}

      <section aria-labelledby="beta-gate-heading" className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="beta-gate-heading" className="text-xl font-bold text-ink">
              <I18nText en="Current gate" ru="Текущий gate" />
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              <I18nText en={`Scope starts ${formatDate(since)}.`} ru={`Начало выборки: ${formatDate(since)}.`} />
            </p>
          </div>
          <span className={report.gate.passed ? "rounded bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800" : "rounded bg-rose-100 px-3 py-2 text-sm font-bold text-rose-800"}>
            {report.gate.passed ? <I18nText en="PASS" ru="PASS" /> : <I18nText en="FAIL" ru="FAIL" />}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label={<I18nText en="Valid participants" ru="Валидные участники" />} value={`${report.participants} / 10`} />
          <MetricCard label={<I18nText en="Without-help completion" ru="Прохождение без помощи" />} value={formatPercentage(report.completionRate)} />
          <MetricCard label={<I18nText en="Forecast found" ru="Прогноз найден" />} value={formatPercentage(report.forecastFoundRate)} />
          <MetricCard label={<I18nText en="Transfer understood" ru="Трансфер понят" />} value={formatPercentage(report.transferUnderstandingRate)} />
          <MetricCard label={<I18nText en="Usability" ru="Удобство" />} value={report.averageUsabilityRating === null ? "—" : `${report.averageUsabilityRating} / 5`} />
          <MetricCard label={<I18nText en="Real RUM participants" ru="Реальные RUM-участники" />} value={`${report.rum.lcpParticipants} / ${report.rum.gate.minimumLcpParticipants}`} />
          <MetricCard label={<I18nText en="LCP p75" ru="LCP p75" />} value={formatMilliseconds(report.rum.webVitals.LCP.p75)} />
          <MetricCard label={<I18nText en="Client-error affected runs" ru="Прогоны с client error" />} value={formatPercentage(report.rum.clientErrorAffectedRunRate)} />
          <MetricCard label={<I18nText en="Server 5xx" ru="Server 5xx" />} value={report.serverWindow.evidence ? formatPercentage(report.serverWindow.evidence.serverErrorRatePercent) : "—"} />
          <MetricCard label={<I18nText en="Server window" ru="Окно сервера" />} value={report.serverWindow.evidence ? formatHours(report.serverWindow.evidence.observedSpanMinutes / 60) : "—"} />
          <MetricCard label={<I18nText en="Physical Safari iOS" ru="Физический Safari iOS" />} value={`${report.physicalDeviceCoverage.iosSafari} / 1`} />
          <MetricCard label={<I18nText en="Physical Chrome Android" ru="Физический Chrome Android" />} value={`${report.physicalDeviceCoverage.androidChrome} / 1`} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-ink"><I18nText en="Sample integrity" ru="Целостность выборки" /></h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <SummaryRow label={<I18nText en="All runs" ru="Все прогоны" />} value={report.totalRuns} />
              <SummaryRow label={<I18nText en="Real runs" ru="Реальные прогоны" />} value={report.rum.realRuns} />
              <SummaryRow label={<I18nText en="Synthetic QA" ru="Synthetic QA" />} value={report.syntheticRuns} />
              <SummaryRow label={<I18nText en="Open, not submitted" ru="Открытые, не отправленные" />} value={report.unsubmittedRealRuns} />
              <SummaryRow label={<I18nText en="Pending review" ru="Ожидают review" />} value={report.pendingReviewRuns} />
              <SummaryRow label={<I18nText en="Invalid runs" ru="Invalid-прогоны" />} value={report.invalidRuns} />
              <SummaryRow label={<I18nText en="Repeat valid runs" ru="Повторные valid" />} value={report.repeatValidRuns} />
              <SummaryRow label={<I18nText en="Critical issues" ru="Critical issues" />} value={report.criticalIssues} />
              <SummaryRow label={<I18nText en="RUM window" ru="Окно RUM" />} value={formatHours(report.rum.observationWindowHours)} />
            </dl>
          </section>
          <section className="rounded border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-ink"><I18nText en="Unmet conditions" ru="Невыполненные условия" /></h3>
            {report.gate.violations.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-rose-700">
                {report.gate.violations.map((violation) => <li key={violation}>• {violation}</li>)}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-emerald-700"><I18nText en="All automated and moderator gates pass." ru="Все автоматические и moderator gates пройдены." /></p>
            )}
          </section>
        </div>
      </section>

      <section aria-labelledby="open-runs-heading" className="mt-10">
        <h2 id="open-runs-heading" className="text-xl font-bold text-ink">
          <I18nText en={`Open, not submitted (${report.unsubmittedRuns.length})`} ru={`Открытые, не отправленные (${report.unsubmittedRuns.length})`} />
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          <I18nText
            en="These real runs block the gate. Ask the participant to submit; only a genuinely abandoned run may be closed as technically invalid with a concrete reason."
            ru="Эти реальные прогоны блокируют gate. Попросите участника отправить результат; только действительно брошенный прогон можно закрыть как технически invalid с конкретной причиной."
          />
        </p>
        {report.unsubmittedRuns.length === 0 ? (
          <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            <I18nText en="No real runs remain open." ru="Нет незакрытых реальных прогонов." />
          </p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {report.unsubmittedRuns.map((run) => (
              <article key={run.runId} className="rounded border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-ink">{run.participantCode}</strong>
                  <span className="text-sm text-slate-500">{formatDate(new Date(run.startedAt))} · {run.deviceClass}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  <I18nText
                    en={`Aborted milestone: ${run.aborted ? "yes" : "no"}. Client errors: ${run.clientErrors}. Missing: ${run.missingMilestones.join(", ") || "none"}.`}
                    ru={`Этап прерывания: ${run.aborted ? "да" : "нет"}. Client errors: ${run.clientErrors}. Пропущено: ${run.missingMilestones.join(", ") || "нет"}.`}
                  />
                </p>
                <form action={reviewBetaRunAction} className="mt-4">
                  <input type="hidden" name="runId" value={run.runId} />
                  <input type="hidden" name="intent" value="invalid" />
                  <label className="block text-sm font-semibold text-slate-700">
                    <I18nText en="Concrete abandonment or technical reason" ru="Конкретная причина прерывания или технической невалидности" />
                    <input required name="invalidReason" maxLength={200} className="mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 font-normal" />
                  </label>
                  <label className="mt-3 block text-sm font-semibold text-slate-700">
                    <I18nText en="Observed device/browser" ru="Проверенное устройство/браузер" />
                    <select required name="moderatedEnvironment" defaultValue="" className="mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 font-normal">
                      <LocalizedOption value="" disabled en="Select observed environment" ru="Выберите проверенную среду" />
                      <LocalizedOption value="DESKTOP_BROWSER" en="Desktop browser" ru="Desktop-браузер" />
                      <LocalizedOption value="IOS_SAFARI_PHYSICAL" en="Physical Safari iOS" ru="Физический Safari iOS" />
                      <LocalizedOption value="ANDROID_CHROME_PHYSICAL" en="Physical Chrome Android" ru="Физический Chrome Android" />
                      <LocalizedOption value="OTHER_MOBILE" en="Other mobile / emulator" ru="Другой телефон / эмулятор" />
                    </select>
                  </label>
                  <ReviewNotes />
                  <button type="submit" className="mt-3 rounded border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                    <I18nText en="Submit and close as invalid" ru="Отправить и закрыть как invalid" />
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="pending-reviews-heading" className="mt-10">
        <h2 id="pending-reviews-heading" className="text-xl font-bold text-ink">
          <I18nText en={`Pending reviews (${report.pendingReviews.length})`} ru={`Ожидают review (${report.pendingReviews.length})`} />
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          <I18nText
            en="Do not enter names, email addresses, or other personal data in notes. A valid review requires the moderator's independent human judgment."
            ru="Не указывайте в заметках имена, email и другие персональные данные. Valid-review требует отдельной человеческой оценки модератора."
          />
        </p>
        {report.pendingReviews.length === 0 ? (
          <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            <I18nText en="No real runs are waiting for review." ru="Нет реальных прогонов, ожидающих review." />
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {report.pendingReviews.map((pending) => (
              <article key={pending.runId} className="rounded border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-ink">{pending.participantCode}</h3>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(new Date(pending.startedAt))} · {pending.deviceClass} · {formatDuration(pending.durationMs)}</p>
                  </div>
                  <span className={pending.technicalComplete ? "rounded bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" : "rounded bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800"}>
                    {pending.technicalComplete ? <I18nText en="Technical journey complete" ru="Технический сценарий завершён" /> : <I18nText en="Technical journey incomplete" ru="Технический сценарий не завершён" />}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  <I18nText en={`Aborted: ${pending.aborted ? "yes" : "no"}. Client errors: ${pending.clientErrors}. Missing milestones: ${pending.missingMilestones.join(", ") || "none"}.`} ru={`Прерван: ${pending.aborted ? "да" : "нет"}. Client errors: ${pending.clientErrors}. Пропущенные этапы: ${pending.missingMilestones.join(", ") || "нет"}.`} />
                </p>

                <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
                  <form action={reviewBetaRunAction} className="rounded border border-emerald-200 bg-emerald-50/40 p-4">
                    <input type="hidden" name="runId" value={pending.runId} />
                    <input type="hidden" name="intent" value="valid" />
                    <h4 className="font-semibold text-emerald-900"><I18nText en="Review as valid" ru="Подтвердить как valid" /></h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <ReviewBooleanSelect name="withoutHelp" label={<I18nText en="Without help" ru="Без помощи" />} />
                      <ReviewBooleanSelect name="transferUnderstood" label={<I18nText en="Transfer understood" ru="Трансфер понят" />} />
                      <label className="text-sm font-semibold text-slate-700">
                        <I18nText en="Usability rating" ru="Оценка удобства" />
                        <select required name="rating" defaultValue="" className="mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 font-normal">
                          <LocalizedOption value="" disabled en="Select rating" ru="Выберите оценку" />
                          {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}
                        </select>
                      </label>
                      <ReviewBooleanSelect name="critical" label={<I18nText en="Critical/blocker" ru="Critical/blocker" />} />
                      <label className="text-sm font-semibold text-slate-700">
                        <I18nText en="Observed device/browser" ru="Проверенное устройство/браузер" />
                        <select required name="moderatedEnvironment" defaultValue="" className="mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 font-normal">
                          <LocalizedOption value="" disabled en="Select observed environment" ru="Выберите проверенную среду" />
                          <LocalizedOption value="DESKTOP_BROWSER" en="Desktop browser" ru="Desktop-браузер" />
                          <LocalizedOption value="IOS_SAFARI_PHYSICAL" en="Physical Safari iOS" ru="Физический Safari iOS" />
                          <LocalizedOption value="ANDROID_CHROME_PHYSICAL" en="Physical Chrome Android" ru="Физический Chrome Android" />
                          <LocalizedOption value="OTHER_MOBILE" en="Other mobile / emulator" ru="Другой телефон / эмулятор" />
                        </select>
                      </label>
                    </div>
                    <ReviewNotes />
                    <button type="submit" className="mt-3 rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                      <I18nText en="Save valid review" ru="Сохранить valid-review" />
                    </button>
                  </form>

                  <form action={reviewBetaRunAction} className="rounded border border-amber-200 bg-amber-50/40 p-4">
                    <input type="hidden" name="runId" value={pending.runId} />
                    <input type="hidden" name="intent" value="invalid" />
                    <h4 className="font-semibold text-amber-900"><I18nText en="Exclude as technically invalid" ru="Исключить как технически invalid" /></h4>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                      <I18nText en="Concrete technical reason" ru="Конкретная техническая причина" />
                      <input required name="invalidReason" maxLength={200} className="mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 font-normal" />
                    </label>
                    <label className="mt-3 block text-sm font-semibold text-slate-700">
                      <I18nText en="Observed device/browser" ru="Проверенное устройство/браузер" />
                      <select required name="moderatedEnvironment" defaultValue="" className="mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 font-normal">
                        <LocalizedOption value="" disabled en="Select observed environment" ru="Выберите проверенную среду" />
                        <LocalizedOption value="DESKTOP_BROWSER" en="Desktop browser" ru="Desktop-браузер" />
                        <LocalizedOption value="IOS_SAFARI_PHYSICAL" en="Physical Safari iOS" ru="Физический Safari iOS" />
                        <LocalizedOption value="ANDROID_CHROME_PHYSICAL" en="Physical Chrome Android" ru="Физический Chrome Android" />
                        <LocalizedOption value="OTHER_MOBILE" en="Other mobile / emulator" ru="Другой телефон / эмулятор" />
                      </select>
                    </label>
                    <ReviewNotes />
                    <button type="submit" className="mt-3 rounded border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                      <I18nText en="Save invalid review" ru="Сохранить invalid-review" />
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="invalid-runs-heading" className="mt-10">
        <h2 id="invalid-runs-heading" className="text-xl font-bold text-ink">
          <I18nText en={`Technically invalid attempts (${report.invalidAttempts.length})`} ru={`Технически invalid-прогоны (${report.invalidAttempts.length})`} />
        </h2>
        {report.invalidAttempts.length === 0 ? (
          <p className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            <I18nText en="No technically invalid attempts have been excluded." ru="Нет исключённых технически invalid-прогонов." />
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {report.invalidAttempts.map((run) => (
              <article key={`${run.participantCode}-${run.startedAt}`} className="rounded border border-amber-200 bg-amber-50/50 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-ink">{run.participantCode}</strong>
                  <span className="text-slate-500">{formatDate(new Date(run.startedAt))}</span>
                </div>
                <p className="mt-2 text-slate-700">{run.invalidReason}</p>
                <p className="mt-2 text-xs text-slate-500">
                  <I18nText
                    en={`${run.deviceClass} · ${formatModeratedEnvironment(run.moderatedEnvironment)} · aborted: ${run.aborted ? "yes" : "no"} · client errors: ${run.clientErrors} · missing: ${run.missingMilestones.join(", ") || "none"}`}
                    ru={`${run.deviceClass} · ${formatModeratedEnvironment(run.moderatedEnvironment)} · прерван: ${run.aborted ? "да" : "нет"} · client errors: ${run.clientErrors} · пропущено: ${run.missingMilestones.join(", ") || "нет"}`}
                  />
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="primary-runs-heading" className="mt-10">
        <h2 id="primary-runs-heading" className="text-xl font-bold text-ink">
          <I18nText en="Primary participant results" ru="Основные результаты участников" />
        </h2>
        <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3"><I18nText en="Code" ru="Код" /></th>
                <th className="px-4 py-3"><I18nText en="Device" ru="Устройство" /></th>
                <th className="px-4 py-3"><I18nText en="Technical" ru="Технически" /></th>
                <th className="px-4 py-3"><I18nText en="Duration" ru="Время" /></th>
                <th className="px-4 py-3"><I18nText en="Without help" ru="Без помощи" /></th>
                <th className="px-4 py-3"><I18nText en="Critical" ru="Critical" /></th>
                <th className="px-4 py-3"><I18nText en="Environment" ru="Среда" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.primaryRuns.length > 0 ? report.primaryRuns.map((run) => (
                <tr key={run.runId}>
                  <td className="px-4 py-3 font-semibold text-ink">{run.participantCode}</td>
                  <td className="px-4 py-3 text-slate-600">{run.deviceClass}</td>
                  <td className="px-4 py-3">{formatBoolean(run.technicalComplete)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDuration(run.durationMs)}</td>
                  <td className="px-4 py-3">{formatBoolean(run.withoutHelp)}</td>
                  <td className="px-4 py-3">{formatBoolean(run.criticalIssue)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatModeratedEnvironment(run.moderatedEnvironment)}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500"><I18nText en="No moderator-approved primary runs." ru="Нет подтверждённых moderator primary-прогонов." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

async function reviewBetaRunAction(formData: FormData) {
  "use server";

  await requireAdminUser();
  const runId = String(formData.get("runId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const valid = intent === "valid";
  const input: BetaReviewInput = {
    runId,
    valid,
    withoutHelp: valid ? formBoolean(formData, "withoutHelp") : null,
    transferReasonUnderstood: valid ? formBoolean(formData, "transferUnderstood") : null,
    usabilityRating: valid ? Number(formData.get("rating")) : null,
    criticalIssue: valid ? formBoolean(formData, "critical") : null,
    moderatedEnvironment: formModeratedEnvironment(formData),
    invalidReason: valid ? null : String(formData.get("invalidReason") ?? "").trim() || null,
    moderatorNotes: String(formData.get("notes") ?? "").trim() || null
  };
  const parsed = validateBetaReviewInput(input);
  if (!parsed.ok) redirect("/admin/beta-test?error=invalid_review");

  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${runId}, 0))`;
    const existing = await transaction.betaTestRun.findUnique({
      where: { id: runId },
      select: { id: true, synthetic: true, submittedAt: true }
    });
    if (!existing) return "not_found" as const;
    if (existing.synthetic) return "synthetic" as const;
    if (!existing.submittedAt && parsed.value.valid) return "not_submitted" as const;

    await transaction.betaTestRun.update({
      where: { id: runId },
      data: {
        valid: parsed.value.valid,
        withoutHelp: parsed.value.withoutHelp,
        transferReasonUnderstood: parsed.value.transferReasonUnderstood,
        usabilityRating: parsed.value.usabilityRating,
        criticalIssue: parsed.value.criticalIssue,
        moderatedEnvironment: parsed.value.moderatedEnvironment,
        invalidReason: parsed.value.invalidReason,
        moderatorNotes: parsed.value.moderatorNotes,
        reviewedAt: new Date()
      }
    });
    return "saved" as const;
  });
  if (result !== "saved") redirect(`/admin/beta-test?error=${result}`);

  revalidatePath("/admin/beta-test");
  redirect(`/admin/beta-test?saved=${runId.slice(0, 8)}`);
}

function MetricCard({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink num-tabular">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return <><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold text-ink num-tabular">{value}</dd></>;
}

function ReviewBooleanSelect({ name, label }: { name: string; label: ReactNode }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select required name={name} defaultValue="" className="mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 font-normal">
        <LocalizedOption value="" disabled en="Select answer" ru="Выберите ответ" />
        <option value="true">Yes / Да</option>
        <option value="false">No / Нет</option>
      </select>
    </label>
  );
}

function ReviewNotes() {
  return (
    <label className="mt-3 block text-sm font-semibold text-slate-700">
      <I18nText en="Anonymous moderator note (optional)" ru="Анонимная заметка модератора (необязательно)" />
      <textarea name="notes" maxLength={500} rows={2} className="mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 font-normal" />
    </label>
  );
}

function formBoolean(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "");
  return value === "true" ? true : value === "false" ? false : null;
}

function formModeratedEnvironment(formData: FormData): BetaModeratedEnvironment | null {
  const value = String(formData.get("moderatedEnvironment") ?? "");
  return betaModeratedEnvironments.includes(value as BetaModeratedEnvironment) ? value as BetaModeratedEnvironment : null;
}

function formatPercentage(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : `${value}%`;
}

function formatMilliseconds(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString("ru-RU")} ms`;
}

function formatHours(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("ru-RU")} h`;
}

function formatDuration(value: number | null) {
  if (value === null) return "—";
  return `${Math.round(value / 1_000)} s`;
}

function formatBoolean(value: boolean | null) {
  if (value === null) return "—";
  return value ? "Yes / Да" : "No / Нет";
}

function formatModeratedEnvironment(value: string | null) {
  const labels: Record<BetaModeratedEnvironment, string> = {
    DESKTOP_BROWSER: "Desktop browser",
    IOS_SAFARI_PHYSICAL: "Physical Safari iOS",
    ANDROID_CHROME_PHYSICAL: "Physical Chrome Android",
    OTHER_MOBILE: "Other mobile / emulator"
  };
  return value && betaModeratedEnvironments.includes(value as BetaModeratedEnvironment)
    ? labels[value as BetaModeratedEnvironment]
    : "—";
}

function betaReviewErrorMessage(error: string | undefined) {
  if (!error) return null;
  const labels: Record<string, { en: string; ru: string }> = {
    invalid_review: { en: "Review fields are incomplete or invalid.", ru: "Поля review заполнены не полностью или некорректно." },
    not_found: { en: "The beta run no longer exists.", ru: "Beta-прогон больше не существует." },
    synthetic: { en: "Synthetic QA runs cannot be moderator-approved.", ru: "Synthetic QA нельзя подтвердить как реального участника." },
    not_submitted: { en: "The participant has not submitted this beta run yet.", ru: "Участник ещё не отправил этот beta-прогон." }
  };
  return labels[error] ?? { en: "Could not save the review.", ru: "Не удалось сохранить review." };
}

function betaReportWindowStart() {
  const now = new Date();
  return new Date(now.getTime() - reportWindowDays * 24 * 60 * 60 * 1_000);
}
