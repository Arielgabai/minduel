import { cx } from "@/lib/utils";
import {
  PROSPECT_AVATAR_FALLBACK,
  getProspectAvatar,
  initialsFromText,
  prospectAvatarLabel,
} from "@/lib/prospectAvatars";

/**
 * Avatar de prospect : cercle rendu localement (dégradé CSS + initiales).
 * Aucun asset distant, aucun dangerouslySetInnerHTML.
 *
 * - `avatarKey` nullable : repli déterministe sur les initiales de `fallbackText`.
 * - `decorative` (défaut) : aria-hidden, l'information est portée par le texte voisin.
 * - `decorative={false}` : role="img" + aria-label explicite.
 */
export function ProspectAvatar({
  avatarKey,
  fallbackText,
  size = 40,
  decorative = true,
  className,
}: {
  avatarKey?: string | null;
  fallbackText?: string | null;
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  const avatar = getProspectAvatar(avatarKey);
  const palette = avatar ?? PROSPECT_AVATAR_FALLBACK;
  const initials = avatar ? avatar.initials : initialsFromText(fallbackText);
  const label = avatar
    ? prospectAvatarLabel(avatar.key)
    : fallbackText
      ? `Aucun avatar (${fallbackText})`
      : "Aucun avatar";

  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-white/15 font-semibold leading-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        color: palette.fg,
        backgroundImage: `linear-gradient(135deg, ${palette.from}, ${palette.to})`,
      }}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label })}
    >
      {initials}
    </span>
  );
}
