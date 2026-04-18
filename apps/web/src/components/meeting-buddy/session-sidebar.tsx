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
  Toggle,
  inputClass,
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
  onClose?: () => void;
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
  onClose,
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
    <div className="flex flex-col">
      {/* Drawer header — only rendered when used as a mobile drawer */}
      {onClose ? (
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--foreground-strong)]">Settings</span>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--foreground-muted)] transition hover:bg-white/[0.06] hover:text-[var(--foreground)]"
            onClick={onClose}
            type="button"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : null}

      <div className="p-4">
        {/* ── Status ── */}
        <div className="pb-4">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>Session</SectionLabel>
            <StatusBadge live={statusTone === "active"} tone={statusTone}>
              {sessionMode === "companion" ? "Companion" : "Capture"}
            </StatusBadge>
          </div>
          <h2 className="mt-2 text-base font-semibold tracking-tight text-[var(--foreground-strong)]">
            {sessionHeadline}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">{statusMessage}</p>
        </div>

        {/* ── Metrics ── */}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-y border-[var(--line)] py-3">
          {sessionMetrics.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="mono text-[0.52rem] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
                {metric.label}
              </dt>
              <dd className="mt-0.5 truncate text-xs font-medium text-[var(--foreground)]">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* ── Configure ── */}
        <div className="space-y-3 border-b border-[var(--line)] py-4">
          <SectionLabel>Configure</SectionLabel>

          <label className="flex flex-col gap-1">
            <FieldLabel>Session Title</FieldLabel>
            <input
              className={inputClass}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Weekly review"
              value={title}
            />
          </label>

          <label className="flex flex-col gap-1">
            <FieldLabel>Language</FieldLabel>
            <select
              className={inputClass}
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

          <label className="flex flex-col gap-1">
            <FieldLabel>Microphone</FieldLabel>
            <select
              className={inputClass}
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

          <div className="flex items-center justify-between gap-3 py-1">
            <div>
              <FieldLabel>Include tab audio</FieldLabel>
              <p className="mt-0.5 text-xs text-[var(--foreground)]">
                {includeTabAudio ? "Mic + tab audio" : "Mic only"}
              </p>
            </div>
            <Toggle checked={includeTabAudio} disabled={!canStart} onChange={onIncludeTabAudioChange} />
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="grid grid-cols-2 gap-2 border-b border-[var(--line)] py-4">
          <ActionButton disabled={!canStart} onClick={onStartSession} size="sm" variant="primary">
            Start capture
          </ActionButton>
          <ActionButton disabled={!canPause} onClick={onPauseSession} size="sm">
            Pause
          </ActionButton>
          <ActionButton disabled={!canResume} onClick={onResumeSession} size="sm">
            Resume
          </ActionButton>
          <ActionButton disabled={!canStop} onClick={onStopSession} size="sm" variant="ghost">
            {sessionMode === "companion" ? "Leave" : "Stop"}
          </ActionButton>
        </div>

        {/* ── Companion ── */}
        <div className="space-y-2 border-b border-[var(--line)] py-4">
          <SectionLabel>Companion</SectionLabel>
          <label className="flex flex-col gap-1">
            <FieldLabel>Session ID</FieldLabel>
            <input
              className={inputClass}
              disabled={!canStart}
              onChange={(event) => onSessionIdInputChange(event.target.value)}
              placeholder="Paste a session ID"
              value={sessionIdInput}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton disabled={!canJoin} onClick={onJoinSession} size="sm">
              Join
            </ActionButton>
            <ActionButton disabled={!sessionId} onClick={onCopySessionId} size="sm">
              Copy ID
            </ActionButton>
          </div>
        </div>

        {/* ── Mic Level ── */}
        <div className="border-b border-[var(--line)] py-4">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>Mic Level</SectionLabel>
            <span className="mono text-[0.52rem] uppercase tracking-[0.22em] text-[var(--foreground-muted)]">
              {getSessionLanguageLabel(languagePreference)}
            </span>
          </div>
          <div className="mt-3">
            <MeterBar value={audioLevel} />
          </div>
          <p className="mt-2 truncate text-xs text-[var(--foreground-muted)]">{selectedMicLabel}</p>

          {audioDiagnostics ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              <div>
                <dt className="mono text-[0.48rem] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">RMS</dt>
                <dd className="mt-0.5 mono text-[0.65rem] text-[var(--foreground)]">{audioDiagnostics.rms.toFixed(4)}</dd>
              </div>
              <div>
                <dt className="mono text-[0.48rem] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">Peak</dt>
                <dd className="mt-0.5 mono text-[0.65rem] text-[var(--foreground)]">{audioDiagnostics.peak.toFixed(4)}</dd>
              </div>
              <div>
                <dt className="mono text-[0.48rem] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">Gate</dt>
                <dd className="mt-0.5 mono text-[0.65rem] text-[var(--foreground)]">{audioDiagnostics.gateOpen ? "Open" : "Closed"}</dd>
              </div>
              <div>
                <dt className="mono text-[0.48rem] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">Candidates</dt>
                <dd className="mt-0.5 mono text-[0.65rem] text-[var(--foreground)]">{audioDiagnostics.candidateChunks}</dd>
              </div>
              <div>
                <dt className="mono text-[0.48rem] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">Sent</dt>
                <dd className="mt-0.5 mono text-[0.65rem] text-[var(--foreground)]">{audioDiagnostics.sentChunks}</dd>
              </div>
              <div>
                <dt className="mono text-[0.48rem] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">Dropped</dt>
                <dd className="mt-0.5 mono text-[0.65rem] text-[var(--foreground)]">{audioDiagnostics.droppedChunks}</dd>
              </div>
            </dl>
          ) : null}
        </div>

        {/* ── Session Details ── */}
        {sessionDetails.length > 0 ? (
          <div className="pt-4">
            <SectionLabel>Details</SectionLabel>
            <dl className="mt-2 space-y-2">
              {sessionDetails.map((detail) => (
                <div key={`${detail.label}-${detail.value}`}>
                  <dt className="mono text-[0.48rem] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
                    {detail.label}
                  </dt>
                  <dd
                    className={`mt-0.5 break-words text-xs leading-5 text-[var(--foreground)] ${
                      detail.mono ? "mono text-[0.65rem]" : ""
                    }`}
                  >
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}
