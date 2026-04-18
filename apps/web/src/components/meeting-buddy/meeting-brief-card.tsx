"use client";

import {
  ActionButton,
  FieldLabel,
  textareaClass,
  cx,
} from "@/components/meeting-buddy/ui";

type MeetingBriefCardProps = {
  meetingSeed: string;
  canStart: boolean;
  onMeetingSeedChange: (value: string) => void;
  onStartSession: () => void;
};

export function MeetingBriefCard({
  meetingSeed,
  canStart,
  onMeetingSeedChange,
  onStartSession,
}: MeetingBriefCardProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 py-10">
      {/* Hero */}
      <div className="flex flex-col items-start gap-2">
        <div>
          <h1 className="display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-[var(--foreground-strong)]">
            Give Buddy a quick brief.
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
            A line or two helps it listen for the right moments.
          </p>
        </div>
      </div>

      {/* Brief form */}
      <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-bg)] p-5">
        <div className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <FieldLabel>Meeting brief</FieldLabel>
            </div>
            <textarea
              autoFocus
              className={cx(textareaClass, "min-h-[5.5rem]")}
              disabled={!canStart}
              onChange={(event) => onMeetingSeedChange(event.target.value)}
              placeholder="e.g. Weekly review with Priya. Need alignment on Q2 scope. Watch for decisions without owners."
              rows={3}
              value={meetingSeed}
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end border-t border-[var(--line)] pt-4">
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
    </div>
  );
}
