import WebSocket from "ws";

type ElevenLabsBridgeOptions = {
  sampleRate: number;
  onStatus: (message: string) => void;
  onPartialTranscript: (text: string) => void;
  onCommittedTranscript: (text: string) => void;
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

export class ElevenLabsBridge {
  private readonly socket: WebSocket;
  private readonly sampleRate: number;
  private readonly onStatus: (message: string) => void;
  private readonly onPartialTranscript: (text: string) => void;
  private readonly onCommittedTranscript: (text: string) => void;
  private readonly pendingAudioChunks: AudioChunk[] = [];
  private readonly pendingCommitResolvers: Array<() => void> = [];
  private ready = false;
  private hasSentAudio = false;
  private commitInFlight = false;

  constructor(options: ElevenLabsBridgeOptions) {
    this.sampleRate = options.sampleRate;
    this.onStatus = options.onStatus;
    this.onPartialTranscript = options.onPartialTranscript;
    this.onCommittedTranscript = options.onCommittedTranscript;

    const query = new URLSearchParams({
      model_id: "scribe_v2_realtime",
      audio_format: `pcm_${this.sampleRate}`,
      commit_strategy: "manual",
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
      this.onStatus("ElevenLabs connection closed.");
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
    this.socket.send(
      JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: chunk.pcmBase64,
        sample_rate: chunk.sampleRate,
      })
    );
  }

  commit() {
    if (!this.ready || !this.hasSentAudio || this.commitInFlight) {
      return Promise.resolve();
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
    this.socket.close();
  }

  private handleMessage(message: ElevenLabsMessage) {
    if (isSessionStartedMessage(message)) {
      this.ready = true;
      this.onStatus(`ElevenLabs session ${message.session_id.slice(0, 8)} is live.`);
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
}
