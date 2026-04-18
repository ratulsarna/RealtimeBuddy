import { AskBuddyDock } from "@/components/meeting-buddy/ask-buddy-dock";
import { BuddyQaView } from "@/components/meeting-buddy/buddy-qa-view";

type BuddyQaPanelProps = {
  askHint: string;
  canAsk: boolean;
  currentAnswer: string;
  isAsking: boolean;
  onQuestionChange: (value: string) => void;
  onSendQuestion: (explicit?: string) => void;
  qaMarkdown: string;
  question: string;
};

export function BuddyQaPanel({
  askHint,
  canAsk,
  currentAnswer,
  isAsking,
  onQuestionChange,
  onSendQuestion,
  qaMarkdown,
  question,
}: BuddyQaPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-shrink-0">
        <p className="text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[var(--foreground-muted)]">
          Buddy Q&A
        </p>
        <p className="mt-1.5 text-sm leading-6 text-[var(--foreground-muted)]">
          Ask Buddy here and keep the full Q&amp;A in one place.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4 pt-4">
        <BuddyQaView source={qaMarkdown} />
      </div>

      <div className="flex-shrink-0 border-t border-[var(--panel-border)]/70 pt-4">
        <AskBuddyDock
          askHint={askHint}
          canAsk={canAsk}
          currentAnswer={currentAnswer}
          isAsking={isAsking}
          onQuestionChange={onQuestionChange}
          onSendQuestion={onSendQuestion}
          question={question}
          variant="embedded"
        />
      </div>
    </div>
  );
}
