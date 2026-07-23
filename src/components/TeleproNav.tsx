"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";

const items = [
  { href: "/app", label: "Accueil", icon: HomeIcon },
  { href: "/app/history", label: "Historique", icon: ClockIcon },
  { href: "/app/profile", label: "Profil", icon: UserIcon },
];

export function TeleproNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-900/90 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-around px-4 py-2">
        {items.map((it) => {
          const active = pathname === it.href;
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cx(
                "flex flex-col items-center gap-1 rounded-lg px-4 py-1.5 text-xs transition",
                active ? "text-violet-300" : "text-white/45 hover:text-white/70",
              )}
            >
              <Icon active={active} />
              <span>{it.label}</span>
              {active && <span className="h-0.5 w-6 rounded-full bg-violet-400" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ClockIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function UserIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
    </svg>
  );
}
