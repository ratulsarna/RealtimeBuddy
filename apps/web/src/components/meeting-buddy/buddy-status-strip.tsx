"use client";

import { useEffect, useRef, useState } from "react";

import type { BuddyEvent, BuddyEventType } from "@realtimebuddy/shared/protocol";

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
  events: BuddyEvent[];
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

// Mirror the human-readable labels from buddy-card.tsx's TYPE_META locally because
// the card component is intentionally presentational and out of scope for this action.
const EVENT_TYPE_LABELS: Record<BuddyEventType, string> = {
  ask_this: "Ask this",
  cover_this: "Cover this",
  needs_owner: "Needs owner",
  important_signal: "Important signal",
};

function formatEventsForClipboard(events: BuddyEvent[]): string {
  return [...events]
    .reverse()
    .map((event) => {
      const lines = [`[${EVENT_TYPE_LABELS[event.type]}] ${event.title}`];
      const body = event.body.trim();
      const suggestedQuestion = event.suggestedQuestion?.trim();

      if (body) {
        lines.push(body);
      }

      if (suggestedQuestion) {
        lines.push(`Suggested question: "${suggestedQuestion}"`);
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

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
  events,
  staticUserSeed,
  meetingSeed,
}: BuddyStatusStripProps) {
  const [briefOpen, setBriefOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const popoverRef = useClickOutside<HTMLDivElement>(() => setBriefOpen(false));
  const copyResetTimeoutRef = useRef<number | null>(null);

  const { title, hint } = LABELS[state];
  const eventCount = events.length;
  const hasBrief = Boolean(meetingSeed.trim() || staticUserSeed.trim());

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(formatEventsForClipboard(events));
      setCopied(true);
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copyResetTimeoutRef.current = null;
      }, 1400);
    } catch {
      // ignore clipboard failures silently to match the per-card copy action
    }
  };

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
    <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-[var(--panel-border)]/80 bg-[var(--panel-bg)]/70 px-4 py-3 backdrop-blur-xl">
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
          <span className="inline-flex h-7 items-center rounded-full bg-[var(--surface-raised)] px-3 text-[0.72rem] font-medium text-[var(--foreground)]">
            {eventCount} card{eventCount === 1 ? "" : "s"}
          </span>
        ) : null}

        {eventCount > 0 ? (
          <button
            className={cx(
              "inline-flex h-7 items-center justify-center rounded-full border border-[var(--line)]/70 bg-[var(--surface-input)] px-3 text-[0.72rem] font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]",
              copied && "bg-[var(--surface-raised-strong)]"
            )}
            onClick={() => void handleCopyAll()}
            type="button"
          >
            {copied ? "Copied" : "Copy all"}
          </button>
        ) : null}

        {hasBrief ? (
          <button
            className={cx(
              "inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--line)]/70 bg-[var(--surface-input)] px-3 text-[0.72rem] font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]",
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
          className="slide-in-right absolute right-2 top-[calc(100%+0.45rem)] z-20 w-80 rounded-[1.5rem] border border-[var(--panel-border)] bg-[var(--drawer-panel-bg)] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl"
        >
          {meetingSeed.trim() ? (
            <div className="mb-2 last:mb-0">
              <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
                This meeting
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--foreground)]">
                {meetingSeed.trim()}
              </p>
            </div>
          ) : null}
          {staticUserSeed.trim() ? (
            <div>
              <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
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
