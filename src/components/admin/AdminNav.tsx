"use client";

import { ClipboardCheck, DatabaseZap, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { I18nText } from "@/components/i18n-text";
import { cn } from "@/lib/cn";

const adminLinks = [
  {
    href: "/admin/ingestion",
    label: <I18nText en="Ingestion" ru="Загрузка" />,
    description: <I18nText en="Shared FotMob jobs" ru="Общие задачи FotMob" />,
    icon: <DatabaseZap className="h-4 w-4" />
  },
  {
    href: "/admin/users",
    label: <I18nText en="Users" ru="Пользователи" />,
    description: <I18nText en="Accounts and roles" ru="Аккаунты и роли" />,
    icon: <Users className="h-4 w-4" />
  },
  {
    href: "/admin/beta-test",
    label: <I18nText en="Beta test" ru="Beta-тест" />,
    description: <I18nText en="Runs, RUM, and reviews" ru="Прогоны, RUM и review" />,
    icon: <ClipboardCheck className="h-4 w-4" />
  }
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-labelledby="admin-nav-label" className="flex flex-wrap gap-2">
      <span id="admin-nav-label" className="sr-only">
        <I18nText en="Administration" ru="Администрирование" />
      </span>
      {adminLinks.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <AdminNavLink key={link.href} href={link.href} active={active} icon={link.icon} description={link.description}>
            {link.label}
          </AdminNavLink>
        );
      })}
    </nav>
  );
}

function AdminNavLink({
  href,
  active,
  icon,
  description,
  children
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-w-[180px] items-center gap-3 rounded border px-4 py-3 text-sm transition",
        active ? "border-slate-300 bg-white text-ink shadow-soft" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
      )}
    >
      <span className={cn("grid h-9 w-9 place-items-center rounded", active ? "bg-ink text-white" : "bg-white text-slate-500")}>{icon}</span>
      <span>
        <span className="block font-semibold">{children}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
    </Link>
  );
}
