import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildMeetingNote } from "./note-builder";
import { ElevenLabsBridge } from "./elevenlabs-bridge";
import { CodexAppServer } from "./codex-app-server";

type AudioChunk = {
  pcmBase64: string;
  sampleRate: number;
};

type SendEvent = (event:
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
    }) => void;

type MeetingSessionOptions = {
  sampleRate: number;
  title: string;
  includeTabAudio: boolean;
  sendEvent: SendEvent;
};

type TranscriptSegment = {
  text: string;
  committedAt: string;
};

type ProvisionalSegment = {
  id: string;
  text: string;
  provisionalAt: string;
};

type QuestionAnswer = {
  question: string;
  answer: string;
  askedAt: string;
};

const DEFAULT_VAULT_PATH = "/Users/ratulsarna/Vault/ObsidianVault";
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_APP_DIR = path.resolve(SERVER_DIR, "../..");

export class MeetingSession {
  readonly id = crypto.randomUUID();
  private readonly sampleRate: number;
  private readonly title: string;
  private readonly includeTabAudio: boolean;
  private readonly sendEvent: SendEvent;
  private readonly transcriptSegments: TranscriptSegment[] = [];
  private readonly provisionalSegments: ProvisionalSegment[] = [];
  private readonly questionAnswers: QuestionAnswer[] = [];
  private readonly startedAt = new Date();
  private readonly vaultPath = process.env.OBSIDIAN_VAULT_PATH ?? DEFAULT_VAULT_PATH;
  private readonly notePath: string;
  private readonly notePathRelative: string;
  private readonly logPath: string;
  private readonly logPathRelative: string;
  private readonly codex = new CodexAppServer();
  private readonly audioQueue: AudioChunk[] = [];
  private readonly pendingCommitProvisionalIds: string[] = [];

  private elevenLabs: ElevenLabsBridge | null = null;
  private partialTranscript = "";
  private lastProvisionalText = "";
  private askQueue = Promise.resolve();
  private commitQueue = Promise.resolve();
  private audioChunkCount = 0;
  private bridgeReady = false;
  private bridgeConnecting = false;
  private bridgeConnectionAttempts = 0;
  private stopped = false;

  constructor(options: MeetingSessionOptions) {
    this.sampleRate = options.sampleRate;
    this.title = options.title.trim() || "Meeting Buddy";
    this.includeTabAudio = options.includeTabAudio;
    this.sendEvent = options.sendEvent;

    const noteFolder = path.join(this.vaultPath, "Notes", "Dated", this.dateStamp(this.startedAt));
    const noteFileName = `${this.title} - ${this.fileStamp(this.startedAt)}.md`;
    this.notePath = path.join(noteFolder, noteFileName);
    this.notePathRelative = path.relative(this.vaultPath, this.notePath);

    const logFolder = path.join(WEB_APP_DIR, "output", "session-logs", this.dateStamp(this.startedAt));
    const logFileName = `${this.title} - ${this.fileStamp(this.startedAt)}.jsonl`;
    this.logPath = path.join(logFolder, logFileName);
    this.logPathRelative = path.relative(WEB_APP_DIR, this.logPath);
  }

  async start() {
    await mkdir(path.dirname(this.notePath), { recursive: true });
    await mkdir(path.dirname(this.logPath), { recursive: true });
    await this.writeNote();
    await this.logEvent("session_started", {
      notePath: this.notePathRelative,
      logPath: this.logPathRelative,
      includeTabAudio: this.includeTabAudio,
      sampleRate: this.sampleRate,
    });

    this.ensureElevenLabsConnected();

    await this.codex.ready();

    this.sendEvent({
      type: "session_ready",
      sessionId: this.id,
      notePath: this.notePath,
      notePathRelative: this.notePathRelative,
      logPath: this.logPath,
      logPathRelative: this.logPathRelative,
      model: await this.codex.getSelectedModel(),
    });
    this.sendEvent({ type: "notes_updated", markdown: this.currentMarkdown() });
    await this.logEvent("session_ready", {
      model: await this.codex.getSelectedModel(),
    });

    this.flushQueuedAudio();
  }

