"use client";

import { useEffect, useMemo, useState } from "react";

import type { BuddyEvent, BuddyEventType } from "@realtimebuddy/shared/protocol";

import { AskBuddyDock } from "@/components/meeting-buddy/ask-buddy-dock";
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
  staticUserSeed: string;
  meetingSeed: string;
  askHint: string;
  canAsk: boolean;
  currentAnswer: string;
  isAsking: boolean;
  question: string;
  onQuestionChange: (value: string) => void;
  onSendQuestion: (explicit?: string) => void;
};

const NUDGE_WINDOW_MS = 30_000;

function deriveState(
  connectionState: ConnectionState,
  events: BuddyEvent[],
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

  if (events.length > 0) return "wrapup";
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
  staticUserSeed,
  meetingSeed,
  askHint,
  canAsk,
  currentAnswer,
  isAsking,
  question,
  onQuestionChange,
  onSendQuestion,
}: BuddyLaneProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(interval);
  }, []);

  const state = useMemo(
    () => deriveState(connectionState, events, nowMs),
    [connectionState, events, nowMs]
  );

  const wrapGroups = useMemo(
    () => (state === "wrapup" ? groupForWrapup(events) : []),
    [state, events]
  );

  const isWrapup = state === "wrapup";
  const showEmpty = events.length === 0;

  return (
    <section className="buddy-lane-backdrop flex h-full min-h-0 flex-col">
      {/* Status strip */}
      <div className="flex-shrink-0 px-5 pt-5">
        <BuddyStatusStrip
          eventCount={events.length}
          meetingSeed={meetingSeed}
          staticUserSeed={staticUserSeed}
          state={state}
        />
      </div>

      {/* Card stack / wrap-up groups */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {showEmpty ? (
          <EmptyState state={state} />
        ) : isWrapup ? (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground-strong)]">
                Meeting recap
              </p>
              <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                {events.length} card{events.length === 1 ? "" : "s"} from this session.
              </p>
            </div>
            {wrapGroups.map((group) => (
              <div key={group.key}>
                <SectionLabel>{group.label}</SectionLabel>
                <ul className="mt-2 space-y-2.5">
                  {group.events.map((event) => (
                    <li key={event.id}>
                      <BuddyCard
                        animate={false}
                        canAsk={canAsk}
                        event={event}
                        nowMs={nowMs}
                        onAskSuggested={(text) => onSendQuestion(text)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {events.map((event) => (
              <li key={event.id}>
                <BuddyCard
                  canAsk={canAsk}
                  event={event}
                  nowMs={nowMs}
                  onAskSuggested={(text) => onSendQuestion(text)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ask Buddy dock */}
      <div className="flex-shrink-0">
        <AskBuddyDock
          askHint={askHint}
          canAsk={canAsk}
          currentAnswer={currentAnswer}
          isAsking={isAsking}
          onQuestionChange={onQuestionChange}
          onSendQuestion={onSendQuestion}
          question={question}
        />
      </div>
    </section>
  );
}
