"use client";

import { BuddyQaPanel } from "@/components/meeting-buddy/buddy-qa-panel";
import { TranscriptPanel } from "@/components/meeting-buddy/transcript-panel";
import type {
  CommittedTranscriptEntry,
  PendingTranscriptEntry,
} from "@/components/meeting-buddy/types";
import { cx } from "@/components/meeting-buddy/ui";

type ActivityTab = "transcript" | "qa";

type ActivityRailProps = {
  className?: string;
  tab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
  partialTranscript: string;
  provisionalEntries: PendingTranscriptEntry[];
  qaMarkdown: string;
  transcriptEntries: CommittedTranscriptEntry[];
};

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cx(
        "flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition",
        active
          ? "bg-[var(--surface-raised-strong)] text-[var(--foreground-strong)]"
          : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function ActivityRail({
  className,
  tab,
  onTabChange,
  partialTranscript,
  provisionalEntries,
  qaMarkdown,
  transcriptEntries,
}: ActivityRailProps) {
  return (
    <section
      className={cx(
        "shell-rail flex flex-col overflow-hidden rounded-[1.5rem] border border-[var(--panel-border)]",
        className
      )}
    >
      <div className="flex-shrink-0 border-b border-[var(--panel-border)]/80 px-4 py-3">
        <div className="flex items-center gap-1 rounded-full bg-[var(--surface-raised)] p-1">
          <TabButton active={tab === "transcript"} onClick={() => onTabChange("transcript")}>
            Transcript
          </TabButton>
          <TabButton active={tab === "qa"} onClick={() => onTabChange("qa")}>
            Buddy Q&amp;A
          </TabButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
        {tab === "transcript" ? (
          <TranscriptPanel
            partialTranscript={partialTranscript}
            provisionalEntries={provisionalEntries}
            transcriptEntries={transcriptEntries}
          />
        ) : (
          <BuddyQaPanel qaMarkdown={qaMarkdown} />
        )}
      </div>
    </section>
  );
}
