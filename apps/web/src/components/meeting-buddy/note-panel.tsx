import { SectionLabel } from "@/components/meeting-buddy/ui";

type NotePanelProps = {
  noteMarkdown: string;
  notePathRelative: string;
};

export function NotePanel({ noteMarkdown, notePathRelative }: NotePanelProps) {
  return (
    <section className="border-t border-[var(--line)] p-5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Live Note</SectionLabel>
        <span className="mono max-w-[14rem] truncate text-[0.52rem] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
          {notePathRelative || "No note file yet"}
        </span>
      </div>

      <pre className="mono mt-3 max-h-[36rem] overflow-auto whitespace-pre-wrap text-sm leading-7 text-[var(--foreground)]">
        {noteMarkdown || (
          <span className="text-[var(--foreground-muted)]">
            Notes appear here during the session.
          </span>
        )}
      </pre>
    </section>
  );
}
