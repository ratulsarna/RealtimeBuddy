import WebSocket from "ws";

type ElevenLabsBridgeOptions = {
  sampleRate: number;
  languageCode?: string;
  previousText?: string;
  onStatus: (message: string) => void;
  onReady: () => void;
  onPartialTranscript: (text: string) => void;
  onCommittedTranscript: (text: string) => void;
  onClose: (details: {
    code: number;
    reason: string;
    intentional: boolean;
  }) => void;
};

type SessionStartedMessage = {
  message_type: "session_started";
  session_id: string;
};

type PartialTranscriptMessage = {
  message_type: "partial_transcript";
  text: string;
};

type CommittedTranscriptMessage = {
  message_type: "committed_transcript";
  text: string;
};

type ElevenLabsMessage =
  | SessionStartedMessage
  | PartialTranscriptMessage
  | CommittedTranscriptMessage
  | {
      message_type: string;
      message?: string;
    };

type AudioChunk = {
  pcmBase64: string;
  sampleRate: number;
};

function isSessionStartedMessage(
  message: ElevenLabsMessage
): message is SessionStartedMessage {
  return message.message_type === "session_started";
}

function isPartialTranscriptMessage(
  message: ElevenLabsMessage
): message is PartialTranscriptMessage {
  return message.message_type === "partial_transcript";
}

function isCommittedTranscriptMessage(
  message: ElevenLabsMessage
): message is CommittedTranscriptMessage {
  return message.message_type === "committed_transcript";
}

const ELEVENLABS_ENDPOINT = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

export function buildRealtimeTranscriptionQuery(options: {
  sampleRate: number;
  languageCode?: string;
}) {
  const query = new URLSearchParams({
    model_id: "scribe_v2_realtime",
    audio_format: `pcm_${options.sampleRate}`,
    commit_strategy: "manual",
  });
  if (options.languageCode) {
    query.set("language_code", options.languageCode);
  }
  return query;
}

export class ElevenLabsBridge {
  private readonly socket: WebSocket;
  private readonly sampleRate: number;
  private previousText: string;
  private readonly onStatus: (message: string) => void;
  private readonly onReady: () => void;
  private readonly onPartialTranscript: (text: string) => void;
  private readonly onCommittedTranscript: (text: string) => void;
  private readonly onClose: (details: {
    code: number;
    reason: string;
    intentional: boolean;
  }) => void;
  private readonly pendingAudioChunks: AudioChunk[] = [];
  private readonly pendingCommitResolvers: Array<() => void> = [];
  private ready = false;
  private hasSentAudio = false;
  private commitInFlight = false;
  private intentionalClose = false;

  constructor(options: ElevenLabsBridgeOptions) {
    this.sampleRate = options.sampleRate;
    this.previousText = options.previousText?.trim() ?? "";
    this.onStatus = options.onStatus;
    this.onReady = options.onReady;
    this.onPartialTranscript = options.onPartialTranscript;
    this.onCommittedTranscript = options.onCommittedTranscript;
    this.onClose = options.onClose;

    const query = buildRealtimeTranscriptionQuery({
      sampleRate: this.sampleRate,
      languageCode: options.languageCode,
    });

    this.socket = new WebSocket(`${ELEVENLABS_ENDPOINT}?${query.toString()}`, {
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "",
      },
    });

    this.socket.on("message", (payload) => {
      const message = JSON.parse(payload.toString()) as ElevenLabsMessage;
      this.handleMessage(message);
    });

    this.socket.on("close", () => {
      this.ready = false;
      this.commitInFlight = false;
      this.resolvePendingCommits();
    });

    this.socket.on("close", (code, reasonBuffer) => {
      this.onClose({
        code,
        reason: reasonBuffer.toString("utf8"),
        intentional: this.intentionalClose,
      });
    });

    this.socket.on("error", (error) => {
      this.onStatus(`ElevenLabs error: ${String(error)}`);
    });
  }

  sendAudioChunk(chunk: AudioChunk) {
    if (!this.ready || this.commitInFlight) {
      this.pendingAudioChunks.push(chunk);
      return;
    }

    this.hasSentAudio = true;
    const previousText = this.previousText;
    this.previousText = "";
    this.socket.send(
      JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: chunk.pcmBase64,
        sample_rate: chunk.sampleRate,
        previous_text: previousText || undefined,
      })
    );
  }

  commit() {
    if (!this.ready || !this.hasSentAudio || this.commitInFlight) {
      return null;
    }

    return new Promise<void>((resolve) => {
      this.commitInFlight = true;
      this.pendingCommitResolvers.push(resolve);
      this.socket.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: "",
          commit: true,
          sample_rate: this.sampleRate,
        })
      );
    });
  }

  close() {
    this.intentionalClose = true;
    this.socket.close();
  }

  drainPendingAudioChunks() {
    const drainedChunks = [...this.pendingAudioChunks];
    this.pendingAudioChunks.length = 0;
    return drainedChunks;
  }

  private handleMessage(message: ElevenLabsMessage) {
    if (isSessionStartedMessage(message)) {
      this.ready = true;
      this.intentionalClose = false;
      this.onStatus(`ElevenLabs session ${message.session_id.slice(0, 8)} is live.`);
      this.onReady();
      this.flushQueuedAudio();
      return;
    }

    if (isPartialTranscriptMessage(message)) {
      this.onPartialTranscript(message.text);
      return;
    }

    if (isCommittedTranscriptMessage(message)) {
      this.onCommittedTranscript(message.text);
      this.commitInFlight = false;
      this.pendingCommitResolvers.shift()?.();
      this.flushQueuedAudio();
      return;
    }

    this.onStatus(message.message ?? `ElevenLabs message: ${message.message_type}`);
  }

  private flushQueuedAudio() {
    for (const chunk of this.pendingAudioChunks) {
      this.sendAudioChunk(chunk);
    }
    this.pendingAudioChunks.length = 0;
  }

  private resolvePendingCommits() {
    while (this.pendingCommitResolvers.length > 0) {
      this.pendingCommitResolvers.shift()?.();
    }
  }
}
