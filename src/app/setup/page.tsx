import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DatabaseSetupNotice } from "@/components/database-setup-notice";
import { I18nText } from "@/components/i18n-text";
import { PublicPreferenceBar } from "@/components/public-preference-bar";
import { createUserSession, hashPassword, normalizeEmail } from "@/lib/auth";
import { authRateLimitBuckets, getClientIpFromHeaders, runLimitedAuthAttempt } from "@/lib/auth-rate-limit";
import { completeAdminBootstrap, isAdminBootstrapRequired } from "@/lib/auth-bootstrap";
import { isDatabaseConfigured, prisma } from "@/lib/db";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";

/** @spec spec://common/FEAT-009-session-authentication#bootstrap */
export default async function SetupPage({ searchParams }: PageProps) {
  if (!isDatabaseConfigured()) return <DatabaseSetupNotice />;

  const resolvedSearchParams = (await searchParams) ?? {};
  if (!(await isAdminBootstrapRequired(prisma))) redirect("/login");
  const errorMessage = setupErrorMessage(resolvedSearchParams.error);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <PublicPreferenceBar />
      <section className="ui-card w-full max-w-md p-6">
        <p className="kicker"><I18nText en="First run" ru="Первый запуск" /></p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink"><I18nText en="Create admin account" ru="Создайте администратора" /></h1>
        <p className="mt-2 max-w-[56ch] text-sm leading-6 text-slate-600">
          <I18nText
            en="Create the first admin with a password. Existing imported users without passwords will not block this setup."
            ru="Создайте первого администратора с паролем. Уже импортированные пользователи без паролей не блокируют настройку."
          />
        </p>

        {errorMessage ? (
          <p className="mt-4 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <I18nText en={errorMessage.en} ru={errorMessage.ru} />
          </p>
        ) : null}

        <form action={setupAction} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-[13px] font-semibold text-slate-700"><I18nText en="Name" ru="Имя" /></span>
            <input name="name" className="ui-input mt-1 w-full text-base outline-none" />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-slate-700"><I18nText en="Email" ru="Почта" /></span>
            <input required name="email" type="email" className="ui-input mt-1 w-full text-base outline-none" />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-slate-700"><I18nText en="Password" ru="Пароль" /></span>
            <input required name="password" type="password" minLength={8} className="ui-input mt-1 w-full text-base outline-none" />
          </label>
          <button type="submit" className="ui-button ui-button-primary w-full">
            <I18nText en="Create admin" ru="Создать администратора" />
          </button>
        </form>
      </section>
    </main>
  );
}

/** @spec spec://common/FEAT-009-session-authentication#bootstrap */
async function setupAction(formData: FormData) {
  "use server";

  if (!isDatabaseConfigured()) redirect("/setup");

  if (!(await isAdminBootstrapRequired(prisma))) redirect("/login");

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  const headerStore = await headers();
  const rateLimitBuckets = authRateLimitBuckets({ action: "setup", email, clientIp: getClientIpFromHeaders(headerStore) });
  const attempt = await runLimitedAuthAttempt(prisma, rateLimitBuckets, async (tx) => {
    if (password.length < 8) return { success: false, value: null };
    const passwordHash = await hashPassword(password);
    const user = await completeAdminBootstrap(tx, { email, name, passwordHash });
    return { success: true, value: user };
  });
  if (!attempt.allowed) {
    redirect("/setup?error=rate_limited");
  }

  if (password.length < 8) {
    redirect("/setup?error=password_short");
  }

  if (!attempt.value) redirect("/login");
  await createUserSession(attempt.value.id);
  redirect("/");
}

function setupErrorMessage(error: string | undefined) {
  if (!error) return null;
  if (error === "password_short") {
    return { en: "Password must be at least 8 characters.", ru: "Пароль должен быть не короче 8 символов." };
  }
  if (error === "rate_limited") {
    return { en: "Too many setup attempts. Try again later.", ru: "Слишком много попыток настройки. Попробуйте позже." };
  }
  return { en: error, ru: error };
}

