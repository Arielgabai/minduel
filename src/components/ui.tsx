import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/utils";

// ---------------- Card ----------------
export function Card({
  children,
  className,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div className={cx("card p-5", hover && "card-hover", className)}>
      {children}
    </div>
  );
}

// ---------------- Button ----------------
type ButtonVariant = "primary" | "flame" | "ghost" | "outline" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "btn-gradient text-white",
  flame: "btn-flame text-white",
  ghost: "bg-white/5 text-white hover:bg-white/10 border border-white/10",
  outline: "bg-transparent text-white border border-violet-500/40 hover:bg-violet-500/10",
  danger: "bg-red-500/90 text-white hover:bg-red-500",
};

export function Button({
  children,
  variant = "primary",
  className,
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  children,
  href,
  variant = "primary",
  className,
}: {
  children: ReactNode;
  href: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition",
        buttonVariants[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

// ---------------- Badge ----------------
export function Badge({
  children,
  tone = "violet",
  className,
}: {
  children: ReactNode;
  tone?: "violet" | "flame" | "blue" | "mint" | "gray" | "red";
  className?: string;
}) {
  const tones: Record<string, string> = {
    violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    flame: "bg-flame-500/15 text-flame-400 border-flame-500/30",
    blue: "bg-electric-500/15 text-electric-400 border-electric-500/30",
    mint: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    gray: "bg-white/5 text-white/60 border-white/10",
    red: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------- Section title ----------------
export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cx(
        "text-xs font-semibold uppercase tracking-[0.28em] text-white/40",
        className,
      )}
    >
      {children}
    </h2>
  );
}

// ---------------- Empty state ----------------
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      {icon && <div className="text-3xl opacity-70">{icon}</div>}
      <p className="text-base font-semibold text-white">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-white/50">{description}</p>
      )}
      {action}
    </div>
  );
}

// ---------------- Stat card ----------------
export function StatCard({
  label,
  value,
  sub,
  accent = "violet",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: "violet" | "flame" | "blue" | "mint";
}) {
  const accents: Record<string, string> = {
    violet: "text-violet-300",
    flame: "text-flame-400",
    blue: "text-electric-400",
    mint: "text-emerald-300",
  };
  return (
    <Card>
      <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
      <p className={cx("mt-2 text-3xl font-bold", accents[accent])}>{value}</p>
      {sub && <p className="mt-1 text-xs text-white/45">{sub}</p>}
    </Card>
  );
}
