import { Prisma, UserFranchise, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/AdminNav";
import { I18nText } from "@/components/i18n-text";
import { LocalizedOption } from "@/components/localized-option";
import { hashPassword, normalizeEmail, requireAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { normalizeSportsRuProfileId } from "@/lib/providers/sports-ru-fantasy";

const sportsRuProvider = "SPORTS_RU";
const sportsRuProfilePlaceholder = "https://www.sports.ru/profile/123456/";

type PageProps = {
  searchParams?: Promise<{ error?: string; saved?: string }>;
};

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const admin = await requireAdminUser();
  const params = (await searchParams) ?? {};
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      franchise: true,
      isActive: true,
      lastLoginAt: true,
      externalProfiles: {
        where: { provider: sportsRuProvider },
        select: { profileUrl: true }
      }
    }
  });
  const errorMessage = usersErrorMessage(params.error);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 2xl:max-w-[1600px] 3xl:max-w-[1760px]">
      <AdminNav />
      <div className="mt-6">
        <p className="kicker"><I18nText en="Administration" ru="Администрирование" /></p>
        <h1 className="mt-2 text-3xl font-bold text-ink"><I18nText en="Users" ru="Пользователи" /></h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          <I18nText en="Create accounts, assign a franchise, change roles, and disable access without deleting history." ru="Создавайте аккаунты, назначайте франшизу, меняйте роли и отключайте доступ без удаления истории." />
        </p>
      </div>

      {errorMessage ? <p className="mt-6 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700"><I18nText en={errorMessage.en} ru={errorMessage.ru} /></p> : null}
      {params.saved ? <p className="mt-6 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><I18nText en="Changes saved." ru="Изменения сохранены." /></p> : null}

      <section className="mt-8 grid gap-8 lg:grid-cols-[360px_1fr]">
        <form action={createUserAction} className="self-start rounded border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-ink"><I18nText en="Create account" ru="Создать аккаунт" /></h2>
          <div className="mt-4 space-y-4">
            <Field label={<I18nText en="Name" ru="Имя" />}><input name="name" className={inputClassName} /></Field>
            <Field label={<I18nText en="Email" ru="Почта" />}><input required name="email" type="email" className={inputClassName} /></Field>
            <Field label={<I18nText en="Password" ru="Пароль" />}><input required name="password" type="password" minLength={8} className={inputClassName} /></Field>
            <Field label={<I18nText en="Role" ru="Роль" />}>
              <select name="role" defaultValue={UserRole.USER} className={inputClassName}>
                <LocalizedOption value={UserRole.USER} en="User" ru="Пользователь" />
                <LocalizedOption value={UserRole.ADMIN} en="Admin" ru="Администратор" />
              </select>
            </Field>
            <Field label={<I18nText en="Franchise" ru="Франшиза" />}>
              <select required name="franchise" defaultValue={UserFranchise.MACHETE} className={inputClassName}>
                <LocalizedOption value={UserFranchise.MACHETE} en="Machete" ru="Мачете" />
                <LocalizedOption value={UserFranchise.BALTIKA} en="Baltika" ru="Балтика" />
              </select>
            </Field>
            <Field label={<I18nText en="Sports.ru profile" ru="Профиль Sports.ru" />}>
              <input name="sportsRuProfile" type="url" placeholder={sportsRuProfilePlaceholder} className={inputClassName} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input name="isActive" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              <I18nText en="Active" ru="Активен" />
            </label>
            <button type="submit" className="ui-button ui-button-primary w-full">
              <I18nText en="Create user" ru="Создать пользователя" />
            </button>
          </div>
        </form>

        <section className="overflow-x-auto rounded border border-slate-200 bg-white shadow-sm">
          <div className={`${userGridClassName} border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500`}>
            <span><I18nText en="User" ru="Пользователь" /></span>
            <span><I18nText en="Role" ru="Роль" /></span>
            <span><I18nText en="Franchise" ru="Франшиза" /></span>
            <span><I18nText en="Sports.ru profile" ru="Профиль Sports.ru" /></span>
            <span><I18nText en="Status" ru="Статус" /></span>
            <span><I18nText en="Last login" ru="Последний вход" /></span>
            <span className="text-right"><I18nText en="Action" ru="Действие" /></span>
          </div>
          <div className="divide-y divide-slate-100">
            {users.map((user) => (
              <div key={user.id} className={`${userGridClassName} items-center px-4 py-3 text-sm`}>
                <div>
                  <p className="font-semibold text-ink">{user.name || user.email}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <form action={setUserRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <select name="role" defaultValue={user.role} disabled={user.id === admin.id} className={inlineSelectClassName}>
                    <LocalizedOption value={UserRole.USER} en="User" ru="Пользователь" />
                    <LocalizedOption value={UserRole.ADMIN} en="Admin" ru="Администратор" />
                  </select>
                  <SaveButton disabled={user.id === admin.id} />
                </form>
                <form action={setUserFranchiseAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <select required name="franchise" defaultValue={user.franchise ?? ""} className={inlineSelectClassName}>
                    <LocalizedOption disabled value="" en="Not assigned" ru="Не назначена" />
                    <LocalizedOption value={UserFranchise.MACHETE} en="Machete" ru="Мачете" />
                    <LocalizedOption value={UserFranchise.BALTIKA} en="Baltika" ru="Балтика" />
                  </select>
                  <SaveButton />
                </form>
                <form action={setUserSportsRuProfileAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <input
                    name="sportsRuProfile"
                    type="url"
                    defaultValue={user.externalProfiles[0]?.profileUrl ?? ""}
                    placeholder={sportsRuProfilePlaceholder}
                    aria-label={`Sports.ru profile for ${user.name || user.email}`}
                    className={inlineInputClassName}
                  />
                  <SaveButton />
                </form>
                <span className={user.isActive ? "text-emerald-700" : "text-rose-700"}>
                  {user.isActive ? <I18nText en="Active" ru="Активен" /> : <I18nText en="Inactive" ru="Отключён" />}
                </span>
                <span className="text-slate-500">{user.lastLoginAt ? formatDate(user.lastLoginAt) : <I18nText en="Never" ru="Никогда" />}</span>
                <form action={setUserActiveAction} className="text-right">
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="isActive" value={user.isActive ? "false" : "true"} />
                  <button type="submit" disabled={user.id === admin.id} className={buttonClassName}>
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

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span>{children}</label>;
}

function SaveButton({ disabled = false }: { disabled?: boolean }) {
  return <button type="submit" disabled={disabled} className={buttonClassName}><I18nText en="Save" ru="Сохранить" /></button>;
}

const inputClassName = "mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400";
const inlineSelectClassName = "min-w-0 flex-1 rounded border border-slate-200 px-2 py-2 text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";
const inlineInputClassName = "min-w-0 flex-1 rounded border border-slate-200 px-2 py-2 text-sm outline-none focus:border-slate-400";
const buttonClassName = "rounded border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45";
const userGridClassName = "grid min-w-[1530px] grid-cols-[1.3fr_220px_220px_380px_120px_160px_150px] gap-3";

async function createUserAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? UserRole.USER) === UserRole.ADMIN ? UserRole.ADMIN : UserRole.USER;
  const franchise = parseUserFranchise(formData.get("franchise"));
  const sportsRuProfile = String(formData.get("sportsRuProfile") ?? "").trim();
  const sportsRuProfileId = sportsRuProfile ? normalizeSportsRuProfileId(sportsRuProfile) : null;
  const isActive = formData.get("isActive") === "on";
  if (password.length < 8) redirect("/admin/users?error=password_short");
  if (!franchise) redirect("/admin/users?error=franchise_required");
  if (sportsRuProfile && !sportsRuProfileId) redirect("/admin/users?error=sports_profile_invalid");

  try {
    await prisma.user.create({
      data: {
        email,
        name,
        role,
        franchise,
        isActive,
        passwordHash: await hashPassword(password),
        ...(sportsRuProfileId ? {
          externalProfiles: {
            create: {
              provider: sportsRuProvider,
              providerUserId: sportsRuProfileId,
              profileUrl: sportsRuProfileUrl(sportsRuProfileId)
            }
          }
        } : {})
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") redirect("/admin/users?error=email_exists");
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
  if (userId === admin.id) redirect("/admin/users?error=self_deactivate");
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { isActive } }),
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
  if (userId === admin.id && role !== UserRole.ADMIN) redirect("/admin/users?error=self_admin_role");
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
  redirect("/admin/users?saved=1");
}

async function setUserFranchiseAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");
  const franchise = parseUserFranchise(formData.get("franchise"));
  if (!franchise) redirect("/admin/users?error=franchise_required");
  await prisma.user.update({ where: { id: userId }, data: { franchise } });
  revalidatePath("/admin/users");
  revalidatePath("/admin/franchise-squads");
  revalidatePath("/machete/franchise-squads");
  redirect("/admin/users?saved=1");
}

async function setUserSportsRuProfileAction(formData: FormData) {
  "use server";
  await requireAdminUser();
  const userId = String(formData.get("userId") ?? "");
  const rawProfile = String(formData.get("sportsRuProfile") ?? "").trim();

  if (!rawProfile) {
    await prisma.userExternalProfile.deleteMany({ where: { userId, provider: sportsRuProvider } });
  } else {
    const profileId = normalizeSportsRuProfileId(rawProfile);
    if (!profileId) redirect("/admin/users?error=sports_profile_invalid");
    await prisma.userExternalProfile.upsert({
      where: { userId_provider: { userId, provider: sportsRuProvider } },
      update: { providerUserId: profileId, profileUrl: sportsRuProfileUrl(profileId), lastError: null },
      create: { userId, provider: sportsRuProvider, providerUserId: profileId, profileUrl: sportsRuProfileUrl(profileId) }
    });
  }

  revalidatePath("/admin/users");
  revalidatePath("/profile");
  redirect("/admin/users?saved=1");
}

function sportsRuProfileUrl(profileId: string) {
  return `https://www.sports.ru/profile/${profileId}/`;
}

function parseUserFranchise(value: FormDataEntryValue | null) {
  if (value === UserFranchise.MACHETE) return UserFranchise.MACHETE;
  if (value === UserFranchise.BALTIKA) return UserFranchise.BALTIKA;
  return null;
}

function usersErrorMessage(error: string | undefined) {
  if (!error) return null;
  const labels: Record<string, { en: string; ru: string }> = {
    password_short: { en: "Password must be at least 8 characters.", ru: "Пароль должен быть не короче 8 символов." },
    franchise_required: { en: "Choose Machete or Baltika.", ru: "Выберите франшизу: Мачете или Балтика." },
    email_exists: { en: "A user with this email already exists.", ru: "Пользователь с такой почтой уже существует." },
    self_deactivate: { en: "You cannot deactivate your own account.", ru: "Нельзя отключить собственный аккаунт." },
    self_admin_role: { en: "You cannot remove your own admin role.", ru: "Нельзя снять роль администратора с самого себя." },
    sports_profile_invalid: { en: "Enter a valid sports.ru/profile/<id> link.", ru: "Введите корректную ссылку sports.ru/profile/<id>." }
  };
  return labels[error] ?? { en: error, ru: error };
}