  pushAudioChunk(chunk: AudioChunk) {
    if (!this.elevenLabs || !this.bridgeReady) {
      this.audioQueue.push(chunk);
      this.ensureElevenLabsConnected();
      return;
    }

    this.audioChunkCount += 1;
    if (this.audioChunkCount % 25 === 0) {
      void this.logEvent("audio_chunks_received", {
        count: this.audioChunkCount,
        sampleRate: chunk.sampleRate,
      });
    }

    this.elevenLabs.sendAudioChunk(chunk);
  }

  logAudioDebug(diagnostics: {
    rms: number;
    peak: number;
    gateOpen: boolean;
    openThreshold: number;
    closeThreshold: number;
    candidateChunks: number;
    sentChunks: number;
    droppedChunks: number;
  }) {
    void this.logEvent("audio_debug", {
      rms: Number(diagnostics.rms.toFixed(4)),
      peak: Number(diagnostics.peak.toFixed(4)),
      gateOpen: diagnostics.gateOpen,
      openThreshold: Number(diagnostics.openThreshold.toFixed(4)),
      closeThreshold: Number(diagnostics.closeThreshold.toFixed(4)),
      candidateChunks: diagnostics.candidateChunks,
      sentChunks: diagnostics.sentChunks,
      droppedChunks: diagnostics.droppedChunks,
    });
  }

  ask(question: string) {
    this.askQueue = this.askQueue.then(async () => {
      await this.commitTranscript();
      const askedAt = this.timeStamp(new Date());
      let answer = "";
      let pendingAnswerDelta = "";
      let answerDeltaTimer: NodeJS.Timeout | null = null;
      await this.logEvent("ask_started", {
        question,
        committedTranscriptSegments: this.transcriptSegments.length,
        hadPartialTranscript: Boolean(this.partialTranscript.trim()),
      });

      const context = this.buildQuestionContext();
      const text = await this.codex.askQuestion(question, context, (delta) => {
        answer += delta;
        pendingAnswerDelta += delta;
        if (answerDeltaTimer === null) {
          answerDeltaTimer = setTimeout(() => {
            this.sendEvent({ type: "answer_delta", delta: pendingAnswerDelta });
            pendingAnswerDelta = "";
            answerDeltaTimer = null;
          }, 120);
        }
      });

      if (answerDeltaTimer !== null) {
        clearTimeout(answerDeltaTimer);
      }
      if (pendingAnswerDelta) {
        this.sendEvent({ type: "answer_delta", delta: pendingAnswerDelta });
      }

      answer = text || answer;
      this.questionAnswers.unshift({
        question,
        answer,
        askedAt,
      });

      await this.writeNote();
      await this.logEvent("ask_completed", {
        question,
        answer,
      });
      this.sendEvent({ type: "answer_done", text: answer });
      this.sendEvent({ type: "notes_updated", markdown: this.currentMarkdown() });
    });

    return this.askQueue;
  }

  commitTranscript() {
    this.commitQueue = this.commitQueue.then(async () => {
      if (!this.elevenLabs || !this.bridgeReady) {
        return;
      }

      const commitPromise = this.elevenLabs.commit();
      if (!commitPromise) {
        return;
      }

      // A pause/stop can land before ElevenLabs has emitted a partial transcript.
      // Commit anyway so already-sent audio is finalized, but only snapshot a
      // provisional segment when we have actual partial text to reconcile.
      const provisionalId = this.partialTranscript.trim() ? this.snapshotPartialTranscript() : "";
      if (provisionalId) {
        this.pendingCommitProvisionalIds.push(provisionalId);
      }
      await this.logEvent("commit_requested", {
        provisionalId: provisionalId || "none",
        partialTranscript: this.partialTranscript,
      });
      await commitPromise;
    });

    return this.commitQueue;
  }

  async stop() {
    this.stopped = true;
    await this.commitTranscript();
    this.elevenLabs?.close();
    this.elevenLabs = null;
    this.bridgeReady = false;
    this.bridgeConnecting = false;
    this.codex.close();
    await this.writeNote();
    await this.logEvent("session_stopped", {
      transcriptSegments: this.transcriptSegments.length,
      questionsAnswered: this.questionAnswers.length,
      audioChunksReceived: this.audioChunkCount,
    });
    this.sendEvent({ type: "session_stopped" });
  }

