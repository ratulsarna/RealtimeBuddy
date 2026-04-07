export type ClientEvent =
  | {
      type: "start_session";
      sampleRate: number;
      title: string;
      includeTabAudio: boolean;
    }
  | {
      type: "audio_chunk";
      pcmBase64: string;
      sampleRate: number;
    }
  | {
      type: "commit_transcript";
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
      notePath: string;
      notePathRelative: string;
      logPath: string;
      logPathRelative: string;
      model: string;
    }
  | {
      type: "status";
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
