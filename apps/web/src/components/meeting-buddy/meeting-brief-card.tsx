"use client";

import {
  ActionButton,
  Label,
  Toggle,
  inputClass,
  textareaClass,
  cx,
} from "@/components/meeting-buddy/ui";

type MeetingBriefCardProps = {
  meetingSeed: string;
  title: string;
  canStart: boolean;
  includeTabAudio: boolean;
  onMeetingSeedChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onIncludeTabAudioChange: (checked: boolean) => void;
  onStartSession: () => void;
};

export function MeetingBriefCard({
  meetingSeed,
  title,
  canStart,
  includeTabAudio,
  onMeetingSeedChange,
  onTitleChange,
  onIncludeTabAudioChange,
  onStartSession,
}: MeetingBriefCardProps) {
  return (
    <section className="flex min-h-full items-center justify-center px-6 py-12 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="display text-center text-[2rem] font-medium leading-[1.05] tracking-[-0.03em] text-[var(--foreground-strong)] sm:text-[2.5rem]">
          Brief Buddy for this meeting.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-[0.95rem] leading-7 text-[var(--foreground-muted)]">
          Buddy follows live as a partner in the meeting, nudges with insights, and answers your questions.
        </p>

        <div className="mt-10">
          <label className="mb-4 flex flex-col gap-2">
            <Label>Session title</Label>
            <input
              className={inputClass}
              disabled={!canStart}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="e.g. Kshitij Q4 2025 QPR"
              value={title}
            />
          </label>

          <textarea
            autoFocus
            className={cx(textareaClass, "min-h-[10rem] rounded-[1.75rem]")}
            disabled={!canStart}
            onChange={(event) => onMeetingSeedChange(event.target.value)}
            placeholder="e.g. Weekly review with Priya. Need alignment on Q2 scope. Watch for decisions without owners."
            rows={5}
            value={meetingSeed}
          />

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2.5 text-[0.82rem] text-[var(--foreground-muted)]">
              <Toggle
                checked={includeTabAudio}
                disabled={!canStart}
                onChange={onIncludeTabAudioChange}
              />
              <span>
                Include tab audio
                <span className="ml-1.5 text-[var(--foreground-muted)]/80">
                  · pick any Chrome tab to capture along with your mic
                </span>
              </span>
            </label>

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
