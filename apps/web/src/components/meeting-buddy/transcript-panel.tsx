import type {
  CommittedTranscriptEntry,
  PendingTranscriptEntry,
} from "@/components/meeting-buddy/types";
import { SectionLabel } from "@/components/meeting-buddy/ui";

type TranscriptPanelProps = {
  partialTranscript: string;
  provisionalEntries: PendingTranscriptEntry[];
  transcriptEntries: CommittedTranscriptEntry[];
};

export function TranscriptPanel({
  partialTranscript,
  provisionalEntries,
  transcriptEntries,
}: TranscriptPanelProps) {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <SectionLabel>Transcript</SectionLabel>
        <span className="mono text-[0.5rem] uppercase tracking-widest text-[var(--foreground-muted)]">
          Supporting context
        </span>
      </div>

      {/* Live speech */}
      {partialTranscript ? (
        <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)]/30 px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="live-dot" />
            <span className="mono text-[0.5rem] uppercase tracking-widest text-[var(--accent-text)]">
              Live
            </span>
          </div>
          <p className="text-sm leading-6 text-[var(--foreground-strong)]">{partialTranscript}</p>
        </div>
      ) : null}

      {/* Pending chunks */}
      {provisionalEntries.length > 0 ? (
        <div className="space-y-2">
          <span className="mono text-[0.5rem] uppercase tracking-widest text-[var(--foreground-muted)]">
            Pending ({provisionalEntries.length})
          </span>
          {provisionalEntries
            .slice()
            .reverse()
            .map((entry) => (
              <div
                className="rounded-lg bg-white/[0.02] px-3 py-2"
                key={entry.id}
              >
                <p className="text-sm leading-6 text-[var(--foreground)]">{entry.text}</p>
                <p className="mono mt-1 text-[0.5rem] text-[var(--foreground-muted)]">
                  {entry.at}
                </p>
              </div>
            ))}
        </div>
      ) : null}

      {/* Committed transcript */}
      <div className="space-y-1">
        {transcriptEntries.length > 0 ? (
          transcriptEntries.map((entry, index) => (
            <div
              className="border-l-2 border-[var(--line)] py-2 pl-3"
              key={`${entry.at}-${index}`}
            >
              <p className="mono text-[0.5rem] text-[var(--foreground-muted)]">{entry.at}</p>
              <p className="mt-0.5 text-sm leading-6 text-[var(--foreground)]">{entry.text}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-[var(--foreground-muted)]">
            {partialTranscript
              ? "Waiting for committed speech..."
              : "Transcript will appear here once the session starts."}
          </p>
        )}
      </div>
    </div>
  );
}
