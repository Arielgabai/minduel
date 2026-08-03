"use client";

import { useState } from "react";
import { cx } from "@/lib/utils";
import {
  PROSPECT_AVATAR_FALLBACK,
  getProspectAvatar,
  initialsFromText,
  prospectAvatarLabel,
} from "@/lib/prospectAvatars";

export type ProspectAvatarRing =
  | "none"
  | "completed"
  | "recommended"
  | "locked";

/**
 * Avatar de prospect : WebP local + fallback déterministe (dégradé + initiales).
 * Aucun asset distant, aucun dangerouslySetInnerHTML.
 */
export function ProspectAvatar({
  avatarKey,
  fallbackText,
  size = 40,
  decorative = true,
  ring = "none",
  className,
}: {
  avatarKey?: string | null;
  fallbackText?: string | null;
  size?: number;
  decorative?: boolean;
  ring?: ProspectAvatarRing;
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
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(avatar?.src) && !broken;

  const ringClass =
    ring === "completed"
      ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-ink-950"
      : ring === "recommended"
        ? "ring-2 ring-violet-400 ring-offset-2 ring-offset-ink-950"
        : ring === "locked"
          ? "ring-2 ring-dashed ring-white/25 ring-offset-2 ring-offset-ink-950 opacity-55"
          : "";

  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 font-semibold leading-none",
        ringClass,
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        color: palette.fg,
        backgroundImage: showImage
          ? undefined
          : `linear-gradient(135deg, ${palette.from}, ${palette.to})`,
        backgroundColor: showImage ? "#0f172a" : undefined,
      }}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label })}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- assets locaux /public uniquement
        <img
          src={avatar!.src}
          alt=""
          width={size}
          height={size}
          draggable={false}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
