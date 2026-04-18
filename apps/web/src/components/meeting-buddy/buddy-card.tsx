"use client";

import { useState, type ReactElement } from "react";

import type { BuddyEvent, BuddyEventType } from "@realtimebuddy/shared/protocol";

import { cx } from "@/components/meeting-buddy/ui";

type BuddyCardProps = {
  event: BuddyEvent;
  nowMs: number;
  canAsk: boolean;
  onAskSuggested: (question: string) => void;
  animate?: boolean;
};

type TypeMeta = {
  label: string;
  tintBorder: string;
  tintBg: string;
  tintText: string;
  dotColor: string;
  icon: (props: { className?: string }) => ReactElement;
};

const TYPE_META: Record<BuddyEventType, TypeMeta> = {
  ask_this: {
    label: "Ask this",
    tintBorder: "border-[rgba(232,128,78,0.28)]",
    tintBg: "bg-[rgba(232,128,78,0.06)]",
    tintText: "text-[var(--accent-text)]",
    dotColor: "bg-[var(--accent)]",
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" />
        <path d="M12 17h.01" />
      </svg>
    ),
  },
  cover_this: {
    label: "Cover this",
    tintBorder: "border-[rgba(255,199,133,0.26)]",
    tintBg: "bg-[rgba(255,199,133,0.06)]",
    tintText: "text-[rgba(255,212,166,0.95)]",
    dotColor: "bg-[rgba(255,199,133,0.85)]",
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <path d="M4 6h16M4 12h10M4 18h16" />
        <path d="M16 10l2 2 4-4" />
      </svg>
    ),
  },
  needs_owner: {
    label: "Needs owner",
    tintBorder: "border-[rgba(255,221,133,0.26)]",
    tintBg: "bg-[rgba(255,221,133,0.06)]",
    tintText: "text-[rgba(255,230,170,0.95)]",
    dotColor: "bg-[rgba(255,221,133,0.85)]",
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <path d="M5 21V4" />
        <path d="M5 4h12l-2 4 2 4H5" />
      </svg>
    ),
  },
  important_signal: {
    label: "Important",
    tintBorder: "border-[rgba(244,114,94,0.34)]",
    tintBg: "bg-[rgba(244,114,94,0.08)]",
    tintText: "text-[rgba(255,170,150,0.95)]",
    dotColor: "bg-[rgba(244,114,94,0.95)]",
    icon: ({ className }) => (
      <svg
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <path d="M12 3l10 18H2L12 3z" />
        <path d="M12 10v5" />
        <path d="M12 18h.01" />
      </svg>
    ),
  },
};

function formatRelative(createdIso: string, nowMs: number): string {
  const then = Date.parse(createdIso);
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const parsed = new Date(then);
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function BuddyCard({
  event,
  nowMs,
  canAsk,
  onAskSuggested,
  animate = true,
}: BuddyCardProps) {
  const meta = TYPE_META[event.type] ?? TYPE_META.ask_this;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!event.suggestedQuestion) return;
    try {
      await navigator.clipboard.writeText(event.suggestedQuestion);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore clipboard failures silently in the demo
    }
  };

  return (
    <article
      className={cx(
        "rounded-xl border px-4 py-3.5 transition",
        meta.tintBorder,
        meta.tintBg,
        animate && "buddy-card-enter"
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <span className={cx("inline-flex items-center gap-1.5", meta.tintText)}>
          <meta.icon className="h-3.5 w-3.5" />
          <span className="mono text-[0.52rem] uppercase tracking-[0.22em]">
            {meta.label}
          </span>
        </span>
        <span className="mono text-[0.52rem] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
          {formatRelative(event.createdAt, nowMs)}
        </span>
      </header>

      <h3 className="display mt-2 text-[1.02rem] font-medium leading-snug tracking-[-0.01em] text-[var(--foreground-strong)]">
        {event.title}
      </h3>

      {event.body ? (
        <p className="mt-1.5 text-[0.82rem] leading-6 text-[var(--foreground)]">
          {event.body}
        </p>
      ) : null}

      {event.suggestedQuestion ? (
        <div className="mt-3 rounded-lg border border-[var(--line)] bg-black/25 px-3 py-2.5">
          <p className="text-[0.82rem] leading-6 text-[var(--foreground-strong)]">
            &ldquo;{event.suggestedQuestion}&rdquo;
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              className={cx(
                "inline-flex h-7 items-center justify-center rounded-md px-2.5 text-[0.72rem] font-medium transition",
                "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-[0_0_12px_var(--glow)]",
                "disabled:opacity-40 disabled:pointer-events-none"
              )}
              disabled={!canAsk}
              onClick={() => onAskSuggested(event.suggestedQuestion as string)}
              type="button"
            >
              Ask it
            </button>
            <button
              className="inline-flex h-7 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 text-[0.72rem] font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]"
              onClick={() => void handleCopy()}
              type="button"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
