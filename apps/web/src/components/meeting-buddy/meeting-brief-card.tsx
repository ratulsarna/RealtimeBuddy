"use client";

import {
  ActionButton,
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
    <section className="flex min-h-full items-center justify-center px-6 py-12 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="display text-center text-[2rem] font-medium leading-[1.05] tracking-[-0.03em] text-[var(--foreground-strong)] sm:text-[2.5rem]">
          Give Buddy the shape of the room.
        </h1>

        <div className="mt-10">
          <textarea
            autoFocus
            className={cx(textareaClass, "min-h-[10rem] rounded-[1.75rem]")}
            disabled={!canStart}
            onChange={(event) => onMeetingSeedChange(event.target.value)}
            placeholder="e.g. Weekly review with Priya. Need alignment on Q2 scope. Watch for decisions without owners."
            rows={5}
            value={meetingSeed}
          />

          <div className="mt-5 flex justify-end">
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
    </section>
  );
}
