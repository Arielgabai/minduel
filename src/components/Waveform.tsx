"use client";

import { cx } from "@/lib/utils";

/**
 * Waveform animée (barres). Peut être statique (décorative) ou "active"
 * (animée en continu). Réagit visuellement à l'état de l'appel.
 * Dégradé bleu (gauche) → violet → orange (droite) comme sur les maquettes.
 */
export function Waveform({
  bars = 40,
  active = false,
  intensity = 1,
  className,
}: {
  bars?: number;
  active?: boolean;
  intensity?: number;
  className?: string;
}) {
  const items = Array.from({ length: bars });
  return (
    <div
      className={cx("flex items-center justify-center gap-[3px]", className)}
      aria-hidden="true"
    >
      {items.map((_, i) => {
        // Hauteur de base en forme de cloche pour un rendu naturel.
        const center = bars / 2;
        const dist = Math.abs(i - center) / center;
        const base = (1 - dist * 0.7) * 100 * intensity;
        const hue =
          i / bars < 0.4 ? "#3b82f6" : i / bars < 0.7 ? "#8b5cf6" : "#f97316";
        const delay = (i % 8) * 0.09;
        return (
          <span
            key={i}
            className={cx("w-[3px] rounded-full", active && "animate-[wave_1s_ease-in-out_infinite]")}
            style={{
              height: `${Math.max(8, base)}%`,
              background: hue,
              opacity: active ? 0.9 : 0.4,
              animationDelay: `${delay}s`,
              transformOrigin: "center",
            }}
          />
        );
      })}
    </div>
  );
}
