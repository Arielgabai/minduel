"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";
import { LogoMark } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";

const items = [
  { href: "/manager/exercises", label: "Exercices", icon: "🎭" },
  { href: "/manager/team", label: "Équipe", icon: "👥" },
  { href: "/manager/results", label: "Résultats", icon: "📊" },
];

function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function ManagerNav({
  orgName,
  userName,
  showAdminLink = false,
}: {
  orgName: string;
  userName: string;
  showAdminLink?: boolean;
}) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-ink-900/80 p-5 backdrop-blur lg:flex">
      <Link href="/manager/exercises" className="mb-8 flex items-center gap-2">
        <LogoMark size={34} />
        <span className="font-bold tracking-[0.15em]">
          MIN<span className="text-gradient">DUEL</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-1" aria-label="Navigation manager">
        {showAdminLink && (
          <Link
            href="/admin/exercises"
            className={cx(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400",
              pathname.startsWith("/admin")
                ? "border border-electric-500/30 bg-electric-500/15 text-white"
                : "text-white/55 hover:bg-white/5 hover:text-white/80",
            )}
          >
            <span className="w-5 text-center">⚙️</span>
            Administration
          </Link>
        )}
        {items.map((it) => {
          const active = isNavActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400",
                active
                  ? "border border-violet-500/30 bg-violet-500/15 text-white"
                  : "text-white/55 hover:bg-white/5 hover:text-white/80",
              )}
            >
              <span className="w-5 text-center">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="truncate text-sm font-semibold text-white">{userName}</p>
        <p className="mb-3 truncate text-xs text-white/45">{orgName}</p>
        <LogoutButton className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 hover:bg-white/10" />
      </div>
    </aside>
  );
}

export function ManagerMobileHeader({ userName }: { userName: string }) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/10 bg-ink-900/90 px-4 py-3 backdrop-blur lg:hidden">
      <Link href="/manager/exercises" className="flex min-w-0 items-center gap-2">
        <LogoMark size={28} />
        <span className="truncate text-sm font-bold tracking-[0.15em]">
          MIN<span className="text-gradient">DUEL</span>
        </span>
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden max-w-[8rem] truncate text-xs text-white/45 sm:inline">
          {userName}
        </span>
        <LogoutButton className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10" />
      </div>
    </header>
  );
}

export function ManagerMobileNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around overflow-x-hidden border-t border-white/10 bg-ink-900/90 px-2 py-2 backdrop-blur lg:hidden"
      aria-label="Navigation manager"
    >
      {items.map((it) => {
        const active = isNavActive(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-h-11 min-w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[0.65rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400",
              active ? "text-violet-300" : "text-white/45",
            )}
          >
            <span className="text-base">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
