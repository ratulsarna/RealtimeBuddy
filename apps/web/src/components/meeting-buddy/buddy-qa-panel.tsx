import { BuddyQaView } from "@/components/meeting-buddy/buddy-qa-view";

type BuddyQaPanelProps = {
  qaMarkdown: string;
};

export function BuddyQaPanel({ qaMarkdown }: BuddyQaPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <p className="text-[0.72rem] font-medium uppercase tracking-[0.12em] text-[var(--foreground-muted)]">
          Buddy Q&A
        </p>
        <p className="mt-1.5 text-sm leading-6 text-[var(--foreground-muted)]">
          A lightweight history of finished questions from this session.
        </p>
      </div>

      <div className="flex-1">
        <BuddyQaView source={qaMarkdown} />
      </div>
    </div>
  );
}