  private async handleCommittedTranscript(text: string) {
    const committedText = text.trim();
    if (!committedText) {
      return;
    }

    this.partialTranscript = "";
    this.lastProvisionalText = "";
    const resolvedProvisionalId = this.resolveCommittedProvisional(committedText);
    const committedAt = this.timeStamp(new Date());

    this.transcriptSegments.push({
      text: committedText,
      committedAt,
    });

    await this.writeNote();
    await this.logEvent("transcript_committed", {
      text: committedText,
      committedAt,
      resolvedProvisionalId: resolvedProvisionalId || "none",
      totalCommittedSegments: this.transcriptSegments.length,
    });
    this.sendEvent({
      type: "transcript_committed",
      text: committedText,
      committedAt,
      resolvedProvisionalId,
    });
    this.sendEvent({ type: "notes_updated", markdown: this.currentMarkdown() });
  }

  private flushQueuedAudio() {
    if (!this.elevenLabs || !this.bridgeReady) {
      return;
    }

    const queuedChunkCount = this.audioQueue.length;
    for (const chunk of this.audioQueue) {
      this.elevenLabs.sendAudioChunk(chunk);
    }
    this.audioQueue.length = 0;
    if (queuedChunkCount > 0) {
      void this.logEvent("audio_queue_flushed", {
        count: queuedChunkCount,
      });
    }
  }

  private buildQuestionContext() {
    const transcriptContext = this.transcriptSegments
      .slice(-24)
      .map((segment) => `- [${segment.committedAt}] ${segment.text}`)
      .join("\n");
    const provisionalContext = this.provisionalSegments
      .slice(-8)
      .map((segment) => `- [pending ${segment.provisionalAt}] ${segment.text}`)
      .join("\n");

    return [
      this.currentMarkdown(),
      "",
      "Recent transcript excerpts:",
      [transcriptContext, provisionalContext].filter(Boolean).join("\n") ||
        "- No committed transcript yet.",
    ].join("\n");
  }

  private currentMarkdown() {
    return buildMeetingNote({
      title: this.title,
      startedAt: this.formatDateTime(this.startedAt),
      includeTabAudio: this.includeTabAudio,
      transcriptSegments: this.transcriptSegments,
      provisionalSegments: this.provisionalSegments,
      partialTranscript: this.partialTranscript,
      questionAnswers: this.questionAnswers,
    });
  }

  private async writeNote() {
    await writeFile(this.notePath, this.currentMarkdown(), "utf8");
  }

  private async logEvent(type: string, payload: Record<string, string | number | boolean>) {
    await appendFile(
      this.logPath,
      `${JSON.stringify({
        at: new Date().toISOString(),
        sessionId: this.id,
        type,
        ...payload,
      })}\n`,
      "utf8"
    );
  }

  private ensureElevenLabsConnected() {
    if (this.stopped || this.elevenLabs || this.bridgeConnecting) {
      return;
    }

    const previousText = this.reconnectionContext();
    this.bridgeConnecting = true;
    this.bridgeConnectionAttempts += 1;
    void this.logEvent("elevenlabs_connecting", {
      attempt: this.bridgeConnectionAttempts,
      bufferedAudioChunks: this.audioQueue.length,
      previousTextLength: previousText.length,
    });

    const bridge = new ElevenLabsBridge({
      sampleRate: this.sampleRate,
      previousText,
      onStatus: (message) => {
        if (this.elevenLabs !== bridge) {
          return;
        }

        void this.logEvent("status", { message });
        this.sendEvent({ type: "status", message });
      },
      onReady: () => {
        if (this.elevenLabs !== bridge) {
          return;
        }

        this.bridgeConnecting = false;
        this.bridgeReady = true;
        void this.logEvent("elevenlabs_ready", {
          attempt: this.bridgeConnectionAttempts,
        });
        this.flushQueuedAudio();
      },
      onPartialTranscript: (text) => {
        if (this.elevenLabs !== bridge) {
          return;
        }

        this.partialTranscript = text;
        void this.logEvent("transcript_partial", {
          text,
          charCount: text.length,
        });
        this.sendEvent({ type: "transcript_partial", text });
      },
      onCommittedTranscript: (text) => {
        if (this.elevenLabs !== bridge) {
          return;
        }

        void this.handleCommittedTranscript(text);
      },
      onClose: ({ code, reason, intentional }) => {
        if (this.elevenLabs !== bridge) {
          return;
        }

        const recoveredChunks = bridge.drainPendingAudioChunks();
        this.bridgeConnecting = false;
        this.bridgeReady = false;
        this.elevenLabs = null;
        if (recoveredChunks.length > 0) {
          this.audioQueue.unshift(...recoveredChunks);
        }

        void this.logEvent("elevenlabs_closed", {
          code,
          reason: reason || "no-reason",
          intentional,
          recoveredQueuedChunks: recoveredChunks.length,
        });

        if (intentional || this.stopped) {
          this.sendEvent({ type: "status", message: "ElevenLabs connection closed." });
          return;
        }

        this.sendEvent({
          type: "status",
          message: "Transcription connection dropped. Reconnecting...",
        });
        this.ensureElevenLabsConnected();
      },
    });

    this.elevenLabs = bridge;
  }

