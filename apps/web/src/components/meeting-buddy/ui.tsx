import type { ButtonHTMLAttributes, ReactNode } from "react";

type BadgeTone = "active" | "warning" | "neutral";
type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const inputClass =
  "h-9 w-full rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 text-sm text-[var(--foreground-strong)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--accent)]/40 focus:bg-white/[0.04] disabled:opacity-50";

export const textareaClass =
  "w-full resize-none rounded-lg border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm leading-5 text-[var(--foreground-strong)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--accent)]/40 focus:bg-white/[0.04] disabled:opacity-50";

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
        "mono text-[0.62rem] uppercase tracking-[0.24em] text-[var(--foreground-muted)]",
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
        "mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--foreground-muted)]",
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
      ? "bg-[var(--accent-soft)] text-[var(--accent-text)] ring-[var(--accent-soft)]"
      : tone === "warning"
        ? "bg-[rgba(255,199,133,0.1)] text-[rgba(255,212,166,0.88)] ring-[rgba(255,199,133,0.16)]"
        : "bg-white/[0.04] text-[var(--foreground-muted)] ring-white/[0.06]";

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
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
  size = "md",
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  const variantClass =
    variant === "primary"
      ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-[0_0_20px_var(--glow)]"
      : variant === "ghost"
        ? "border border-[var(--line)] bg-transparent text-[var(--foreground)] hover:bg-white/[0.04]"
        : "border border-[var(--line)] bg-white/[0.03] text-[var(--foreground)] hover:bg-white/[0.06]";

  const sizeClass =
    size === "sm"
      ? "h-8 px-3 text-xs rounded-lg"
      : "h-10 px-4 text-sm rounded-xl";

  return (
    <button
      className={cx(
        "inline-flex items-center justify-center font-medium transition duration-150 disabled:opacity-40 disabled:pointer-events-none",
        variantClass,
        sizeClass,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function MeterBar({ value, compact }: { value: number; compact?: boolean }) {
  const width = `${Math.max(0, Math.min(1, value)) * 100}%`;

  return (
    <div className={cx("w-full overflow-hidden rounded-full bg-white/[0.06]", compact ? "h-1.5" : "h-2.5")}>
      <div
        className="signal-bar h-full rounded-full transition-[width] duration-150"
        style={{ width }}
      />
    </div>
  );
}

export function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      className={cx(
        "relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-[var(--accent)]" : "bg-white/[0.1]",
        disabled && "opacity-40 pointer-events-none"
      )}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={cx(
          "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked && "translate-x-4"
        )}
      />
    </button>
  );
}
