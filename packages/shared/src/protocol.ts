import type { SessionLanguagePreference } from "./language-preferences";

export type SessionRole = "capture" | "companion";
export type SessionCaptureState = "live" | "paused" | "stopped";

export type ClientEvent =
  | {
      type: "start_session";
      sessionId?: string;
      role?: SessionRole;
      sampleRate: number;
      title: string;
      includeTabAudio: boolean;
      languagePreference: SessionLanguagePreference;
    }
  | {
      type: "join_session";
      sessionId: string;
      role?: SessionRole;
    }
  | {
      type: "audio_chunk";
      pcmBase64: string;
      sampleRate: number;
    }
  | {
      type: "audio_debug";
      rms: number;
      peak: number;
      gateOpen: boolean;
      openThreshold: number;
      closeThreshold: number;
      candidateChunks: number;
      sentChunks: number;
      droppedChunks: number;
    }
  | {
      type: "commit_transcript";
    }
  | {
      type: "pause_session";
    }
  | {
      type: "resume_session";
    }
  | {
      type: "ask";
      question: string;
    }
  | {
      type: "stop_session";
    };

export type ServerEvent =
  | {
      type: "session_ready";
      sessionId: string;
      title: string;
      includeTabAudio: boolean;
      languagePreference: SessionLanguagePreference;
      notePath: string;
      notePathRelative: string;
      logPath: string;
      logPathRelative: string;
      model: string;
    }
  | {
      type: "buddy_ready";
      model: string;
    }
  | {
      type: "session_snapshot";
      sessionId: string;
      title: string;
      includeTabAudio: boolean;
      languagePreference: SessionLanguagePreference;
      notePath: string;
      notePathRelative: string;
      logPath: string;
      logPathRelative: string;
      model: string;
      partialTranscript: string;
      provisionalEntries: Array<{
        id: string;
        text: string;
        provisionalAt: string;
      }>;
      transcriptEntries: Array<{
        text: string;
        committedAt: string;
      }>;
      questionAnswers: Array<{
        question: string;
        answer: string;
        askedAt: string;
      }>;
      markdown: string;
      captureState: SessionCaptureState;
      statusMessage: string;
      captureClients: number;
      companionClients: number;
    }
  | {
      type: "status";
      message: string;
    }
  | {
      type: "capture_client_disconnected";
      message: string;
    }
  | {
      type: "transcript_partial";
      text: string;
    }
  | {
      type: "transcript_provisional";
      provisionalId: string;
      text: string;
      provisionalAt: string;
    }
  | {
      type: "transcript_committed";
      resolvedProvisionalId: string;
      text: string;
      committedAt: string;
    }
  | {
      type: "notes_updated";
      markdown: string;
    }
  | {
      type: "session_paused";
    }
  | {
      type: "session_resumed";
    }
  | {
      type: "answer_delta";
      delta: string;
    }
  | {
      type: "answer_done";
      text: string;
    }
  | {
      type: "session_stopped";
    }
  | {
      type: "error";
      message: string;
    };

export function parseClientEvent(raw: string): ClientEvent {
  return JSON.parse(raw) as ClientEvent;
}

export function serializeServerEvent(event: ServerEvent): string {
  return JSON.stringify(event);
}
