"use client";

import { DrawerShell } from "@/components/meeting-buddy/drawer-shell";
import { NotePanel } from "@/components/meeting-buddy/note-panel";
import { TranscriptPanel } from "@/components/meeting-buddy/transcript-panel";
import type {
  CommittedTranscriptEntry,
  PendingTranscriptEntry,
} from "@/components/meeting-buddy/types";
import { cx } from "@/components/meeting-buddy/ui";

type SessionDrawerTab = "transcript" | "note";

type SessionDrawerProps = {
  onClose: () => void;
  tab: SessionDrawerTab;
  onTabChange: (tab: SessionDrawerTab) => void;
  partialTranscript: string;
  provisionalEntries: PendingTranscriptEntry[];
  transcriptEntries: CommittedTranscriptEntry[];
  noteMarkdown: string;
  notePathRelative: string;
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

export function SessionDrawer({
  onClose,
  tab,
  onTabChange,
  partialTranscript,
  provisionalEntries,
  transcriptEntries,
  noteMarkdown,
  notePathRelative,
}: SessionDrawerProps) {
  const segmented = (
    <div className="flex items-center gap-1 rounded-full bg-[var(--surface-raised)] p-1">
      <TabButton active={tab === "transcript"} onClick={() => onTabChange("transcript")}>
        Transcript
      </TabButton>
      <TabButton active={tab === "note"} onClick={() => onTabChange("note")}>
        Note
      </TabButton>
    </div>
  );

  return (
    <DrawerShell onClose={onClose} title="Activity" headerExtra={null}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-shrink-0 px-6 pb-2 pt-4">{segmented}</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
          {tab === "transcript" ? (
            <TranscriptPanel
              partialTranscript={partialTranscript}
              provisionalEntries={provisionalEntries}
              transcriptEntries={transcriptEntries}
            />
          ) : (
            <NotePanel noteMarkdown={noteMarkdown} notePathRelative={notePathRelative} />
          )}
        </div>
      </div>
    </DrawerShell>
  );
}
