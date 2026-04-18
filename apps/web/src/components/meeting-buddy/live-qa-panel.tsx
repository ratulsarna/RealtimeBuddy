import { formatAskedAt } from "@/components/meeting-buddy/format";
import {
  ActionButton,
  SectionLabel,
} from "@/components/meeting-buddy/ui";
import type { QuestionAnswer } from "@/components/meeting-buddy/types";

type LiveQaPanelProps = {
  askHint: string;
  canAsk: boolean;
  currentAnswer: string;
  isAsking: boolean;
  onQuestionChange: (value: string) => void;
  onSendQuestion: () => void;
  question: string;
  questionAnswers: QuestionAnswer[];
};

export function LiveQaPanel({
  askHint,
  canAsk,
  currentAnswer,
  isAsking,
  onQuestionChange,
  onSendQuestion,
  question,
  questionAnswers,
}: LiveQaPanelProps) {
  return (
    <section className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Ask a question</SectionLabel>
        <span className="mono text-[0.52rem] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
          {canAsk ? "Session active" : "Waiting for session"}
        </span>
      </div>

      {/* Question input */}
      <div className="mt-3">
        <textarea
          className="w-full resize-none rounded-xl border border-[var(--line)] bg-white/[0.03] px-4 py-3 text-sm leading-6 text-[var(--foreground-strong)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--accent)]/40 focus:bg-white/[0.04] disabled:opacity-50"
          disabled={!canAsk}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              if (canAsk && question.trim() && !isAsking) {
                onSendQuestion();
              }
            }
          }}
          placeholder="What changed, what matters, what should I remember?"
          rows={3}
          value={question}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--foreground-muted)]">{askHint}</p>
          <ActionButton
            className="flex-shrink-0"
            disabled={!canAsk || !question.trim() || isAsking}
            onClick={onSendQuestion}
            size="sm"
            type="button"
            variant="primary"
          >
            {isAsking ? "Asking..." : "Ask"}
          </ActionButton>
        </div>
      </div>

      {/* Streaming reply */}
      {(isAsking || currentAnswer) ? (
        <div className="mt-4 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-soft)]/30 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="live-dot" />
            <SectionLabel className="text-[var(--accent-text)]">Replying</SectionLabel>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--foreground-strong)]">
            {currentAnswer || "Thinking..."}
          </p>
        </div>
      ) : null}

      {/* Q&A History */}
      {questionAnswers.length > 0 ? (
        <div className="mt-5 border-t border-[var(--line)] pt-4">
          <SectionLabel>Previous answers</SectionLabel>
          <div className="mt-3 max-h-[28rem] space-y-4 overflow-auto pr-1">
            {questionAnswers.map((entry, index) => (
              <article
                className="border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0"
                key={`${entry.question}-${index}`}
              >
                <p className="text-sm font-medium text-[var(--foreground-strong)]">{entry.question}</p>
                <p className="mono mt-0.5 text-[0.52rem] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                  {formatAskedAt(entry.askedAt)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground-muted)]">
                  {entry.answer}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
