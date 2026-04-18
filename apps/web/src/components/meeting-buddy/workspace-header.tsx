import type { SessionMode } from "@/components/meeting-buddy/types";
import {
  ActionButton,
  MeterBar,
  StatusBadge,
} from "@/components/meeting-buddy/ui";

type WorkspaceHeaderProps = {
  audioLevel: number;
  canPause: boolean;
  canResume: boolean;
  canStart: boolean;
  canStop: boolean;
  connectionStateLabel: string;
  onPauseSession: () => void;
  onResumeSession: () => void;
  onStartSession: () => void;
  onStopSession: () => void;
  onToggleSidebar: () => void;
  onTitleChange: (value: string) => void;
  sessionMode: SessionMode;
  statusTone: "active" | "warning" | "neutral";
  title: string;
};

export function WorkspaceHeader({
  audioLevel,
  canPause,
  canResume,
  canStart,
  canStop,
  connectionStateLabel,
  onPauseSession,
  onResumeSession,
  onStartSession,
  onStopSession,
  onToggleSidebar,
  onTitleChange,
  sessionMode,
  statusTone,
  title,
}: WorkspaceHeaderProps) {
  return (
    <header className="top-bar flex h-14 flex-shrink-0 items-center gap-3 px-4">
      {/* Logo */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--glow)]" />
        <span className="text-sm font-semibold tracking-tight text-[var(--foreground-strong)]">
          RealtimeBuddy
        </span>
      </div>

      <div className="hidden h-5 w-px bg-[var(--line)] md:block" />

      {/* Editable title - hidden on small screens */}
      <input
        className="hidden min-w-0 max-w-[14rem] flex-shrink bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-muted)] md:block"
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder="Session title"
        value={title}
      />

      <div className="flex-1" />

      {/* Status badge */}
      <StatusBadge live={statusTone === "active"} tone={statusTone}>
        {connectionStateLabel}
      </StatusBadge>

      {/* Mic level - compact inline bar */}
      <div className="hidden w-16 md:block">
        <MeterBar compact value={audioLevel} />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        {canStart && (
          <ActionButton onClick={onStartSession} size="sm" variant="primary">
            Start
          </ActionButton>
        )}
        {canPause && (
          <ActionButton onClick={onPauseSession} size="sm">
            Pause
          </ActionButton>
        )}
        {canResume && (
          <ActionButton onClick={onResumeSession} size="sm" variant="primary">
            Resume
          </ActionButton>
        )}
        {canStop && (
          <ActionButton onClick={onStopSession} size="sm" variant="ghost">
            {sessionMode === "companion" ? "Leave" : "Stop"}
          </ActionButton>
        )}
      </div>

      {/* Sidebar toggle - visible below xl */}
      <button
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[var(--foreground-muted)] transition hover:bg-white/[0.06] hover:text-[var(--foreground)] xl:hidden"
        onClick={onToggleSidebar}
        type="button"
      >
        <svg
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </header>
  );
}
