import type {
  CommittedTranscriptEntry,
  PendingTranscriptEntry,
} from "@/components/meeting-buddy/types";

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
  const hasAnything =
    Boolean(partialTranscript) ||
    provisionalEntries.length > 0 ||
    transcriptEntries.length > 0;

  return (
    <div className="space-y-5">
      {partialTranscript ? (
        <div className="rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent-soft)]/30 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="live-dot" />
            <span className="text-[0.72rem] font-medium text-[var(--accent-text)]">
              Live now
            </span>
          </div>
          <p className="text-[0.92rem] leading-7 text-[var(--foreground-strong)]">
            {partialTranscript}
          </p>
        </div>
      ) : null}

      {provisionalEntries.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[0.72rem] text-[var(--foreground-muted)]">
            Processing {provisionalEntries.length}
          </p>
          {provisionalEntries
            .slice()
            .reverse()
            .map((entry) => (
              <div
                className="rounded-2xl bg-[var(--surface-raised)] px-4 py-3"
                key={entry.id}
              >
                <p className="text-[0.9rem] leading-7 text-[var(--foreground)]">
                  {entry.text}
                </p>
                <p className="mt-1 text-[0.68rem] text-[var(--foreground-muted)]">
                  {entry.at}
                </p>
              </div>
            ))}
        </div>
      ) : null}

      {transcriptEntries.length > 0 ? (
        <div className="space-y-3">
          {transcriptEntries.map((entry, index) => (
            <div
              className="border-l border-[var(--line)] pl-4"
              key={`${entry.at}-${index}`}
            >
              <p className="text-[0.68rem] text-[var(--foreground-muted)]">
                {entry.at}
              </p>
              <p className="mt-1 text-[0.9rem] leading-7 text-[var(--foreground)]">
                {entry.text}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {!hasAnything ? (
        <p className="text-sm text-[var(--foreground-muted)]">
          Transcript appears here once the session is capturing audio.
        </p>
      ) : null}
    </div>
  );
}
