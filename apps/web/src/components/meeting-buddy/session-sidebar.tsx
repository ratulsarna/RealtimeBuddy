import type { ReactNode } from "react";

import type { AudioInputDevice } from "@/lib/audio-capture";
import {
  sessionLanguageOptions,
  type SessionLanguagePreference,
} from "@realtimebuddy/shared/language-preferences";

import { ThemeToggle } from "@/components/meeting-buddy/theme-toggle";
import {
  ActionButton,
  Label,
  cx,
  inputClass,
  textareaClass,
} from "@/components/meeting-buddy/ui";

type SessionSidebarProps = {
  canJoin: boolean;
  canSaveStandingContext: boolean;
  canStart: boolean;
  isSavingStandingContext: boolean;
  languagePreference: SessionLanguagePreference;
  microphones: AudioInputDevice[];
  onCopySessionId: () => void;
  onJoinSession: () => void;
  onLanguageChange: (value: SessionLanguagePreference) => void;
  onSaveStandingContext: () => void;
  onSelectedMicChange: (value: string) => void;
  onSessionIdInputChange: (value: string) => void;
  onStaticUserSeedChange: (value: string) => void;
  selectedMicId: string;
  sessionId: string;
  sessionIdInput: string;
  staticUserSeed: string;
};

function SettingsSection({
  children,
  title,
  withDivider = false,
}: {
  children: ReactNode;
  title: string;
  withDivider?: boolean;
}) {
  return (
    <section
      className={cx(
        "space-y-4",
        withDivider && "border-t border-[var(--line)]/60 pt-6"
      )}
    >
      <p className="display text-[0.95rem] font-medium tracking-[-0.01em] text-[var(--foreground-strong)]">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function SessionSidebar({
  canJoin,
  canSaveStandingContext,
  canStart,
  isSavingStandingContext,
  languagePreference,
  microphones,
  onCopySessionId,
  onJoinSession,
  onLanguageChange,
  onSaveStandingContext,
  onSelectedMicChange,
  onSessionIdInputChange,
  onStaticUserSeedChange,
  selectedMicId,
  sessionId,
  sessionIdInput,
  staticUserSeed,
}: SessionSidebarProps) {
  const showCompanionSection =
    canStart || Boolean(sessionId) || Boolean(sessionIdInput.trim());
  const defaultMicrophone = microphones.find((device) => device.deviceId === "default");
  const nonDefaultMicrophones = microphones.filter((device) => device.deviceId !== "default");

  return (
    <div className="space-y-7 px-6 py-6">
      <SettingsSection title="Capture">
        <label className="flex flex-col gap-2">
          <Label>Microphone</Label>
          <select
            className={inputClass}
            disabled={!canStart}
            onChange={(event) => onSelectedMicChange(event.target.value)}
            value={selectedMicId}
          >
            <option value={defaultMicrophone?.deviceId ?? ""}>
              {defaultMicrophone?.label || "System default microphone"}
            </option>
            {nonDefaultMicrophones.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <Label>Language</Label>
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
      </SettingsSection>

      <SettingsSection title="Standing context">
        <p className="text-[0.82rem] leading-6 text-[var(--foreground-muted)]">
          The background Buddy should keep in mind across every meeting — tools, ongoing work, the way you like notes written.
        </p>
        <label className="flex flex-col gap-2">
          <textarea
            className={cx(textareaClass, "min-h-[10rem]")}
            disabled={!canStart}
            onChange={(event) => onStaticUserSeedChange(event.target.value)}
            placeholder="e.g. I'm a PM at a fintech startup. Watch for decisions that slip past without owners. Prefer short bullet summaries."
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
            {isSavingStandingContext ? "Saving…" : "Save context"}
          </ActionButton>
        </div>
      </SettingsSection>

      {showCompanionSection ? (
        <SettingsSection title="Join a live session">
          <p className="text-[0.82rem] leading-6 text-[var(--foreground-muted)]">
            Paste a session ID someone else is running to follow along.
          </p>
          <label className="flex flex-col gap-2">
            <Label>Session ID</Label>
            <input
              className={inputClass}
              disabled={!canStart}
              onChange={(event) => onSessionIdInputChange(event.target.value)}
              placeholder="Paste a live session ID"
              value={sessionIdInput}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <ActionButton disabled={!canJoin} onClick={onJoinSession} size="sm">
              Join
            </ActionButton>
            <ActionButton
              disabled={!sessionId}
              onClick={onCopySessionId}
              size="sm"
              variant="ghost"
            >
              Copy my session ID
            </ActionButton>
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection title="Appearance" withDivider>
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--surface-raised)] px-4 py-3">
          <div>
            <Label>Theme</Label>
            <p className="mt-1 text-[0.82rem] leading-6 text-[var(--foreground-muted)]">
              Switch between the warm light and dark shells.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </SettingsSection>
    </div>
  );
}
