import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/AdminNav";
import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { hashPassword, normalizeEmail, requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const admin = await requireAdminUser();
  const resolvedSearchParams = (await searchParams) ?? {};
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true
    }
  });
  const errorMessage = usersErrorMessage(resolvedSearchParams.error);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <AdminNav />
      <div className="mt-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500"><I18nText en="Administration" ru="Администрирование" /></p>
        <h1 className="mt-2 text-3xl font-bold text-ink"><I18nText en="Users" ru="Пользователи" /></h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          <I18nText en="Create team accounts, change roles, and temporarily disable access without deleting history." ru="Создавайте аккаунты команды, меняйте роли и временно отключайте доступ без удаления истории." />
        </p>
      </div>

      {errorMessage ? (
        <p className="mt-6 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <I18nText en={errorMessage.en} ru={errorMessage.ru} />
        </p>
      ) : null}
      {resolvedSearchParams.saved ? (
        <p className="mt-6 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><I18nText en="Changes saved." ru="Изменения сохранены." /></p>
      ) : null}

      <section className="mt-8 grid gap-8 lg:grid-cols-[360px_1fr]">
        <form action={createUserAction} className="self-start rounded border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink"><I18nText en="Create account" ru="Создать аккаунт" /></h2>
          <div className="mt-4 space-y-4">
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
            <label className="block">
              <span className="text-sm font-semibold text-slate-700"><I18nText en="Role" ru="Роль" /></span>
              <select name="role" defaultValue={UserRole.USER} className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                <LocalizedOption value={UserRole.USER} en="User" ru="Пользователь" />
                <LocalizedOption value={UserRole.ADMIN} en="Admin" ru="Администратор" />
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input name="isActive" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              <I18nText en="Active" ru="Активен" />
            </label>
            <button type="submit" className="w-full rounded bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              <I18nText en="Create user" ru="Создать пользователя" />
            </button>
          </div>
        </form>

        <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1.3fr_220px_120px_160px_150px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span><I18nText en="User" ru="Пользователь" /></span>
            <span><I18nText en="Role" ru="Роль" /></span>
            <span><I18nText en="Status" ru="Статус" /></span>
            <span><I18nText en="Last login" ru="Последний вход" /></span>
            <span className="text-right"><I18nText en="Action" ru="Действие" /></span>
          </div>
          <div className="divide-y divide-slate-100">
            {users.map((user) => (
              <div key={user.id} className="grid grid-cols-[1.3fr_220px_120px_160px_150px] items-center gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-ink">{user.name || user.email}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <form action={setUserRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <select
                    name="role"
                    defaultValue={user.role}
                    disabled={user.id === admin.id}
                    className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-2 text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <LocalizedOption value={UserRole.USER} en="User" ru="Пользователь" />
                    <LocalizedOption value={UserRole.ADMIN} en="Admin" ru="Администратор" />
                  </select>
                  <button
                    type="submit"
                    disabled={user.id === admin.id}
                    className="rounded border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <I18nText en="Save" ru="Сохранить" />
                  </button>
                </form>
                <span className={user.isActive ? "text-emerald-700" : "text-rose-700"}>
                  {user.isActive ? <I18nText en="Active" ru="Активен" /> : <I18nText en="Inactive" ru="Отключен" />}
                </span>
                <span className="text-slate-500">{user.lastLoginAt ? formatDate(user.lastLoginAt) : <I18nText en="Never" ru="Никогда" />}</span>
                <form action={setUserActiveAction} className="text-right">
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="isActive" value={user.isActive ? "false" : "true"} />
                  <button
                    type="submit"
                    disabled={user.id === admin.id}
                    className="rounded border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {user.isActive ? <I18nText en="Deactivate" ru="Отключить" /> : <I18nText en="Activate" ru="Включить" />}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

async function createUserAction(formData: FormData) {
  "use server";

  await requireAdminUser();

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? UserRole.USER) === UserRole.ADMIN ? UserRole.ADMIN : UserRole.USER;
  const isActive = formData.get("isActive") === "on";

  if (password.length < 8) {
    redirect("/admin/users?error=password_short");
  }

  try {
    await prisma.user.create({
      data: {
        email,
        name,
        role,
        isActive,
        passwordHash: await hashPassword(password)
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect("/admin/users?error=email_exists");
    }
    throw error;
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

async function setUserActiveAction(formData: FormData) {
  "use server";

  const admin = await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";

  if (userId === admin.id) {
    redirect("/admin/users?error=self_deactivate");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { isActive }
    }),
    ...(isActive ? [] : [prisma.userSession.deleteMany({ where: { userId } })])
  ]);

  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

async function setUserRoleAction(formData: FormData) {
  "use server";

  const admin = await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? UserRole.USER) === UserRole.ADMIN ? UserRole.ADMIN : UserRole.USER;

  if (userId === admin.id && role !== UserRole.ADMIN) {
    redirect("/admin/users?error=self_admin_role");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role }
  });

  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

function usersErrorMessage(error: string | undefined) {
  if (!error) return null;
  const labels: Record<string, { en: string; ru: string }> = {
    password_short: { en: "Password must be at least 8 characters.", ru: "Пароль должен быть не короче 8 символов." },
    email_exists: { en: "A user with this email already exists.", ru: "Пользователь с такой почтой уже существует." },
    self_deactivate: { en: "You cannot deactivate your own account.", ru: "Нельзя отключить собственный аккаунт." },
    self_admin_role: { en: "You cannot remove your own admin role.", ru: "Нельзя снять роль администратора с самого себя." }
  };
  return labels[error] ?? { en: error, ru: error };
}
