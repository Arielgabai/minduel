import { cx } from "@/lib/utils";

/**
 * Logo MINDUEL — un « M » stylisé (deux profils/visages formant le M),
 * inspiré des maquettes : dégradé bleu → violet → orange.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mduel-g" x1="0" y1="0" x2="64" y2="64">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="45%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      {/* Deux montants du M évoquant deux profils face à face */}
      <path
        d="M8 54V12c0-1.1.9-2 2-2h6.5c.7 0 1.4.4 1.7 1L32 36 45.8 11c.3-.6 1-1 1.7-1H54c1.1 0 2 .9 2 2v42c0 1.1-.9 2-2 2h-7V27L34 50.5c-.4.7-1.1 1.1-2 1.1s-1.6-.4-2-1.1L17 27v27h-7c-1.1 0-2-.9-2-2Z"
        fill="url(#mduel-g)"
      />
      <circle cx="21.5" cy="22" r="2.2" fill="#0a0b1a" opacity="0.85" />
      <circle cx="42.5" cy="22" r="2.2" fill="#0a0b1a" opacity="0.85" />
    </svg>
  );
}

export function Logo({
  size = 40,
  showTagline = true,
  className,
}: {
  size?: number;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center gap-1", className)}>
      <div className="flex items-center gap-2">
        <LogoMark size={size} />
        <span
          className="font-bold tracking-[0.18em]"
          style={{ fontSize: size * 0.52 }}
        >
          MIN<span className="text-gradient">DUEL</span>
        </span>
      </div>
      {showTagline && (
        <span className="text-[0.6rem] tracking-[0.32em] text-white/45 uppercase">
          Chaque conversation est un duel
        </span>
      )}
    </div>
  );
}
