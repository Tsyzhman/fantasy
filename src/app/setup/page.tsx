import { UserRole } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DatabaseSetupNotice } from "@/components/database-setup-notice";
import { I18nText } from "@/components/i18n-text";
import { createUserSession, hashPassword, normalizeEmail } from "@/lib/auth";
import { authRateLimitBuckets, checkAuthRateLimits, clearAuthRateLimits, getClientIpFromHeaders, recordFailedAuthAttempt } from "@/lib/auth-rate-limit";
import { isDatabaseConfigured, prisma } from "@/lib/db";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: PageProps) {
  if (!isDatabaseConfigured()) return <DatabaseSetupNotice />;

  const resolvedSearchParams = (await searchParams) ?? {};
  const adminWithPasswordCount = await getAdminWithPasswordCount();
  if (adminWithPasswordCount > 0) redirect("/login");
  const errorMessage = setupErrorMessage(resolvedSearchParams.error);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <section className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="First run" ru="Первый запуск" /></p>
        <h1 className="mt-2 text-2xl font-bold text-ink"><I18nText en="Create admin account" ru="Создайте администратора" /></h1>
        <p className="mt-2 text-sm text-slate-600">
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
            <span className="text-sm font-semibold text-slate-700"><I18nText en="Name" ru="Имя" /></span>
            <input name="name" className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700"><I18nText en="Email" ru="Почта" /></span>
            <input required name="email" type="email" className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700"><I18nText en="Password" ru="Пароль" /></span>
            <input required name="password" type="password" minLength={8} className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </label>
          <button type="submit" className="w-full rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            <I18nText en="Create admin" ru="Создать администратора" />
          </button>
        </form>
      </section>
    </main>
  );
}

async function setupAction(formData: FormData) {
  "use server";

  if (!isDatabaseConfigured()) redirect("/setup");

  if ((await getAdminWithPasswordCount()) > 0) redirect("/login");

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  const headerStore = await headers();
  const rateLimitBuckets = authRateLimitBuckets({ action: "setup", email, clientIp: getClientIpFromHeaders(headerStore) });
  const rateLimit = await checkAuthRateLimits(prisma, rateLimitBuckets);
  if (!rateLimit.allowed) {
    redirect("/setup?error=rate_limited");
  }

  if (password.length < 8) {
    await recordFailedAuthAttempt(prisma, rateLimitBuckets);
    redirect("/setup?error=password_short");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date()
    },
    update: {
      name,
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date()
    }
  });

  await clearAuthRateLimits(prisma, rateLimitBuckets);
  await createUserSession(user.id);
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

function getAdminWithPasswordCount() {
  return prisma.user.count({
    where: {
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash: { not: null }
    }
  });
}
