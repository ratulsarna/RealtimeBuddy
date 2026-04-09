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
    <section
      className="surface-panel reveal-up min-w-0 rounded-[2rem] px-5 py-6 md:px-6 md:py-6"
      style={{ animationDelay: "300ms" }}
    >
      <div className="flex flex-col gap-2 border-b border-white/[0.08] pb-5">
        <SectionLabel>Transcript</SectionLabel>
        <h2 className="text-[1.7rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
          The meeting, while it happens.
        </h2>
        <p className="text-sm leading-7 text-[var(--foreground-muted)]">
          Live speech stays visible at the top, pending chunks stay nearby, and the committed record builds on
          the right.
        </p>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <div className="min-w-0">
          <SectionLabel>Live Speech</SectionLabel>
          <div className="mt-4 rounded-[1.6rem] border border-white/[0.08] bg-black/[0.16] p-5">
            <p className="min-h-32 whitespace-pre-wrap text-base leading-8 text-[var(--foreground-strong)]">
              {partialTranscript || "Waiting for live speech..."}
            </p>
          </div>

          <div className="mt-6 border-t border-white/[0.08] pt-5">
            <SectionLabel>Pending Chunks</SectionLabel>
            <div className="mt-4 max-h-72 space-y-4 overflow-auto pr-1">
              {provisionalEntries.length > 0 ? (
                provisionalEntries
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <article
                      className="border-b border-white/[0.08] pb-4 last:border-b-0 last:pb-0"
                      key={entry.id}
                    >
                      <p className="mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                        Pending {entry.at}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[var(--foreground)]">{entry.text}</p>
                    </article>
                  ))
              ) : (
                <p className="text-sm leading-7 text-[var(--foreground-muted)]">
                  No pending transcript chunks right now.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 border-t border-white/[0.08] pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <SectionLabel>Committed Transcript</SectionLabel>
          <div className="mt-4 max-h-[36rem] overflow-auto pr-1">
            {transcriptEntries.length > 0 ? (
              <ol className="space-y-5">
                {transcriptEntries.map((entry, index) => (
                  <li
                    className="border-l border-white/[0.12] pl-4"
                    key={`${entry.at}-${index}`}
                  >
                    <p className="mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                      {entry.at}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[var(--foreground)]">{entry.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm leading-7 text-[var(--foreground-muted)]">
                The committed transcript will accumulate here once speech starts landing.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
