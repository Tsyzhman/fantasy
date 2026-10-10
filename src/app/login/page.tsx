import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DatabaseSetupNotice } from "@/components/database-setup-notice";
import { I18nText } from "@/components/i18n-text";
import { PublicPreferenceBar } from "@/components/public-preference-bar";
import { createUserSession, getCurrentUser, isSafeRedirectPath, normalizeEmail, verifyPassword } from "@/lib/auth";
import { authRateLimitBuckets, getClientIpFromHeaders, runLimitedAuthAttempt } from "@/lib/auth-rate-limit";
import { isAdminBootstrapRequired } from "@/lib/auth-bootstrap";
import { isDatabaseConfigured, prisma } from "@/lib/db";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
  }>;
};

export const dynamic = "force-dynamic";

/** @spec spec://common/FEAT-009-session-authentication#root */
export default async function LoginPage({ searchParams }: PageProps) {
  if (!isDatabaseConfigured()) return <DatabaseSetupNotice />;

  const resolvedSearchParams = (await searchParams) ?? {};
  if (await isAdminBootstrapRequired(prisma)) redirect("/setup");

  const currentUser = await getCurrentUser();
  const requestedNextPath = resolvedSearchParams.next;
  const nextPath = isSafeRedirectPath(requestedNextPath) ? requestedNextPath : "/";
  if (currentUser) redirect(nextPath);
  const errorMessage = loginErrorMessage(resolvedSearchParams.error);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <PublicPreferenceBar />
      <section className="ui-card w-full max-w-sm p-6">
        <p className="kicker">Fantasy Scout</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink"><I18nText en="Sign in" ru="Вход" /></h1>
        <p className="mt-2 max-w-[42ch] text-sm leading-6 text-slate-600"><I18nText en="Sign in to open the workspace." ru="Войдите, чтобы открыть рабочую область." /></p>

        {errorMessage ? (
          <p className="mt-4 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <I18nText en={errorMessage.en} ru={errorMessage.ru} />
          </p>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block">
            <span className="text-[13px] font-semibold text-slate-700"><I18nText en="Email" ru="Почта" /></span>
            <input
              required
              name="email"
              type="email"
              autoComplete="email"
              className="ui-input mt-1 w-full text-base outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-slate-700"><I18nText en="Password" ru="Пароль" /></span>
            <input
              required
              name="password"
              type="password"
              autoComplete="current-password"
              className="ui-input mt-1 w-full text-base outline-none"
            />
          </label>
          <button type="submit" className="ui-button ui-button-primary w-full">
            <I18nText en="Sign in" ru="Войти" />
          </button>
        </form>
      </section>
    </main>
  );
}

/** @spec spec://common/FEAT-009-session-authentication#attempts */
async function loginAction(formData: FormData) {
  "use server";

  if (!isDatabaseConfigured()) redirect("/login");

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const nextPath = isSafeRedirectPath(String(formData.get("next") ?? "")) ? String(formData.get("next")) : "/";
  const errorPath = `/login?error=invalid&next=${encodeURIComponent(nextPath)}`;
  const headerStore = await headers();
  const rateLimitBuckets = authRateLimitBuckets({ action: "login", email, clientIp: getClientIpFromHeaders(headerStore) });
  const attempt = await runLimitedAuthAttempt(prisma, rateLimitBuckets, async (tx) => {
    const user = await tx.user.findUnique({ where: { email } });
    const success = Boolean(user?.isActive && await verifyPassword(password, user.passwordHash));
    if (success && user) await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { success, value: user };
  });
  if (!attempt.allowed) {
    redirect(`/login?error=rate_limited&next=${encodeURIComponent(nextPath)}`);
  }

  if (!attempt.success || !attempt.value) redirect(errorPath);
  await createUserSession(attempt.value.id);
  redirect(nextPath);
}

function loginErrorMessage(error: string | undefined) {
  if (!error) return null;
  if (error === "invalid") {
    return { en: "Invalid email, password, or inactive account.", ru: "Неверная почта, пароль или аккаунт отключен." };
  }
  if (error === "rate_limited") {
    return { en: "Too many sign-in attempts. Try again later.", ru: "Слишком много попыток входа. Попробуйте позже." };
  }
  return { en: error, ru: error };
}
