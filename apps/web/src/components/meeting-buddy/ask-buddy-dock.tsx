"use client";

import { ActionButton, SectionLabel, cx } from "@/components/meeting-buddy/ui";

type AskBuddyDockProps = {
  askHint: string;
  canAsk: boolean;
  className?: string;
  currentAnswer: string;
  isAsking: boolean;
  onQuestionChange: (value: string) => void;
  onSendQuestion: (explicit?: string) => void;
  question: string;
  variant?: "floating" | "embedded";
};

export function AskBuddyDock({
  askHint,
  canAsk,
  className,
  currentAnswer,
  isAsking,
  onQuestionChange,
  onSendQuestion,
  question,
  variant = "floating",
}: AskBuddyDockProps) {
  const canSubmit = canAsk && question.trim().length > 0 && !isAsking;
  const showAnswer = isAsking || Boolean(currentAnswer);
  const isEmbedded = variant === "embedded";

  return (
    <div
      className={cx(
        isEmbedded
          ? "rounded-[1.35rem] border border-[var(--panel-border)]/80 bg-[var(--surface-raised)]/55 px-4 py-4"
          : "rounded-[1.75rem] border border-[var(--panel-border)] bg-[var(--panel-bg)]/80 px-5 py-5 shadow-[0_16px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl",
        className
      )}
    >
      {showAnswer ? (
        <div className="mb-4 rounded-[1.25rem] border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-4 py-3">
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

      {isEmbedded ? (
        <div className="space-y-3">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <SectionLabel>Question</SectionLabel>
              <span className="text-[0.68rem] text-[var(--foreground-muted)]">
                Cmd/Ctrl + Enter
              </span>
            </div>
            <label className="sr-only" htmlFor="ask-buddy-input">
              Ask Buddy a question
            </label>
            <textarea
              className={cx(
                "w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3.5 py-2.5 text-sm leading-6 text-[var(--foreground-strong)] outline-none transition",
                "rounded-[1.2rem] border-[var(--line)]/70 bg-[var(--surface-input)] px-4 py-3.5",
                "placeholder:text-[var(--foreground-muted)] focus:border-[var(--accent)]/40 focus:bg-[var(--surface-input-focus)]",
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
              placeholder="What needs clarification?"
              rows={3}
              value={question}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-[0.72rem] leading-5 text-[var(--foreground-muted)]">
              {askHint}
            </p>
            <ActionButton
              className="h-10 min-w-[7rem] flex-shrink-0 rounded-[1rem] px-4 shadow-[0_8px_24px_var(--glow)]"
              disabled={!canSubmit}
              onClick={() => onSendQuestion()}
              size="sm"
              type="button"
              variant="primary"
            >
              {isAsking ? "Sending..." : "Send"}
            </ActionButton>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor="ask-buddy-input">
              Ask Buddy a question
            </label>
            <textarea
              className={cx(
                "w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface-input)] px-3.5 py-2.5 text-sm leading-6 text-[var(--foreground-strong)] outline-none transition",
                "rounded-[1.4rem] border-[var(--line)]/70 bg-[var(--surface-input)] px-4 py-3",
                "placeholder:text-[var(--foreground-muted)] focus:border-[var(--accent)]/40 focus:bg-[var(--surface-input-focus)]",
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
            className="h-11 flex-shrink-0"
            disabled={!canSubmit}
            onClick={() => onSendQuestion()}
            size="md"
            type="button"
            variant="primary"
          >
            {isAsking ? "Asking..." : "Ask"}
          </ActionButton>
        </div>
      )}
    </div>
  );
}
