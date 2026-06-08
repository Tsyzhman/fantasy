import { UserRole } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DatabaseSetupNotice } from "@/components/database-setup-notice";
import { I18nText } from "@/components/i18n-text";
import { createUserSession, getCurrentUser, isSafeRedirectPath, normalizeEmail, verifyPassword } from "@/lib/auth";
import { authRateLimitBuckets, checkAuthRateLimits, clearAuthRateLimits, getClientIpFromHeaders, recordFailedAuthAttempt } from "@/lib/auth-rate-limit";
import { isDatabaseConfigured, prisma } from "@/lib/db";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps) {
  if (!isDatabaseConfigured()) return <DatabaseSetupNotice />;

  const resolvedSearchParams = (await searchParams) ?? {};
  const adminWithPasswordCount = await prisma.user.count({
    where: {
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash: { not: null }
    }
  });
  if (adminWithPasswordCount === 0) redirect("/setup");

  const currentUser = await getCurrentUser();
  const requestedNextPath = resolvedSearchParams.next;
  const nextPath = isSafeRedirectPath(requestedNextPath) ? requestedNextPath : "/";
  if (currentUser) redirect(nextPath);
  const errorMessage = loginErrorMessage(resolvedSearchParams.error);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <section className="w-full max-w-sm rounded border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fantasy Scout</p>
        <h1 className="mt-2 text-2xl font-bold text-ink"><I18nText en="Sign in" ru="Вход" /></h1>
        <p className="mt-2 text-sm text-slate-600"><I18nText en="Sign in to open the workspace." ru="Войдите, чтобы открыть рабочую область." /></p>

        {errorMessage ? (
          <p className="mt-4 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <I18nText en={errorMessage.en} ru={errorMessage.ru} />
          </p>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700"><I18nText en="Email" ru="Почта" /></span>
            <input
              required
              name="email"
              type="email"
              autoComplete="email"
              className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700"><I18nText en="Password" ru="Пароль" /></span>
            <input
              required
              name="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </label>
          <button type="submit" className="w-full rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            <I18nText en="Sign in" ru="Войти" />
          </button>
        </form>
      </section>
    </main>
  );
}

async function loginAction(formData: FormData) {
  "use server";

  if (!isDatabaseConfigured()) redirect("/login");

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const nextPath = isSafeRedirectPath(String(formData.get("next") ?? "")) ? String(formData.get("next")) : "/";
  const errorPath = `/login?error=invalid&next=${encodeURIComponent(nextPath)}`;
  const headerStore = await headers();
  const rateLimitBuckets = authRateLimitBuckets({ action: "login", email, clientIp: getClientIpFromHeaders(headerStore) });
  const rateLimit = await checkAuthRateLimits(prisma, rateLimitBuckets);
  if (!rateLimit.allowed) {
    redirect(`/login?error=rate_limited&next=${encodeURIComponent(nextPath)}`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    await recordFailedAuthAttempt(prisma, rateLimitBuckets);
    redirect(errorPath);
  }

  await clearAuthRateLimits(prisma, rateLimitBuckets);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });
  await createUserSession(user.id);
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
