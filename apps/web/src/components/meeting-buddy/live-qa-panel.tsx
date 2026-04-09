import { formatAskedAt } from "@/components/meeting-buddy/format";
import {
  ActionButton,
  SectionLabel,
  StatusBadge,
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
    <section
      className="surface-panel reveal-up min-w-0 overflow-hidden rounded-[2rem] px-5 py-6 md:px-7 md:py-7"
      style={{ animationDelay: "120ms" }}
    >
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <SectionLabel>Live Q&amp;A</SectionLabel>
            <h2 className="mt-3 text-[2rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)] md:text-[3.1rem] md:leading-[0.94]">
              Ask while the meeting is still moving.
            </h2>
          </div>
          <StatusBadge live={Boolean(currentAnswer)} tone={currentAnswer ? "active" : "neutral"}>
            {currentAnswer ? "Streaming reply" : canAsk ? "Ready for questions" : "Waiting for session"}
          </StatusBadge>
        </div>
        <p className="max-w-2xl text-sm leading-7 text-[var(--foreground-muted)] md:text-base">{askHint}</p>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.78fr)]">
        <div className="min-w-0">
          <label className="block">
            <span className="mono text-[0.62rem] uppercase tracking-[0.32em] text-[var(--foreground-muted)]">
              Question
            </span>
            <textarea
              className="mt-3 min-h-56 w-full rounded-[1.75rem] border border-white/[0.08] bg-white/[0.04] px-5 py-5 text-lg leading-8 text-[var(--foreground-strong)] outline-none transition focus:border-[var(--accent)] focus:bg-white/[0.06] md:min-h-72"
              disabled={!canAsk}
              onChange={(event) => onQuestionChange(event.target.value)}
              placeholder="What changed, what matters, and what should I remember later?"
              value={question}
            />
          </label>

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm leading-7 text-[var(--foreground-muted)]">
              Answers stream into this workspace in real time, so you can keep the thread of the meeting.
            </p>
            <ActionButton
              className="w-full md:w-auto"
              disabled={!canAsk || !question.trim() || isAsking}
              onClick={onSendQuestion}
              type="button"
              variant="primary"
            >
              {isAsking ? "Asking..." : "Ask buddy"}
            </ActionButton>
          </div>

          <div className="mt-6 rounded-[1.75rem] border border-white/[0.08] bg-black/[0.18] p-5 md:p-6">
            <SectionLabel>Current Reply</SectionLabel>
            <p className="mt-4 min-h-40 whitespace-pre-wrap text-base leading-8 text-[var(--foreground-strong)]">
              {currentAnswer || "No live answer in progress yet."}
            </p>
          </div>
        </div>

        <aside className="min-w-0 border-t border-white/[0.08] pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <SectionLabel>Recent Q&amp;A</SectionLabel>
          <div className="mt-4 max-h-[36rem] space-y-4 overflow-auto pr-1">
            {questionAnswers.length > 0 ? (
              questionAnswers.map((entry, index) => (
                <article
                  className="border-b border-white/[0.08] pb-4 last:border-b-0 last:pb-0"
                  key={`${entry.question}-${index}`}
                >
                  <p className="text-sm font-medium text-[var(--foreground-strong)]">{entry.question}</p>
                  <p className="mt-1 mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                    {formatAskedAt(entry.askedAt)}
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--foreground-muted)]">
                    {entry.answer}
                  </p>
                </article>
              ))
            ) : (
              <p className="text-sm leading-7 text-[var(--foreground-muted)]">
                Once you ask a live question, the exchange will stay here for quick reference.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
