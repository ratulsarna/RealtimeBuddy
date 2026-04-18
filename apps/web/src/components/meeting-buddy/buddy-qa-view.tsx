import type { ReactNode } from "react";

type AnswerGroup = {
  kind: "p" | "list";
  lines: string[];
};

type QaEntry = {
  answerGroups: AnswerGroup[];
  question: string;
  timestamp: string;
};

function stripHeading(line: string, marker: string): string | null {
  if (!line.startsWith(marker)) return null;
  return line.slice(marker.length).trim();
}

function groupAnswerLines(lines: string[]): AnswerGroup[] {
  const groups: AnswerGroup[] = [];
  let currentKind: AnswerGroup["kind"] | null = null;
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
      continue;
    }

    if (currentKind !== "p") {
      flush();
      currentKind = "p";
    }
    buffer.push(line);
  }

  flush();
  return groups;
}

function parseBuddyQaEntries(source: string): QaEntry[] {
  const trimmed = source.trim();
  if (!trimmed) {
    return [];
  }

  const lines = trimmed.split("\n");
  let index = 0;

  const firstHeading = stripHeading(lines[index] ?? "", "# ");
  if (firstHeading !== null) {
    index += 1;
  }

  while (index < lines.length && !lines[index]!.trim()) {
    index += 1;
  }

  const sectionHeading = stripHeading(lines[index] ?? "", "## ");
  if (sectionHeading !== "Buddy Q&A") {
    return [];
  }
  index += 1;

  const entries: QaEntry[] = [];

  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const timestamp = stripHeading(line, "### ");
    if (timestamp === null) {
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

    entries.push({
      answerGroups: groupAnswerLines(answerLines),
      question,
      timestamp,
    });
  }

  return entries;
}

function EmptyState() {
  return (
    <div className="rounded-[1.35rem] border border-[var(--panel-border)]/80 bg-[var(--surface-raised)]/45 px-4 py-5">
      <p className="text-sm font-medium text-[var(--foreground-strong)]">No Buddy Q&A yet.</p>
      <p className="mt-1.5 text-sm leading-6 text-[var(--foreground-muted)]">
        Completed questions and answers from this session will collect here.
      </p>
    </div>
  );
}

export function BuddyQaView({ source }: { source: string }) {
  const entries = parseBuddyQaEntries(source);

  if (entries.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, entryIndex) => (
        <article
          key={`${entry.timestamp}-${entryIndex}`}
          className="rounded-[1.35rem] border border-[var(--panel-border)]/80 bg-[var(--surface-raised)]/45 px-4 py-4"
        >
          {entry.timestamp ? (
            <p className="text-[0.72rem] text-[var(--foreground-muted)]">{entry.timestamp}</p>
          ) : null}

          <div className={entry.timestamp ? "mt-3" : ""}>
            <p className="text-[0.68rem] font-medium uppercase tracking-[0.12em] text-[var(--foreground-muted)]">
              Question
            </p>
            <p className="mt-1.5 text-sm font-medium leading-6 text-[var(--foreground-strong)]">
              {entry.question || "Buddy question"}
            </p>
          </div>

          {entry.answerGroups.length > 0 ? (
            <div className="mt-4">
              <p className="text-[0.68rem] font-medium uppercase tracking-[0.12em] text-[var(--foreground-muted)]">
                Answer
              </p>
              <div className="mt-1.5 space-y-3">
                {entry.answerGroups.map((group, groupIndex): ReactNode => {
                  if (group.kind === "list") {
                    return (
                      <ul
                        key={`list-${groupIndex}`}
                        className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-[var(--foreground)]"
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
                      className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]"
                    >
                      {group.lines.join("\n")}
                    </p>
                  );
                })}
              </div>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