  private reconnectionContext() {
    const mostRecentText =
      this.transcriptSegments[this.transcriptSegments.length - 1]?.text ??
      this.partialTranscript ??
      "";

    return mostRecentText.slice(-48);
  }

  private snapshotPartialTranscript() {
    const provisionalText = this.partialTranscript.trim();
    if (!provisionalText || provisionalText === this.lastProvisionalText) {
      return "";
    }

    const provisionalId = crypto.randomUUID();
    const provisionalAt = this.timeStamp(new Date());
    this.provisionalSegments.push({
      id: provisionalId,
      text: provisionalText,
      provisionalAt,
    });
    this.lastProvisionalText = provisionalText;
    this.sendEvent({
      type: "transcript_provisional",
      provisionalId,
      text: provisionalText,
      provisionalAt,
    });
    void this.logEvent("transcript_provisional", {
      provisionalId,
      text: provisionalText,
      provisionalAt,
      totalProvisionalSegments: this.provisionalSegments.length,
    });
    this.sendEvent({ type: "notes_updated", markdown: this.currentMarkdown() });
    return provisionalId;
  }

  private resolveCommittedProvisional(committedText: string) {
    if (this.provisionalSegments.length === 0) {
      return "";
    }

    const queuedProvisionalId = this.pendingCommitProvisionalIds.shift() ?? "";
    if (queuedProvisionalId) {
      const queuedIndex = this.provisionalSegments.findIndex(
        (segment) => segment.id === queuedProvisionalId
      );
      if (queuedIndex >= 0) {
        const resolvedSegment = this.provisionalSegments.splice(queuedIndex, 1)[0];
        return resolvedSegment.id;
      }
    }

    const normalizedCommittedText = this.normalizeTranscriptText(committedText);
    let matchedIndex = -1;

    for (let index = this.provisionalSegments.length - 1; index >= 0; index -= 1) {
      const normalizedProvisionalText = this.normalizeTranscriptText(
        this.provisionalSegments[index].text
      );

      if (
        normalizedCommittedText === normalizedProvisionalText ||
        normalizedCommittedText.startsWith(normalizedProvisionalText) ||
        normalizedProvisionalText.startsWith(normalizedCommittedText) ||
        normalizedCommittedText.includes(normalizedProvisionalText)
      ) {
        matchedIndex = index;
        break;
      }
    }

    if (matchedIndex === -1) {
      matchedIndex = 0;
    }

    const resolvedSegment = this.provisionalSegments.splice(matchedIndex, 1)[0];
    return resolvedSegment.id;
  }

  private normalizeTranscriptText(text: string) {
    return text
      .trim()
      .toLocaleLowerCase()
      .replace(/[.!?,:;।]+$/u, "")
      .replace(/\s+/gu, " ");
  }

  private formatDateTime(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  private dateStamp(date: Date) {
    const year = `${date.getFullYear()}`;
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private timeStamp(date: Date) {
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    return `${hours}-${minutes}`;
  }

  private fileStamp(date: Date) {
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    const seconds = `${date.getSeconds()}`.padStart(2, "0");
    const milliseconds = `${date.getMilliseconds()}`.padStart(3, "0");
    return `${hours}-${minutes}-${seconds}-${milliseconds}`;
  }
}
