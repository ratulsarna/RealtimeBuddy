import { NoteView } from "@/components/meeting-buddy/note-view";

type NotePanelProps = {
  noteMarkdown: string;
  notePathRelative: string;
};

export function NotePanel({ noteMarkdown, notePathRelative }: NotePanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1">
        <NoteView source={noteMarkdown} />
      </div>
      {notePathRelative ? (
        <p
          className="mt-6 truncate text-[0.72rem] text-[var(--foreground-muted)]"
          title={notePathRelative}
        >
          Saved to {notePathRelative}
        </p>
      ) : null}
    </div>
  );
}
