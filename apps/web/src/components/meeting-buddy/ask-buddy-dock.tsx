"use client";

import { ActionButton, SectionLabel, cx } from "@/components/meeting-buddy/ui";

type AskBuddyDockProps = {
  askHint: string;
  canAsk: boolean;
  currentAnswer: string;
  isAsking: boolean;
  onQuestionChange: (value: string) => void;
  onSendQuestion: (explicit?: string) => void;
  question: string;
};

export function AskBuddyDock({
  askHint,
  canAsk,
  currentAnswer,
  isAsking,
  onQuestionChange,
  onSendQuestion,
  question,
}: AskBuddyDockProps) {
  const canSubmit = canAsk && question.trim().length > 0 && !isAsking;
  const showAnswer = isAsking || Boolean(currentAnswer);

  return (
    <div className="border-t border-[var(--panel-border)] bg-white/[0.015] px-5 py-4">
      {showAnswer ? (
        <div className="mb-3 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-4 py-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="live-dot" />
            <SectionLabel className="text-[var(--accent-text)]">
              Buddy is replying
            </SectionLabel>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground-strong)]">
            {currentAnswer || "Thinking..."}
          </p>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="ask-buddy-input">
            Ask Buddy a question
          </label>
          <textarea
            className={cx(
              "w-full resize-none rounded-xl border border-[var(--line)] bg-white/[0.03] px-3.5 py-2.5 text-sm leading-6 text-[var(--foreground-strong)] outline-none transition",
              "placeholder:text-[var(--foreground-muted)] focus:border-[var(--accent)]/40 focus:bg-white/[0.04]",
              "disabled:opacity-50"
            )}
            disabled={!canAsk}
            id="ask-buddy-input"
            name="question"
            onChange={(event) => onQuestionChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                if (canSubmit) {
                  onSendQuestion();
                }
              }
            }}
            placeholder="Ask Buddy directly — ⌘/Ctrl + Enter to send"
            rows={2}
            value={question}
          />
          <p className="mt-1.5 text-[0.72rem] text-[var(--foreground-muted)]">{askHint}</p>
        </div>
        <ActionButton
          className="h-10 flex-shrink-0"
          disabled={!canSubmit}
          onClick={() => onSendQuestion()}
          size="md"
          type="button"
          variant="primary"
        >
          {isAsking ? "Asking..." : "Ask"}
        </ActionButton>
      </div>
    </div>
  );
}
