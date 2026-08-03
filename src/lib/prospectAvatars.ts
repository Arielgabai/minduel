/**
 * Catalogue local d'avatars de prospect (lots N1/N2), partagé client + serveur.
 *
 * Contraintes : aucune URL distante, aucun upload, aucun package, aucun base64.
 * Les clés N1 restent stables (persistées dans Scenario.prospectAvatarKey).
 * N2 associe chaque clé à un WebP local sous /avatars/prospects/.
 */

export const PROSPECT_AVATAR_KEYS = [
  "alex",
  "sarah",
  "mathis",
  "lena",
  "karim",
  "chloe",
  "thomas",
  "nadia",
  "julien",
  "ines",
] as const;

export type ProspectAvatarKey = (typeof PROSPECT_AVATAR_KEYS)[number];

export type ProspectAvatarPalette = {
  /** Couleur de départ du dégradé de fond (fallback). */
  from: string;
  /** Couleur d'arrivée du dégradé de fond (fallback). */
  to: string;
  /** Couleur du texte des initiales (contraste suffisant sur le dégradé). */
  fg: string;
};

export type ProspectAvatar = ProspectAvatarPalette & {
  key: ProspectAvatarKey;
  /** Libellé affiché dans l'administration. */
  label: string;
  /** Initiales rendues dans le cercle (1 à 2 caractères). */
  initials: string;
  /** Chemin local public (jamais d'URL distante). */
  src: string;
  /** Ordre déterministe d'affichage (0..9). */
  sortOrder: number;
  /** Disponible dans le sélecteur admin. */
  selectable: boolean;
};

function avatarEntry(
  key: ProspectAvatarKey,
  label: string,
  initials: string,
  index: number,
  from: string,
  to: string,
  fg: string,
): ProspectAvatar {
  const n = String(index + 1).padStart(2, "0");
  return {
    key,
    label,
    initials,
    src: `/avatars/prospects/prospect-${n}.webp`,
    sortOrder: index,
    selectable: true,
    from,
    to,
    fg,
  };
}

export const PROSPECT_AVATARS: readonly ProspectAvatar[] = [
  avatarEntry("alex", "Alex", "AL", 0, "#1e3a8a", "#2563eb", "#eff6ff"),
  avatarEntry("sarah", "Sarah", "SA", 1, "#7c2d12", "#ea580c", "#fff7ed"),
  avatarEntry("mathis", "Mathis", "MA", 2, "#134e4a", "#0d9488", "#f0fdfa"),
  avatarEntry("lena", "Léna", "LE", 3, "#4c1d95", "#7c3aed", "#f5f3ff"),
  avatarEntry("karim", "Karim", "KA", 4, "#164e63", "#0891b2", "#ecfeff"),
  avatarEntry("chloe", "Chloé", "CH", 5, "#831843", "#db2777", "#fdf2f8"),
  avatarEntry("thomas", "Thomas", "TH", 6, "#1f2937", "#4b5563", "#f9fafb"),
  avatarEntry("nadia", "Nadia", "NA", 7, "#3f6212", "#65a30d", "#f7fee7"),
  avatarEntry("julien", "Julien", "JU", 8, "#78350f", "#b45309", "#fffbeb"),
  avatarEntry("ines", "Inès", "IN", 9, "#312e81", "#4f46e5", "#eef2ff"),
];

const AVATAR_BY_KEY = new Map<string, ProspectAvatar>(
  PROSPECT_AVATARS.map((avatar) => [avatar.key, avatar]),
);

/** Garde de type : seule une clé du catalogue peut être persistée. */
export function isProspectAvatarKey(value: unknown): value is ProspectAvatarKey {
  return typeof value === "string" && AVATAR_BY_KEY.has(value);
}

/** Avatar du catalogue, ou null si la clé est absente/inconnue. */
export function getProspectAvatar(
  key: string | null | undefined,
): ProspectAvatar | null {
  if (!key) return null;
  return AVATAR_BY_KEY.get(key) ?? null;
}

/** Chemin local du portrait, ou null si clé absente/inconnue. */
export function getProspectAvatarSrc(
  key: string | null | undefined,
): string | null {
  return getProspectAvatar(key)?.src ?? null;
}

/** Avatars proposés dans le sélecteur admin (ordre déterministe). */
export function listSelectableProspectAvatars(): readonly ProspectAvatar[] {
  return PROSPECT_AVATARS.filter((a) => a.selectable).slice().sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/** Libellé admin lisible, y compris pour l'absence d'avatar. */
export function prospectAvatarLabel(key: string | null | undefined): string {
  return getProspectAvatar(key)?.label ?? "Aucun avatar";
}

/** Palette neutre utilisée quand aucun avatar n'est sélectionné. */
export const PROSPECT_AVATAR_FALLBACK: ProspectAvatarPalette = {
  from: "#334155",
  to: "#64748b",
  fg: "#f8fafc",
};

/**
 * Initiales déterministes (1 à 2 caractères) à partir d'un texte libre.
 * Sert de repli visuel lorsqu'aucun avatar n'est choisi : jamais d'aléatoire,
 * jamais de requête, jamais d'asset externe.
 */
export function initialsFromText(value: string | null | undefined): string {
  const cleaned = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim();
  if (!cleaned) return "?";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
