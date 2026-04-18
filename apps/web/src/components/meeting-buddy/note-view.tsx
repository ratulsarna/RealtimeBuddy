import type { ReactNode } from "react";

type QaBlock = {
  timestamp: string;
  question: string;
  answerParagraphs: Array<{ kind: "p" | "list"; lines: string[] }>;
};

type ParsedNote =
  | { kind: "structured"; title: string; qaBlocks: QaBlock[]; emptyMessage?: string }
  | { kind: "fallback"; text: string };

function stripHeading(line: string, marker: string): string | null {
  if (!line.startsWith(marker)) return null;
  return line.slice(marker.length).trim();
}

function groupAnswerParagraphs(lines: string[]): QaBlock["answerParagraphs"] {
  const groups: QaBlock["answerParagraphs"] = [];
  let currentKind: "p" | "list" | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentKind || buffer.length === 0) return;
    groups.push({ kind: currentKind, lines: buffer });
    buffer = [];
    currentKind = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const isBullet = /^\s*[-*]\s+/.test(line);
    if (isBullet) {
      if (currentKind !== "list") {
        flush();
        currentKind = "list";
      }
      buffer.push(line.replace(/^\s*[-*]\s+/, ""));
    } else {
      if (currentKind !== "p") {
        flush();
        currentKind = "p";
      }
      buffer.push(line);
    }
  }
  flush();
  return groups;
}

function parseNote(source: string): ParsedNote {
  const trimmed = source.trim();
  if (!trimmed) {
    return { kind: "structured", title: "", qaBlocks: [] };
  }

  const lines = trimmed.split("\n");
  let index = 0;

  let title = "";
  const firstHeading = stripHeading(lines[index] ?? "", "# ");
  if (firstHeading !== null) {
    title = firstHeading;
    index += 1;
  }

  while (index < lines.length && !lines[index]!.trim()) {
    index += 1;
  }

  const sectionHeading = stripHeading(lines[index] ?? "", "## ");
  if (sectionHeading === null) {
    return { kind: "fallback", text: trimmed };
  }
  index += 1;

  const qaBlocks: QaBlock[] = [];
  let emptyMessage: string | undefined;

  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const timestamp = stripHeading(line, "### ");
    if (timestamp === null) {
      if (qaBlocks.length === 0 && emptyMessage === undefined) {
        emptyMessage = line.trim();
      }
      index += 1;
      continue;
    }
    index += 1;

    let question = "";
    while (index < lines.length && !lines[index]!.trim()) {
      index += 1;
    }
    if (index < lines.length) {
      const candidate = lines[index]!;
      if (candidate.startsWith("Question:")) {
        question = candidate.slice("Question:".length).trim();
        index += 1;
      }
    }

    while (index < lines.length && !lines[index]!.trim()) {
      index += 1;
    }
    if (index < lines.length && lines[index] === "Answer:") {
      index += 1;
    }

    const answerLines: string[] = [];
    while (index < lines.length) {
      const next = lines[index]!;
      if (next.startsWith("### ")) break;
      if (next.startsWith("## ")) break;
      answerLines.push(next);
      index += 1;
    }

    qaBlocks.push({
      timestamp,
      question,
      answerParagraphs: groupAnswerParagraphs(answerLines),
    });
  }

  return { kind: "structured", title, qaBlocks, emptyMessage };
}

export function NoteView({ source }: { source: string }) {
  const parsed = parseNote(source);

  if (parsed.kind === "fallback") {
    return (
      <div className="whitespace-pre-wrap text-[0.9rem] leading-7 text-[var(--foreground)]">
        {parsed.text}
      </div>
    );
  }

  const { title, qaBlocks, emptyMessage } = parsed;
  const hasContent = Boolean(title) || qaBlocks.length > 0 || emptyMessage;

  if (!hasContent) {
    return (
      <p className="text-sm text-[var(--foreground-muted)]">
        Notes appear here once you ask Buddy something during the session.
      </p>
    );
  }

  return (
    <article className="space-y-7">
      {title ? (
        <header>
          <h1 className="display text-[1.4rem] font-medium leading-snug tracking-[-0.02em] text-[var(--foreground-strong)]">
            {title}
          </h1>
        </header>
      ) : null}

      {qaBlocks.length === 0 && emptyMessage ? (
        <p className="text-sm text-[var(--foreground-muted)]">{emptyMessage}</p>
      ) : null}

      {qaBlocks.map((block, blockIndex) => (
        <section key={`${block.timestamp}-${blockIndex}`} className="space-y-3">
          <p className="text-[0.72rem] text-[var(--foreground-muted)]">{block.timestamp}</p>

          {block.question ? (
            <p className="display text-[1rem] font-medium leading-snug tracking-[-0.01em] text-[var(--foreground-strong)]">
              {block.question}
            </p>
          ) : null}

          {block.answerParagraphs.length > 0 ? (
            <div className="space-y-3">
              {block.answerParagraphs.map((group, groupIndex): ReactNode => {
                if (group.kind === "list") {
                  return (
                    <ul
                      key={`list-${groupIndex}`}
                      className="list-disc space-y-1.5 pl-5 text-[0.9rem] leading-7 text-[var(--foreground)]"
                    >
                      {group.lines.map((line, lineIndex) => (
                        <li key={lineIndex}>{line}</li>
                      ))}
                    </ul>
                  );
                }
                return (
                  <p
                    key={`p-${groupIndex}`}
                    className="whitespace-pre-wrap text-[0.9rem] leading-7 text-[var(--foreground)]"
                  >
                    {group.lines.join("\n")}
                  </p>
                );
              })}
            </div>
          ) : null}
        </section>
      ))}
    </article>
  );
}
