"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TeleproNav } from "@/components/TeleproNav";
import { shouldShowTeleproNav } from "@/lib/teleproNav";
import { cx } from "@/lib/utils";

/**
 * Shell téléprospecteur : cadre mobile 480 px.
 * Nav basse persistante hors de la zone scrollable (pas de sticky après contenu).
 * Préparation / appel / débrief : shell sans tab-bar (parcours immersif).
 */
export function TeleproShell({
  demoBanner,
  children,
}: {
  demoBanner?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const showNav = shouldShowTeleproNav(pathname);

  return (
    <div className="h-[100dvh] w-full overflow-hidden md:py-6">
      <div
        className={cx(
          "relative mx-auto flex h-full max-h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden",
          "md:max-h-[calc(100dvh-3rem)] md:rounded-[28px] md:border md:border-[#1b1e28] md:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)]",
          "bg-ink-950/40",
        )}
      >
        {demoBanner}
        <main
          className={cx(
            "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-6",
            showNav ? "pb-4" : "pb-8",
          )}
        >
          {children}
        </main>
        {showNav ? <TeleproNav /> : null}
      </div>
    </div>
  );
}
