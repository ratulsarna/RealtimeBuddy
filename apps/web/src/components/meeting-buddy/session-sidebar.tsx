import type { ReactNode } from "react";

import type { AudioInputDevice } from "@/lib/audio-capture";
import {
  sessionLanguageOptions,
  type SessionLanguagePreference,
} from "@realtimebuddy/shared/language-preferences";

import type { SessionMode } from "@/components/meeting-buddy/types";
import { ThemeToggle } from "@/components/meeting-buddy/theme-toggle";
import {
  ActionButton,
  FieldLabel,
  SectionLabel,
  Toggle,
  cx,
  inputClass,
  textareaClass,
} from "@/components/meeting-buddy/ui";

type SessionSidebarProps = {
  canJoin: boolean;
  canPause: boolean;
  canReset: boolean;
  canResume: boolean;
  canSaveStandingContext: boolean;
  canStart: boolean;
  canStop: boolean;
  includeTabAudio: boolean;
  isSavingStandingContext: boolean;
  languagePreference: SessionLanguagePreference;
  microphones: AudioInputDevice[];
  onClose?: () => void;
  onCopySessionId: () => void;
  onIncludeTabAudioChange: (checked: boolean) => void;
  onJoinSession: () => void;
  onLanguageChange: (value: SessionLanguagePreference) => void;
  onPauseSession: () => void;
  onResetSession: () => void;
  onResumeSession: () => void;
  onSaveStandingContext: () => void;
  onSelectedMicChange: (value: string) => void;
  onSessionIdInputChange: (value: string) => void;
  onStaticUserSeedChange: (value: string) => void;
  onStopSession: () => void;
  onTitleChange: (value: string) => void;
  selectedMicId: string;
  sessionId: string;
  sessionIdInput: string;
  sessionMode: SessionMode;
  staticUserSeed: string;
  title: string;
};

function SettingsSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-4 border-t border-[var(--line)]/70 pt-5 first:border-t-0 first:pt-0">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

export function SessionSidebar({
  canJoin,
  canPause,
  canReset,
  canResume,
  canSaveStandingContext,
  canStart,
  canStop,
  includeTabAudio,
  isSavingStandingContext,
  languagePreference,
  microphones,
  onClose,
  onCopySessionId,
  onIncludeTabAudioChange,
  onJoinSession,
  onLanguageChange,
  onPauseSession,
  onResetSession,
  onResumeSession,
  onSaveStandingContext,
  onSelectedMicChange,
  onSessionIdInputChange,
  onStaticUserSeedChange,
  onStopSession,
  onTitleChange,
  selectedMicId,
  sessionId,
  sessionIdInput,
  sessionMode,
  staticUserSeed,
  title,
}: SessionSidebarProps) {
  const showSessionActions = canPause || canResume || canStop || canReset;
  const showCompanionSection = canStart || Boolean(sessionId) || Boolean(sessionIdInput.trim());

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line)]/70 px-6 py-4">
        <div>
          <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
            Settings
          </p>
          <p className="mt-1 text-sm text-[var(--foreground)]">
            Keep the session setup close at hand.
          </p>
        </div>
        {onClose ? (
          <button
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--line)]/70 text-[var(--foreground-muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            onClick={onClose}
            type="button"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <SettingsSection title="Session">
          <label className="flex flex-col gap-2">
            <FieldLabel>Session title</FieldLabel>
            <input
              className={inputClass}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Optional title"
              value={title}
            />
          </label>

          {showSessionActions ? (
            <div className="grid grid-cols-2 gap-2">
              <ActionButton disabled={!canPause} onClick={onPauseSession} size="sm">
                Pause
              </ActionButton>
              <ActionButton disabled={!canResume} onClick={onResumeSession} size="sm">
                Resume
              </ActionButton>
              <ActionButton disabled={!canStop} onClick={onStopSession} size="sm" variant="ghost">
                {sessionMode === "companion" ? "Leave" : "Stop"}
              </ActionButton>
              <ActionButton disabled={!canReset} onClick={onResetSession} size="sm" variant="ghost">
                Reset
              </ActionButton>
            </div>
          ) : null}
        </SettingsSection>

        <SettingsSection title="Capture">
          <label className="flex flex-col gap-2">
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

          <label className="flex flex-col gap-2">
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

          <div className="flex items-start justify-between gap-4 rounded-3xl bg-[var(--surface-raised)] px-4 py-3">
            <div className="space-y-1">
              <FieldLabel className="text-[0.72rem]">Include tab audio</FieldLabel>
              <p className="text-sm leading-6 text-[var(--foreground-muted)]">
                {includeTabAudio ? "Capture mic and tab audio together." : "Capture microphone only."}
              </p>
            </div>
            <Toggle checked={includeTabAudio} disabled={!canStart} onChange={onIncludeTabAudioChange} />
          </div>
        </SettingsSection>

        <SettingsSection title="Standing Context">
          <label className="flex flex-col gap-2">
            <FieldLabel>Context</FieldLabel>
            <textarea
              className={cx(textareaClass, "min-h-[10rem]")}
              disabled={!canStart}
              onChange={(event) => onStaticUserSeedChange(event.target.value)}
              placeholder="Preferred tools, recurring context, note conventions, or what you want Buddy to notice across meetings."
              rows={5}
              value={staticUserSeed}
            />
          </label>

          <div className="flex justify-end">
            <ActionButton
              disabled={!canSaveStandingContext}
              onClick={onSaveStandingContext}
              size="sm"
              type="button"
            >
              {isSavingStandingContext ? "Saving..." : "Save context"}
            </ActionButton>
          </div>
        </SettingsSection>

        {showCompanionSection ? (
          <SettingsSection title="Companion">
            <label className="flex flex-col gap-2">
              <FieldLabel>Session ID</FieldLabel>
              <input
                className={inputClass}
                disabled={!canStart}
                onChange={(event) => onSessionIdInputChange(event.target.value)}
                placeholder="Paste a live session ID"
                value={sessionIdInput}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <ActionButton disabled={!canJoin} onClick={onJoinSession} size="sm">
                Join
              </ActionButton>
              <ActionButton disabled={!sessionId} onClick={onCopySessionId} size="sm" variant="ghost">
                Copy ID
              </ActionButton>
            </div>
          </SettingsSection>
        ) : null}

        <SettingsSection title="Appearance">
          <div className="flex items-center justify-between rounded-3xl bg-[var(--surface-raised)] px-4 py-3">
            <div>
              <FieldLabel className="text-[0.72rem]">Theme</FieldLabel>
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                Toggle the light and dark shell.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
