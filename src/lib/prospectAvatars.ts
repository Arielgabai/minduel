/**
 * Catalogue local d'avatars de prospect (lot N1), partagé client + serveur.
 *
 * Contraintes volontaires : aucune URL distante, aucune image téléchargée,
 * aucun upload, aucun package. La prévisualisation est rendue en CSS à partir
 * d'initiales et d'une palette locale, donc aucun asset ne peut manquer.
 * Les portraits illustrés définitifs arriveront au lot N2 : les clés ci-dessous
 * sont stables et ne doivent pas être renommées (elles sont persistées dans
 * Scenario.prospectAvatarKey).
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
  /** Couleur de départ du dégradé de fond. */
  from: string;
  /** Couleur d'arrivée du dégradé de fond. */
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
};

export const PROSPECT_AVATARS: readonly ProspectAvatar[] = [
  { key: "alex", label: "Alex", initials: "AL", from: "#1e3a8a", to: "#2563eb", fg: "#eff6ff" },
  { key: "sarah", label: "Sarah", initials: "SA", from: "#7c2d12", to: "#ea580c", fg: "#fff7ed" },
  { key: "mathis", label: "Mathis", initials: "MA", from: "#134e4a", to: "#0d9488", fg: "#f0fdfa" },
  { key: "lena", label: "Léna", initials: "LE", from: "#4c1d95", to: "#7c3aed", fg: "#f5f3ff" },
  { key: "karim", label: "Karim", initials: "KA", from: "#164e63", to: "#0891b2", fg: "#ecfeff" },
  { key: "chloe", label: "Chloé", initials: "CH", from: "#831843", to: "#db2777", fg: "#fdf2f8" },
  { key: "thomas", label: "Thomas", initials: "TH", from: "#1f2937", to: "#4b5563", fg: "#f9fafb" },
  { key: "nadia", label: "Nadia", initials: "NA", from: "#3f6212", to: "#65a30d", fg: "#f7fee7" },
  { key: "julien", label: "Julien", initials: "JU", from: "#78350f", to: "#b45309", fg: "#fffbeb" },
  { key: "ines", label: "Inès", initials: "IN", from: "#312e81", to: "#4f46e5", fg: "#eef2ff" },
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
