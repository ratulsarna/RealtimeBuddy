import type { ButtonHTMLAttributes, ReactNode } from "react";

type BadgeTone = "active" | "warning" | "neutral";
type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const inputClass =
  "h-11 w-full rounded-2xl border border-[var(--line)]/70 bg-[var(--surface-input)] px-4 text-sm text-[var(--foreground-strong)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--accent)]/30 focus:bg-[var(--surface-input-focus)] disabled:opacity-50";

export const textareaClass =
  "w-full resize-none rounded-3xl border border-[var(--line)]/70 bg-[var(--surface-input)] px-4 py-3 text-sm leading-6 text-[var(--foreground-strong)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--accent)]/30 focus:bg-[var(--surface-input-focus)] disabled:opacity-50";

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
        "text-[0.68rem] font-medium uppercase tracking-[0.18em] text-[var(--foreground-muted)]",
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
        "text-[0.68rem] font-medium uppercase tracking-[0.18em] text-[var(--foreground-muted)]",
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
        : "bg-[var(--surface-raised-strong)] text-[var(--foreground-muted)] ring-[var(--panel-border)]";

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
      ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-[0_10px_30px_var(--glow)]"
      : variant === "ghost"
        ? "border border-[var(--line)]/70 bg-transparent text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
        : "border border-[var(--line)]/70 bg-[var(--surface-input)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]";

  const sizeClass =
    size === "sm"
      ? "h-9 px-3.5 text-xs rounded-xl"
      : "h-11 px-5 text-sm rounded-2xl";

  return (
    <button
      className={cx(
        "inline-flex items-center justify-center whitespace-nowrap font-medium transition duration-150 disabled:opacity-40 disabled:pointer-events-none",
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
    <div className={cx("w-full overflow-hidden rounded-full bg-[var(--surface-raised-strong)]", compact ? "h-1.5" : "h-2.5")}>
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
        checked ? "bg-[var(--accent)]" : "bg-[var(--surface-raised-strong)]",
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
