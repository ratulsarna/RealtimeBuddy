"use client";

import { useEffect, useMemo, useState } from "react";

import type { BuddyEvent, BuddyEventType } from "@realtimebuddy/shared/protocol";

import { BuddyCard } from "@/components/meeting-buddy/buddy-card";
import {
  BuddyStatusStrip,
  type BuddyState,
} from "@/components/meeting-buddy/buddy-status-strip";
import type { ConnectionState } from "@/components/meeting-buddy/types";
import { SectionLabel } from "@/components/meeting-buddy/ui";

type BuddyLaneProps = {
  events: BuddyEvent[];
  connectionState: ConnectionState;
  hasPreservedMeetingState: boolean;
  staticUserSeed: string;
  meetingSeed: string;
};

const NUDGE_WINDOW_MS = 30_000;

function deriveState(
  connectionState: ConnectionState,
  events: BuddyEvent[],
  hasPreservedMeetingState: boolean,
  nowMs: number
): BuddyState {
  if (connectionState === "paused") return "paused";
  if (
    connectionState === "starting" ||
    connectionState === "connecting" ||
    connectionState === "resuming"
  ) {
    return "warming";
  }

  if (connectionState === "live") {
    if (events.length === 0) return "listening";
    const latest = Date.parse(events[0]!.createdAt);
    if (!Number.isNaN(latest) && nowMs - latest < NUDGE_WINDOW_MS) {
      return "nudging";
    }
    return "noticing";
  }

  if (hasPreservedMeetingState) return "wrapup";
  return "idle";
}

type WrapGroup = {
  key: string;
  label: string;
  events: BuddyEvent[];
};

function groupForWrapup(events: BuddyEvent[]): WrapGroup[] {
  const buckets: Record<string, BuddyEvent[]> = {
    signals: [],
    questions: [],
    followups: [],
  };

  const ordering: Record<BuddyEventType, keyof typeof buckets> = {
    important_signal: "signals",
    ask_this: "questions",
    needs_owner: "followups",
    cover_this: "followups",
  };

  for (const event of events) {
    const bucket = ordering[event.type] ?? "followups";
    buckets[bucket]!.push(event);
  }

  const groups: WrapGroup[] = [
    { key: "signals", label: "Decisions & signals", events: buckets.signals! },
    { key: "questions", label: "Open questions", events: buckets.questions! },
    { key: "followups", label: "Follow-ups & owners", events: buckets.followups! },
  ];

  return groups.filter((group) => group.events.length > 0);
}

function EmptyState({ state }: { state: BuddyState }) {
  if (state === "listening") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--panel-border)] bg-[var(--surface-raised)]">
          <span className="h-3 w-3 rounded-full bg-[var(--accent)] buddy-pulse-ring" />
        </span>
        <div>
          <p className="text-base font-semibold text-[var(--foreground-strong)]">
            Buddy is listening.
          </p>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Nudges show up here when something timely comes along.
          </p>
        </div>
      </div>
    );
  }

  if (state === "warming") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--panel-border)] bg-[var(--surface-raised)]">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)] live-dot" />
        </span>
        <p className="text-sm text-[var(--foreground-muted)]">
          Bringing Buddy on board...
        </p>
      </div>
    );
  }

  if (state === "paused") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,199,133,0.22)] bg-[rgba(255,199,133,0.05)]">
          <svg
            className="h-4 w-4 text-[rgba(255,212,166,0.9)]"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
          >
            <path d="M9 6v12M15 6v12" />
          </svg>
        </span>
        <p className="text-sm text-[var(--foreground-muted)]">
          Capture is paused. Buddy is holding context for when you resume.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm text-[var(--foreground-muted)]">
        Buddy&apos;s lane will fill in here once the session is running.
      </p>
    </div>
  );
}

export function BuddyLane({
  events,
  connectionState,
  hasPreservedMeetingState,
  staticUserSeed,
  meetingSeed,
}: BuddyLaneProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(interval);
  }, []);

  const state = useMemo(
    () => deriveState(connectionState, events, hasPreservedMeetingState, nowMs),
    [connectionState, events, hasPreservedMeetingState, nowMs]
  );

  const wrapGroups = useMemo(
    () => (state === "wrapup" ? groupForWrapup(events) : []),
    [state, events]
  );

  const isWrapup = state === "wrapup";
  const showEmpty = events.length === 0;

  return (
    <section className="buddy-lane-backdrop flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-[54rem] min-h-0 flex-col px-1 sm:px-3">
        <div className="flex-shrink-0 pb-4 pt-2">
          <BuddyStatusStrip
            events={events}
            meetingSeed={meetingSeed}
            staticUserSeed={staticUserSeed}
            state={state}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {isWrapup ? (
            <div className="space-y-8">
              <div>
                <p className="display text-[1.5rem] font-medium tracking-[-0.02em] text-[var(--foreground-strong)]">
                  Meeting recap
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">
                  {events.length} card{events.length === 1 ? "" : "s"} from this session.
                </p>
              </div>
              {wrapGroups.length > 0 ? (
                wrapGroups.map((group) => (
                  <div key={group.key}>
                    <SectionLabel>{group.label}</SectionLabel>
                    <ul className="mt-3 space-y-4">
                      {group.events.map((event) => (
                        <li key={event.id}>
                          <BuddyCard
                            animate={false}
                            event={event}
                            nowMs={nowMs}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.75rem] border border-[var(--panel-border)] bg-[var(--panel-bg)]/75 px-5 py-6">
                  <p className="text-sm font-medium text-[var(--foreground-strong)]">
                    Meeting ended.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--foreground-muted)]">
                    Buddy did not surface any cards this time, but the transcript and Buddy Q&amp;A stay available while you wrap up.
                  </p>
                </div>
              )}
            </div>
          ) : showEmpty ? (
            <EmptyState state={state} />
          ) : (
            <ul className="space-y-4">
              {events.map((event) => (
                <li key={event.id}>
                  <BuddyCard
                    event={event}
                    nowMs={nowMs}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
