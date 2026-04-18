import type { SessionMode } from "@/components/meeting-buddy/types";
import { ActionButton, StatusBadge } from "@/components/meeting-buddy/ui";

type WorkspaceHeaderProps = {
  canPause: boolean;
  canReset: boolean;
  canResume: boolean;
  canStart: boolean;
  canStop: boolean;
  connectionStateLabel: string;
  onPauseSession: () => void;
  onResetSession: () => void;
  onResumeSession: () => void;
  onStartSession: () => void;
  onStopSession: () => void;
  onToggleActivity: () => void;
  onToggleSettings: () => void;
  sessionMode: SessionMode;
  showActivityAction: boolean;
  showStartAction: boolean;
  showSessionTitle: boolean;
  statusTone: "active" | "warning" | "neutral";
  title: string;
};

export function WorkspaceHeader({
  canPause,
  canReset,
  canResume,
  canStart,
  canStop,
  connectionStateLabel,
  onPauseSession,
  onResetSession,
  onResumeSession,
  onStartSession,
  onStopSession,
  onToggleActivity,
  onToggleSettings,
  sessionMode,
  showActivityAction,
  showStartAction,
  showSessionTitle,
  statusTone,
  title,
}: WorkspaceHeaderProps) {
  const resolvedTitle = title.trim() || "Session";

  return (
    <header className="top-bar flex h-16 flex-shrink-0 items-center gap-3 px-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex flex-shrink-0 items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--glow)]" />
          <span className="display text-[1rem] font-medium tracking-tight text-[var(--foreground-strong)]">
            RealtimeBuddy
          </span>
        </div>

        {showSessionTitle ? (
          <div className="min-w-0 flex-1 border-l border-[var(--line)]/70 pl-4">
            <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
              Session
            </p>
            <p className="display truncate text-[1.05rem] font-medium tracking-[-0.02em] text-[var(--foreground-strong)]">
              {resolvedTitle}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
        <StatusBadge
          className="inline-flex px-2 sm:hidden"
          live={statusTone === "active"}
          tone={statusTone}
        >
          <span className="sr-only">{connectionStateLabel}</span>
        </StatusBadge>
        <StatusBadge
          className="hidden sm:inline-flex"
          live={statusTone === "active"}
          tone={statusTone}
        >
          {connectionStateLabel}
        </StatusBadge>

        <div className="flex items-center gap-1.5">
          {canStart && showStartAction && (
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
          {canReset && (
            <ActionButton onClick={onResetSession} size="sm" variant="ghost">
              Reset
            </ActionButton>
          )}
        </div>

        {showActivityAction ? (
          <button
            aria-label="Open transcript and note"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[var(--line)]/70 bg-[var(--surface-input)] px-3 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-hover)] lg:hidden"
            onClick={onToggleActivity}
            type="button"
          >
            <svg
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              viewBox="0 0 24 24"
            >
              <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3-6 3V5a1 1 0 0 1 1-1z" />
              <path d="M9 9h6M9 12h4" />
            </svg>
            <span className="hidden sm:inline">Activity</span>
          </button>
        ) : null}

        <button
          aria-label="Open settings"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[var(--line)]/70 bg-[var(--surface-input)] px-3 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]"
          onClick={onToggleSettings}
          type="button"
        >
          <svg
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
            viewBox="0 0 24 24"
          >
            <path d="M4 7h16M7 12h13M10 17h10" />
          </svg>
          <span className="hidden sm:inline">Settings</span>
        </button>
      </div>
    </header>
  );
}
