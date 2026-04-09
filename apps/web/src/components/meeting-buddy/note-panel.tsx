import { SectionLabel } from "@/components/meeting-buddy/ui";

type NotePanelProps = {
  noteMarkdown: string;
  notePathRelative: string;
};

export function NotePanel({ noteMarkdown, notePathRelative }: NotePanelProps) {
  return (
    <section
      className="paper-panel reveal-up min-w-0 rounded-[2rem] px-5 py-6 md:px-7 md:py-7"
      style={{ animationDelay: "240ms" }}
    >
      <div className="flex flex-col gap-3 border-b border-[rgba(33,27,20,0.1)] pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <SectionLabel className="text-[rgba(45,33,20,0.55)]">Live Note</SectionLabel>
          <h2 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.04em] text-[#1f1913] md:text-[2.4rem]">
            Notes stay readable while they evolve.
          </h2>
        </div>
        <p className="mono max-w-xl break-words text-[0.68rem] uppercase tracking-[0.28em] text-[rgba(45,33,20,0.52)]">
          {notePathRelative || "No note file yet"}
        </p>
      </div>

      <pre className="mt-6 max-h-[42rem] overflow-auto whitespace-pre-wrap text-[0.98rem] leading-8 text-[#2d241b]">
        {noteMarkdown || "The live note will appear here as soon as the session starts."}
      </pre>
    </section>
  );
}
