"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";
import { LogoMark } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";

const items = [
  { href: "/manager", label: "Tableau de bord", icon: "▤" },
  { href: "/manager/team", label: "Équipe", icon: "👥" },
  { href: "/manager/recordings", label: "Appels modèles", icon: "🎧" },
  { href: "/manager/knowledge", label: "Connaissances", icon: "🧠" },
  { href: "/manager/scenarios", label: "Scénarios", icon: "🎭" },
  { href: "/manager/results", label: "Résultats", icon: "📊" },
];

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
      <Link href="/manager" className="mb-8 flex items-center gap-2">
        <LogoMark size={34} />
        <span className="font-bold tracking-[0.15em]">
          MIN<span className="text-gradient">DUEL</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-1">
        {showAdminLink && (
          <Link
            href="/admin/exercises"
            className={cx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
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
          const active =
            it.href === "/manager"
              ? pathname === "/manager"
              : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-violet-500/15 text-white border border-violet-500/30"
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
      <Link href="/manager" className="flex min-w-0 items-center gap-2">
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
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-white/10 bg-ink-900/90 px-2 py-2 backdrop-blur lg:hidden">
      {items.map((it) => {
        const active =
          it.href === "/manager"
            ? pathname === "/manager"
            : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cx(
              "flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[0.65rem]",
              active ? "text-violet-300" : "text-white/45",
            )}
          >
            <span className="text-base">{it.icon}</span>
            {it.label.split(" ")[0]}
          </Link>
        );
      })}
    </nav>
  );
}
