import {
  SectionLabel,
  StatusBadge,
} from "@/components/meeting-buddy/ui";

type WorkspaceHeaderProps = {
  captureClientCount: number;
  companionClientCount: number;
  connectionStateLabel: string;
  languageLabel: string;
  selectedMicLabel: string;
  sessionHeadline: string;
  sessionId: string;
  sessionModeLabel: string;
  statusMessage: string;
  statusTone: "active" | "warning" | "neutral";
};

export function WorkspaceHeader({
  captureClientCount,
  companionClientCount,
  connectionStateLabel,
  languageLabel,
  selectedMicLabel,
  sessionHeadline,
  sessionId,
  sessionModeLabel,
  statusMessage,
  statusTone,
}: WorkspaceHeaderProps) {
  const stats = [
    { label: "State", value: connectionStateLabel },
    { label: "Mode", value: sessionModeLabel },
    { label: "Language", value: languageLabel },
    { label: "Capture", value: `${captureClientCount}` },
    { label: "Companions", value: `${companionClientCount}` },
    { label: "Mic", value: selectedMicLabel },
  ];

  if (sessionId) {
    stats.unshift({ label: "Session", value: sessionId });
  }

  return (
    <header
      className="surface-panel reveal-up overflow-hidden rounded-[2rem] px-5 py-5 md:px-7 md:py-6"
      style={{ animationDelay: "40ms" }}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)] xl:items-end">
        <div className="min-w-0">
          <SectionLabel>Ambient Meeting Companion</SectionLabel>
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground-strong)] md:text-[3.4rem] md:leading-[0.94]">
                RealtimeBuddy
              </h1>
              <p className="mt-3 text-lg font-medium text-[var(--foreground)]">{sessionHeadline}</p>
            </div>
            <StatusBadge
              className="self-start md:self-end"
              live={statusTone === "active"}
              tone={statusTone}
            >
              {connectionStateLabel}
            </StatusBadge>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--foreground-muted)] md:text-base">
            {statusMessage}
          </p>
        </div>

        <dl className="grid gap-x-4 gap-y-5 border-t border-white/[0.08] pt-4 min-[500px]:grid-cols-2 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          {stats.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="mono text-[0.62rem] uppercase tracking-[0.3em] text-[var(--foreground-muted)]">
                {item.label}
              </dt>
              <dd className="mt-1 break-words text-sm font-medium text-[var(--foreground)] md:text-[0.95rem]">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}
