"use client";

import {
  ActionButton,
  FieldLabel,
  SectionLabel,
  textareaClass,
  cx,
} from "@/components/meeting-buddy/ui";

type MeetingBriefCardProps = {
  staticUserSeed: string;
  meetingSeed: string;
  canStart: boolean;
  onStaticUserSeedChange: (value: string) => void;
  onMeetingSeedChange: (value: string) => void;
  onStartSession: () => void;
  onOpenAdvanced: () => void;
};

export function MeetingBriefCard({
  staticUserSeed,
  meetingSeed,
  canStart,
  onStaticUserSeedChange,
  onMeetingSeedChange,
  onStartSession,
  onOpenAdvanced,
}: MeetingBriefCardProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      {/* Hero */}
      <div className="flex flex-col items-start gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-white/[0.03] px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--glow)]" />
          <span className="mono text-[0.58rem] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
            Pre-meeting brief
          </span>
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground-strong)]">
            Brief Buddy before you start.
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
            Buddy sits on your side of the meeting. A few lines here shape what it listens for
            and when it speaks up.
          </p>
        </div>
      </div>

      {/* Brief form */}
      <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-bg)] p-5">
        <div className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <FieldLabel>This meeting</FieldLabel>
              <span className="mono text-[0.52rem] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                Required-ish
              </span>
            </div>
            <textarea
              autoFocus
              className={cx(textareaClass, "min-h-[5.5rem]")}
              disabled={!canStart}
              onChange={(event) => onMeetingSeedChange(event.target.value)}
              placeholder="e.g. Weekly review with Priya — want to get alignment on Q2 scope. Watch for decisions drifting without owners."
              rows={3}
              value={meetingSeed}
            />
            <p className="text-[0.72rem] text-[var(--foreground-muted)]">
              What kind of meeting, what outcome you want, and what Buddy should watch for.
            </p>
          </label>

          <label className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <FieldLabel>Your standing context</FieldLabel>
              <span className="mono text-[0.52rem] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                Optional
              </span>
            </div>
            <textarea
              className={cx(textareaClass, "min-h-[4.5rem]")}
              disabled={!canStart}
              onChange={(event) => onStaticUserSeedChange(event.target.value)}
              placeholder="Vault path, preferred tools, how you like Buddy to behave across meetings."
              rows={2}
              value={staticUserSeed}
            />
            <p className="text-[0.72rem] text-[var(--foreground-muted)]">
              Durable context that usually stays true meeting to meeting.
            </p>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
          <button
            className="text-xs text-[var(--foreground-muted)] underline-offset-2 transition hover:text-[var(--foreground)] hover:underline"
            onClick={onOpenAdvanced}
            type="button"
          >
            Advanced settings
          </button>
          <ActionButton
            disabled={!canStart}
            onClick={onStartSession}
            size="md"
            type="button"
            variant="primary"
          >
            Start meeting
          </ActionButton>
        </div>
      </div>

      {/* What Buddy will do */}
      <div className="rounded-xl border border-[var(--panel-border)] bg-white/[0.015] px-4 py-3">
        <SectionLabel>What Buddy will do</SectionLabel>
        <ul className="mt-2 grid gap-1.5 text-xs leading-6 text-[var(--foreground)] sm:grid-cols-2">
          <li>Suggest a timely question</li>
          <li>Remind you about what you wanted covered</li>
          <li>Flag decisions forming without an owner</li>
          <li>Surface signals that sound important</li>
        </ul>
      </div>
    </div>
  );
}
