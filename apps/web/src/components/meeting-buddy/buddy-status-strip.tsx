"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "@/components/meeting-buddy/ui";

export type BuddyState =
  | "idle"
  | "warming"
  | "listening"
  | "noticing"
  | "nudging"
  | "paused"
  | "wrapup";

type BuddyStatusStripProps = {
  state: BuddyState;
  eventCount: number;
  staticUserSeed: string;
  meetingSeed: string;
};

const LABELS: Record<BuddyState, { title: string; hint: string }> = {
  idle: { title: "Standing by", hint: "Start a session to bring Buddy in." },
  warming: { title: "Warming up", hint: "Getting mic and model ready..." },
  listening: { title: "Listening", hint: "Buddy is on — quiet until something matters." },
  noticing: { title: "Noticing", hint: "Tracking the conversation, nothing urgent yet." },
  nudging: { title: "Nudging", hint: "Buddy has something for you." },
  paused: { title: "Paused", hint: "Capture is paused. Resume when ready." },
  wrapup: { title: "Wrap-up", hint: "Session over — here's what Buddy noticed." },
};

function useClickOutside<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

export function BuddyStatusStrip({
  state,
  eventCount,
  staticUserSeed,
  meetingSeed,
}: BuddyStatusStripProps) {
  const [briefOpen, setBriefOpen] = useState(false);
  const popoverRef = useClickOutside<HTMLDivElement>(() => setBriefOpen(false));

  const { title, hint } = LABELS[state];
  const hasBrief = Boolean(meetingSeed.trim() || staticUserSeed.trim());

  const dotClass =
    state === "nudging"
      ? "bg-[var(--accent)] buddy-pulse-ring"
      : state === "listening" || state === "noticing"
        ? "bg-[var(--accent)] live-dot"
        : state === "paused"
          ? "bg-[rgba(255,199,133,0.85)]"
          : state === "wrapup"
            ? "bg-[var(--foreground-muted)]"
            : "bg-[var(--foreground-muted)]";

  const titleClass =
    state === "nudging" || state === "listening" || state === "noticing"
      ? "text-[var(--foreground-strong)]"
      : "text-[var(--foreground)]";

  return (
    <div className="relative flex items-center justify-between gap-3 rounded-xl border border-[var(--panel-border)] bg-[var(--surface-raised)] px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          <span className={cx("h-2 w-2 rounded-full", dotClass)} />
        </span>
        <div className="min-w-0">
          <p className={cx("text-sm font-semibold leading-tight", titleClass)}>{title}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--foreground-muted)]">{hint}</p>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {eventCount > 0 ? (
          <span className="mono inline-flex h-6 items-center rounded-full bg-[var(--surface-raised-strong)] px-2 text-[0.6rem] uppercase tracking-[0.18em] text-[var(--foreground)]">
            {eventCount} card{eventCount === 1 ? "" : "s"}
          </span>
        ) : null}

        {hasBrief ? (
          <button
            className={cx(
              "inline-flex h-6 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-input)] px-2.5 text-[0.6rem] uppercase tracking-[0.18em] text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]",
              briefOpen && "bg-[var(--surface-raised-strong)]"
            )}
            onClick={() => setBriefOpen((prev) => !prev)}
            type="button"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path d="M4 5h16M4 10h16M4 15h10" />
            </svg>
            Brief
          </button>
        ) : null}
      </div>

      {briefOpen && hasBrief ? (
        <div
          ref={popoverRef}
          className="slide-in-right absolute right-2 top-[calc(100%+0.35rem)] z-20 w-80 rounded-xl border border-[var(--panel-border)] bg-[var(--panel-bg)] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
        >
          {meetingSeed.trim() ? (
            <div className="mb-2 last:mb-0">
              <p className="mono text-[0.52rem] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                This meeting
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--foreground)]">
                {meetingSeed.trim()}
              </p>
            </div>
          ) : null}
          {staticUserSeed.trim() ? (
            <div>
              <p className="mono text-[0.52rem] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                Standing context
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--foreground)]">
                {staticUserSeed.trim()}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
