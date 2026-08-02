/**
 * Configuration et helpers purs pour la navigation téléprospecteur (shell 5 destinations).
 * Aucune dépendance React — testable sans rendu.
 */

export type TeleproNavItem = {
  href: string;
  label: string;
  /** Identifiant stable pour tests / icônes. */
  id: "home" | "missions" | "skills" | "progression" | "profile";
};

/** Cinq destinations de la tab-bar (DESIGN_SPEC). */
export const TELEPRO_NAV_ITEMS: readonly TeleproNavItem[] = [
  { id: "home", href: "/app", label: "Accueil" },
  { id: "missions", href: "/app/missions", label: "Missions" },
  { id: "skills", href: "/app/skills", label: "Skills" },
  { id: "progression", href: "/app/progression", label: "Progression" },
  { id: "profile", href: "/app/profile", label: "Profil" },
] as const;

/** Ancienne URL d'historique — compatibilité. */
export const TELEPRO_HISTORY_PATH = "/app/history";

/** Redirection canonique de l'historique. */
export const TELEPRO_HISTORY_REDIRECT = "/app/progression";

/**
 * Routes spécialisées hors tab-bar : préparation, appel, débrief.
 * Le shell conserve l'auth mais masque la navigation basse.
 */
export function shouldShowTeleproNav(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/app/prepare")) return false;
  if (pathname.startsWith("/app/call")) return false;
  if (pathname.startsWith("/app/analysis")) return false;
  return true;
}

/**
 * Détermine si un onglet est actif pour le pathname courant.
 * Accueil = correspondance exacte ; autres = préfixe ; /app/history → Progression.
 */
export function isTeleproNavActive(
  href: string,
  pathname: string | null | undefined,
): boolean {
  if (!pathname) return false;

  const normalized =
    pathname === TELEPRO_HISTORY_PATH || pathname.startsWith(`${TELEPRO_HISTORY_PATH}/`)
      ? TELEPRO_HISTORY_REDIRECT
      : pathname;

  if (href === "/app") {
    return normalized === "/app";
  }

  return normalized === href || normalized.startsWith(`${href}/`);
}

/** Labels des destinations — utile pour assertions de couverture. */
export function teleproNavLabels(): string[] {
  return TELEPRO_NAV_ITEMS.map((i) => i.label);
}

/** Hrefs des destinations. */
export function teleproNavHrefs(): string[] {
  return TELEPRO_NAV_ITEMS.map((i) => i.href);
}
