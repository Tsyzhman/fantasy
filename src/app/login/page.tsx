import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { createUserSession, getCurrentUser, isSafeRedirectPath, normalizeEmail, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
    next?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps) {
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

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <section className="w-full max-w-sm rounded border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fantasy Scout</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to open the workspace.</p>

        {resolvedSearchParams.error ? (
          <p className="mt-4 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{resolvedSearchParams.error}</p>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Email</span>
            <input
              required
              name="email"
              type="email"
              autoComplete="email"
              className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Password</span>
            <input
              required
              name="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </label>
          <button type="submit" className="w-full rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

async function loginAction(formData: FormData) {
  "use server";

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const nextPath = isSafeRedirectPath(String(formData.get("next") ?? "")) ? String(formData.get("next")) : "/";
  const errorPath = `/login?error=${encodeURIComponent("Invalid email, password, or inactive account.")}&next=${encodeURIComponent(nextPath)}`;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    redirect(errorPath);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });
  await createUserSession(user.id);
  redirect(nextPath);
}
