import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { createUserSession, hashPassword, normalizeEmail } from "@/lib/auth";
import { prisma } from "@/lib/db";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const adminWithPasswordCount = await getAdminWithPasswordCount();
  if (adminWithPasswordCount > 0) redirect("/login");

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <section className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">First run</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">Create admin account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create the first admin with a password. Existing imported users without passwords will not block this setup.
        </p>

        {resolvedSearchParams.error ? (
          <p className="mt-4 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">{resolvedSearchParams.error}</p>
        ) : null}

        <form action={setupAction} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Name</span>
            <input name="name" className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Email</span>
            <input required name="email" type="email" className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Password</span>
            <input required name="password" type="password" minLength={8} className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
          </label>
          <button type="submit" className="w-full rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Create admin
          </button>
        </form>
      </section>
    </main>
  );
}

async function setupAction(formData: FormData) {
  "use server";

  if ((await getAdminWithPasswordCount()) > 0) redirect("/login");

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");

  if (password.length < 8) {
    redirect(`/setup?error=${encodeURIComponent("Password must be at least 8 characters.")}`);
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

  await createUserSession(user.id);
  redirect("/");
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
