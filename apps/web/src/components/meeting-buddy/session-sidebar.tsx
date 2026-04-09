import type { AudioInputDevice } from "@/lib/audio-capture";
import {
  getSessionLanguageLabel,
  sessionLanguageOptions,
  type SessionLanguagePreference,
} from "@realtimebuddy/shared/language-preferences";

import type {
  AudioDiagnostics,
  SessionDetail,
  SessionMetric,
  SessionMode,
} from "@/components/meeting-buddy/types";
import {
  ActionButton,
  FieldLabel,
  MeterBar,
  SectionLabel,
  StatusBadge,
} from "@/components/meeting-buddy/ui";

type SessionSidebarProps = {
  audioDiagnostics: AudioDiagnostics | null;
  audioLevel: number;
  canJoin: boolean;
  canPause: boolean;
  canResume: boolean;
  canStart: boolean;
  canStop: boolean;
  includeTabAudio: boolean;
  languagePreference: SessionLanguagePreference;
  microphones: AudioInputDevice[];
  onCopySessionId: () => void;
  onIncludeTabAudioChange: (checked: boolean) => void;
  onJoinSession: () => void;
  onLanguageChange: (value: SessionLanguagePreference) => void;
  onPauseSession: () => void;
  onResumeSession: () => void;
  onSelectedMicChange: (value: string) => void;
  onSessionIdInputChange: (value: string) => void;
  onStartSession: () => void;
  onStopSession: () => void;
  onTitleChange: (value: string) => void;
  selectedMicId: string;
  selectedMicLabel: string;
  sessionDetails: SessionDetail[];
  sessionHeadline: string;
  sessionId: string;
  sessionIdInput: string;
  sessionMetrics: SessionMetric[];
  sessionMode: SessionMode;
  statusMessage: string;
  statusTone: "active" | "warning" | "neutral";
  title: string;
};

