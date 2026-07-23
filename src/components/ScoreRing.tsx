import { cx } from "@/lib/utils";

/**
 * Jauge circulaire de score avec dégradé bleu → violet → orange,
 * telle que visible sur les écrans d'analyse et de profil des maquettes.
 */
export function ScoreRing({
  score,
  max = 100,
  size = 180,
  stroke = 12,
  label = "/ 100",
  className,
}: {
  score: number;
  max?: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, score / max));
  const dash = circumference * pct;
  const gid = `ring-${size}-${Math.round(score)}`;

  return (
    <div
      className={cx("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          style={{ transition: "stroke-dasharray 0.9s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-white">{Math.round(score)}</span>
        <span className="text-xs text-white/45">{label}</span>
      </div>
    </div>
  );
}

/** Petite variante compacte pour les listes. */
export function MiniScore({ score, size = 64 }: { score: number; size?: number }) {
  return <ScoreRing score={score} size={size} stroke={6} label="/100" />;
}
