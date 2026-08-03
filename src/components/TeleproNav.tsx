"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";
import {
  TELEPRO_NAV_ITEMS,
  isTeleproNavActive,
  shouldShowTeleproNav,
} from "@/lib/teleproNav";

const ICONS = {
  home: HomeIcon,
  missions: MissionsIcon,
  skills: SkillsIcon,
  progression: ProgressionIcon,
  profile: UserIcon,
} as const;

export function TeleproNav() {
  const pathname = usePathname();
  if (!shouldShowTeleproNav(pathname)) return null;

  return (
    <nav
      className="z-40 flex-shrink-0 border-t border-white/10 bg-ink-900/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigation principale"
    >
      <ul className="flex items-stretch justify-around gap-0.5 px-1 py-1 sm:px-2">
        {TELEPRO_NAV_ITEMS.map((it) => {
          const active = isTeleproNavActive(it.href, pathname);
          const Icon = ICONS[it.id];
          return (
            <li key={it.href} className="min-w-0 flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[0.65rem] transition sm:text-xs",
                  active
                    ? "text-electric-400"
                    : "text-white/45 hover:text-white/70 focus-visible:text-white/80",
                )}
              >
                <Icon active={active} />
                <span className="max-w-full truncate">{it.label}</span>
                <span
                  className={cx(
                    "h-0.5 w-5 rounded-full",
                    active ? "bg-electric-400" : "bg-transparent",
                  )}
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} aria-hidden>
      <path d="M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MissionsIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h14" strokeLinecap="round" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  );
}

function SkillsIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} aria-hidden>
      <path d="M12 3v18M8 7h8M7 12h10M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProgressionIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} aria-hidden>
      <path d="M4 19V5M4 19h16" strokeLinecap="round" />
      <path d="M8 15v-3M12 15V9M16 15v-6" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
    </svg>
  );
}
