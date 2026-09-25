import { I18nText } from "@/components/i18n-text";
import { FplProfileSettings } from "@/components/fpl-profile-settings";
import { SportsRuProfileSettings } from "@/components/sports-ru-profile-settings";
import { TelegramSettings } from "@/components/telegram-settings";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { telegramLinkEnabled } from "@/server/telegram/config";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireCurrentUser();
  const sportsProfile = await prisma.userExternalProfile.findUnique({
    where: { userId_provider: { userId: user.id, provider: "SPORTS_RU" } }
  });
  const fplProfile = await prisma.userExternalProfile.findUnique({
    where: { userId_provider: { userId: user.id, provider: "FPL" } }
  });
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <p className="kicker"><I18nText en="Account" ru="Аккаунт" /></p>
      <h1 className="mt-1 text-[clamp(24px,2.6vw,32px)] font-bold leading-[1.08] tracking-[-0.03em] text-ink"><I18nText en="Profile" ru="Профиль" /></h1>
      <p className="mt-1 text-sm text-slate-500">{user.name ?? user.email}</p>
      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold text-ink"><I18nText en="Fantasy data sources" ru="Источники фэнтези-данных" /></h2>
        <SportsRuProfileSettings initialValue={sportsProfile?.profileUrl ?? ""} />
        <div className="mt-4">
          <FplProfileSettings initialValue={fplProfile?.providerUserId ?? ""} />
        </div>
      </section>
      {telegramLinkEnabled() ? (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold text-ink"><I18nText en="Deadline notifications" ru="Уведомления перед дедлайном" /></h2>
          <TelegramSettings />
        </section>
      ) : null}
    </main>
  );
}