export function SessionSidebar({
  audioDiagnostics,
  audioLevel,
  canJoin,
  canPause,
  canResume,
  canStart,
  canStop,
  includeTabAudio,
  languagePreference,
  microphones,
  onCopySessionId,
  onIncludeTabAudioChange,
  onJoinSession,
  onLanguageChange,
  onPauseSession,
  onResumeSession,
  onSelectedMicChange,
  onSessionIdInputChange,
  onStartSession,
  onStopSession,
  onTitleChange,
  selectedMicId,
  selectedMicLabel,
  sessionDetails,
  sessionHeadline,
  sessionId,
  sessionIdInput,
  sessionMetrics,
  sessionMode,
  statusMessage,
  statusTone,
  title,
}: SessionSidebarProps) {
  return (
    <aside
      className="surface-panel reveal-up min-w-0 rounded-[2rem] px-5 py-6 md:px-6 md:py-6 xl:sticky xl:top-6 xl:self-start"
      style={{ animationDelay: "180ms" }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>Session Control</SectionLabel>
            <StatusBadge live={statusTone === "active"} tone={statusTone}>
              {sessionMode === "companion" ? "Companion" : "Capture"}
            </StatusBadge>
          </div>
          <div>
            <h2 className="text-[1.7rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
              {sessionHeadline}
            </h2>
            <p className="mt-2 text-sm leading-7 text-[var(--foreground-muted)]">{statusMessage}</p>
          </div>
        </div>

        <dl className="grid gap-x-4 gap-y-5 border-y border-white/[0.08] py-5 sm:grid-cols-2">
          {sessionMetrics.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                {metric.label}
              </dt>
              <dd className="mt-1 break-words text-sm font-medium text-[var(--foreground)]">{metric.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-6 space-y-4">
        <label className="flex flex-col gap-2">
          <FieldLabel>Session Title</FieldLabel>
          <input
            className="h-12 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-[var(--foreground-strong)] outline-none transition focus:border-[var(--accent)] focus:bg-white/[0.06]"
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Weekly review"
            value={title}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <label className="flex flex-col gap-2">
            <FieldLabel>Language</FieldLabel>
            <select
              className="h-12 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-[var(--foreground-strong)] outline-none transition focus:border-[var(--accent)] focus:bg-white/[0.06]"
              disabled={!canStart}
              onChange={(event) => onLanguageChange(event.target.value as SessionLanguagePreference)}
              value={languagePreference}
            >
              {sessionLanguageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <FieldLabel>Microphone</FieldLabel>
            <select
              className="h-12 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-[var(--foreground-strong)] outline-none transition focus:border-[var(--accent)] focus:bg-white/[0.06]"
              disabled={!canStart}
              onChange={(event) => onSelectedMicChange(event.target.value)}
              value={selectedMicId}
            >
              <option value="">Browser default microphone</option>
              {microphones.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-[1.4rem] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
          <div>
            <FieldLabel>Capture Mix</FieldLabel>
            <p className="mt-1 text-sm text-[var(--foreground)]">
              {includeTabAudio ? "Microphone + tab audio" : "Microphone only"}
            </p>
          </div>
          <input
            checked={includeTabAudio}
            disabled={!canStart}
            onChange={(event) => onIncludeTabAudioChange(event.target.checked)}
            type="checkbox"
          />
        </label>

        <label className="flex flex-col gap-2">
          <FieldLabel>Companion Session ID</FieldLabel>
          <input
            className="h-12 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 text-[var(--foreground-strong)] outline-none transition focus:border-[var(--accent)] focus:bg-white/[0.06]"
            disabled={!canStart}
            onChange={(event) => onSessionIdInputChange(event.target.value)}
            placeholder="Paste a live session ID to attach here"
            value={sessionIdInput}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <ActionButton disabled={!canJoin} onClick={onJoinSession} type="button">
            Join session
          </ActionButton>
          <ActionButton disabled={!sessionId} onClick={onCopySessionId} type="button">
            Copy session ID
          </ActionButton>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ActionButton disabled={!canStart} onClick={onStartSession} type="button" variant="primary">
            Start capture
          </ActionButton>
          <ActionButton disabled={!canPause} onClick={onPauseSession} type="button">
            Pause
          </ActionButton>
          <ActionButton disabled={!canResume} onClick={onResumeSession} type="button">
            Resume
          </ActionButton>
          <ActionButton disabled={!canStop} onClick={onStopSession} type="button" variant="ghost">
            {sessionMode === "companion" ? "Leave session" : "Stop"}
          </ActionButton>
        </div>
      </div>

      <div className="mt-6 border-t border-white/[0.08] pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <SectionLabel>Mic Level</SectionLabel>
            <p className="mt-2 truncate text-sm text-[var(--foreground)]">{selectedMicLabel}</p>
          </div>
          <span className="mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
            {getSessionLanguageLabel(languagePreference)}
          </span>
        </div>
        <div className="mt-4">
          <MeterBar value={audioLevel} />
        </div>
        {audioDiagnostics ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-[var(--foreground-muted)]">
            <div>
              <dt className="mono text-[0.58rem] uppercase tracking-[0.24em]">RMS</dt>
              <dd className="mt-1 text-[var(--foreground)]">{audioDiagnostics.rms.toFixed(4)}</dd>
            </div>
            <div>
              <dt className="mono text-[0.58rem] uppercase tracking-[0.24em]">Peak</dt>
              <dd className="mt-1 text-[var(--foreground)]">{audioDiagnostics.peak.toFixed(4)}</dd>
            </div>
            <div>
              <dt className="mono text-[0.58rem] uppercase tracking-[0.24em]">Gate</dt>
              <dd className="mt-1 text-[var(--foreground)]">{audioDiagnostics.gateOpen ? "Open" : "Closed"}</dd>
            </div>
            <div>
              <dt className="mono text-[0.58rem] uppercase tracking-[0.24em]">Candidates</dt>
              <dd className="mt-1 text-[var(--foreground)]">{audioDiagnostics.candidateChunks}</dd>
            </div>
            <div>
              <dt className="mono text-[0.58rem] uppercase tracking-[0.24em]">Sent</dt>
              <dd className="mt-1 text-[var(--foreground)]">{audioDiagnostics.sentChunks}</dd>
            </div>
            <div>
              <dt className="mono text-[0.58rem] uppercase tracking-[0.24em]">Dropped</dt>
              <dd className="mt-1 text-[var(--foreground)]">{audioDiagnostics.droppedChunks}</dd>
            </div>
          </dl>
        ) : null}
      </div>

      {sessionDetails.length > 0 ? (
        <div className="mt-6 border-t border-white/[0.08] pt-6">
          <SectionLabel>Session Details</SectionLabel>
          <dl className="mt-4 space-y-4">
            {sessionDetails.map((detail) => (
              <div key={`${detail.label}-${detail.value}`}>
                <dt className="mono text-[0.62rem] uppercase tracking-[0.28em] text-[var(--foreground-muted)]">
                  {detail.label}
                </dt>
                <dd
                  className={`mt-1 break-words text-sm leading-6 text-[var(--foreground)] ${
                    detail.mono ? "mono text-[0.74rem]" : ""
                  }`}
                >
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </aside>
  );
}
