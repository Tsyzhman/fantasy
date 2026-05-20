"use client";

import { DatabaseZap, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const adminLinks = [
  {
    href: "/admin/ingestion",
    label: "Ingestion",
    description: "Shared FotMob jobs",
    icon: <DatabaseZap className="h-4 w-4" />
  },
  {
    href: "/admin/users",
    label: "Users",
    description: "Accounts and roles",
    icon: <Users className="h-4 w-4" />
  }
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Administration" className="flex flex-wrap gap-2">
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
  description: string;
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
