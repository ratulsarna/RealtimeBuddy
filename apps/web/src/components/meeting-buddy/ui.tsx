import type { ButtonHTMLAttributes, ReactNode } from "react";

type BadgeTone = "active" | "warning" | "neutral";
type ButtonVariant = "primary" | "secondary" | "ghost";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "mono text-[0.68rem] uppercase tracking-[0.34em] text-[var(--foreground-muted)]",
        className
      )}
    >
      {children}
    </p>
  );
}

export function FieldLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "mono text-[0.62rem] uppercase tracking-[0.32em] text-[var(--foreground-muted)]",
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  children,
  className,
  live = false,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  live?: boolean;
  tone?: BadgeTone;
}) {
  const toneClass =
    tone === "active"
      ? "bg-[var(--accent-soft)]/20 text-[var(--accent-strong)] ring-[rgba(255,145,92,0.28)]"
      : tone === "warning"
        ? "bg-[rgba(255,199,133,0.14)] text-[rgba(255,212,166,0.92)] ring-[rgba(255,199,133,0.24)]"
        : "bg-white/[0.05] text-[var(--foreground-muted)] ring-white/[0.08]";

  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ring-1 backdrop-blur-sm",
        toneClass,
        className
      )}
    >
      {live ? <span className="live-dot" /> : null}
      {children}
    </span>
  );
}

export function ActionButton({
  children,
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  const variantClass =
    variant === "primary"
      ? "bg-[var(--accent)] text-[var(--foreground-strong)] shadow-[0_18px_40px_rgba(255,145,92,0.2)] hover:bg-[var(--accent-strong)]"
      : variant === "ghost"
        ? "border border-white/[0.08] bg-transparent text-[var(--foreground)] hover:bg-white/[0.05]"
        : "border border-white/[0.08] bg-white/[0.04] text-[var(--foreground)] hover:bg-white/[0.08]";

  return (
    <button
      className={cx(
        "inline-flex min-h-12 items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition duration-200 ease-out hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-45",
        variantClass,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function MeterBar({ value }: { value: number }) {
  const width = `${Math.max(0, Math.min(1, value)) * 100}%`;

  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div className="signal-bar h-full rounded-full transition-[width] duration-150" style={{ width }} />
    </div>
  );
}
