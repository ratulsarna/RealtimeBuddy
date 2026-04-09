import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRealtimeLanguageCode, type SessionLanguagePreference } from "@realtimebuddy/shared/language-preferences";
import type { ServerEvent, SessionCaptureState } from "@realtimebuddy/shared/protocol";

import { CodexAppServer } from "./codex-app-server";
import { ElevenLabsBridge } from "./elevenlabs-bridge";
import { buildMeetingNote } from "./note-builder";

type AudioChunk = {
  pcmBase64: string;
  sampleRate: number;
};

type SendEvent = (event: ServerEvent) => void;

type MeetingSessionOptions = {
  sampleRate: number;
  title: string;
  includeTabAudio: boolean;
  languagePreference: SessionLanguagePreference;
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

export type MeetingSessionSnapshot = {
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
  provisionalEntries: ProvisionalSegment[];
  transcriptEntries: TranscriptSegment[];
  questionAnswers: QuestionAnswer[];
  markdown: string;
  captureState: SessionCaptureState;
  statusMessage: string;
};

const DEFAULT_VAULT_PATH = path.join(homedir(), "ObsidianVault");
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_APP_DIR = path.resolve(SERVER_DIR, "..");
const MAX_BUFFERED_AUDIO_CHUNKS = 240;

export function resolveConfiguredPath(
  configuredPath: string | undefined,
  fallbackPath: string
) {
  const trimmedPath = configuredPath?.trim();
  if (!trimmedPath) {
    return fallbackPath;
  }

  if (trimmedPath === "~") {
    return homedir();
  }

  if (trimmedPath.startsWith("~/") || trimmedPath.startsWith("~\\")) {
    return path.join(homedir(), trimmedPath.slice(2));
  }

  return trimmedPath;
}

export class MeetingSession {
  readonly id = crypto.randomUUID();
  private readonly sampleRate: number;
  private readonly title: string;
  private readonly includeTabAudio: boolean;
  private readonly languagePreference: SessionLanguagePreference;
  private readonly languageCode: string | undefined;
  private readonly sendEvent: SendEvent;
  private readonly transcriptSegments: TranscriptSegment[] = [];
  private readonly provisionalSegments: ProvisionalSegment[] = [];
  private readonly questionAnswers: QuestionAnswer[] = [];
  private readonly startedAt = new Date();
  private lastStatusMessage = "Preparing session...";
  private readonly vaultPath = resolveConfiguredPath(
    process.env.OBSIDIAN_VAULT_PATH,
    DEFAULT_VAULT_PATH
  );
  private readonly notePath: string;
  private readonly notePathRelative: string;
  private readonly logPath: string;
  private readonly logPathRelative: string;
  private readonly codexWorkingDirectory: string;
  private codex: CodexAppServer | null = null;
  private readonly audioQueue: AudioChunk[] = [];
  private readonly pendingCommitProvisionalIds: string[] = [];

  private elevenLabs: ElevenLabsBridge | null = null;
  private partialTranscript = "";
  private lastProvisionalText = "";
  private paused = false;
  private resumePending = false;
  private stopping = false;
  private pausePromise: Promise<void> | null = null;
  private askQueue = Promise.resolve();
  private commitQueue = Promise.resolve();
  private audioChunkCount = 0;
  private bridgeReady = false;
  private bridgeConnecting = false;
  private bridgeConnectionAttempts = 0;
  private audioQueueOverflowReported = false;
  private codexStartupPromise: Promise<void> | null = null;
  private codexModel = "";
  private codexUnavailableMessage = "";
  private stopped = false;

  constructor(options: MeetingSessionOptions) {
    this.sampleRate = options.sampleRate;
    this.title = options.title.trim() || "Meeting Buddy";
    this.includeTabAudio = options.includeTabAudio;
    this.languagePreference = options.languagePreference;
    this.languageCode = resolveRealtimeLanguageCode(this.languagePreference);
    this.sendEvent = options.sendEvent;
    const safeFileTitle = this.sanitizeTitleForFileName(this.title);
    this.codexWorkingDirectory = resolveConfiguredPath(
      process.env.CODEX_VAULT_PATH,
      this.vaultPath
    );

    const noteFolder = path.join(this.vaultPath, "Notes", "Dated", this.dateStamp(this.startedAt));
    const noteFileName = `${safeFileTitle} - ${this.fileStamp(this.startedAt)}.md`;
    this.notePath = path.join(noteFolder, noteFileName);
    this.notePathRelative = path.relative(this.vaultPath, this.notePath);

    const logFolder = path.join(BACKEND_APP_DIR, "output", "session-logs", this.dateStamp(this.startedAt));
    const logFileName = `${safeFileTitle} - ${this.fileStamp(this.startedAt)}.jsonl`;
    this.logPath = path.join(logFolder, logFileName);
    this.logPathRelative = path.relative(BACKEND_APP_DIR, this.logPath);
  }

  async start() {
    await mkdir(path.dirname(this.notePath), { recursive: true });
    await mkdir(path.dirname(this.logPath), { recursive: true });
    await mkdir(this.codexWorkingDirectory, { recursive: true });
    if (!this.codex) {
      this.codex = new CodexAppServer({
        workingDirectory: this.codexWorkingDirectory,
      });
    }
    await this.writeNote();
    await this.logEvent("session_started", {
      notePath: this.notePathRelative,
      logPath: this.logPathRelative,
      includeTabAudio: this.includeTabAudio,
      sampleRate: this.sampleRate,
      languagePreference: this.languagePreference,
      languageCode: this.languageCode ?? "auto",
      codexWorkingDirectory: this.codexWorkingDirectory,
    });

    this.ensureElevenLabsConnected();
    this.lastStatusMessage = "Session ready. Waiting for live transcription...";

    this.emitEvent({
      type: "session_ready",
      sessionId: this.id,
      title: this.title,
      includeTabAudio: this.includeTabAudio,
      languagePreference: this.languagePreference,
      notePath: this.notePath,
      notePathRelative: this.notePathRelative,
      logPath: this.logPath,
      logPathRelative: this.logPathRelative,
      model: "",
    });
    this.emitEvent({ type: "notes_updated", markdown: this.currentMarkdown() });
    await this.logEvent("session_ready", {
      model: "pending",
    });

    this.flushQueuedAudio();
    void this.ensureCodexReady();
  }

  getSnapshot(): MeetingSessionSnapshot {
    return {
      sessionId: this.id,
      title: this.title,
      includeTabAudio: this.includeTabAudio,
      languagePreference: this.languagePreference,
      notePath: this.notePath,
      notePathRelative: this.notePathRelative,
      logPath: this.logPath,
      logPathRelative: this.logPathRelative,
      model: this.codexModel,
      partialTranscript: this.partialTranscript,
      provisionalEntries: this.provisionalSegments.map((segment) => ({ ...segment })),
      transcriptEntries: this.transcriptSegments.map((segment) => ({ ...segment })),
      questionAnswers: this.questionAnswers.map((entry) => ({ ...entry })),
      markdown: this.currentMarkdown(),
      captureState: this.captureState(),
      statusMessage: this.lastStatusMessage,
    };
  }

  pushAudioChunk(chunk: AudioChunk) {
    if (this.stopped || this.paused) {
      return;
    }

    if (!this.elevenLabs || !this.bridgeReady) {
      this.enqueueAudioChunk(chunk);
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
    if (this.stopped || this.paused) {
      return;
    }

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
    const runAsk = this.askQueue.then(async () => {
      await this.commitTranscript();
      const model = await this.requireCodexReady();
      const askedAt = this.timeStamp(new Date());
      let answer = "";
      let pendingAnswerDelta = "";
      let answerDeltaTimer: NodeJS.Timeout | null = null;
      await this.logEvent("ask_started", {
        question,
        model,
        committedTranscriptSegments: this.transcriptSegments.length,
        hadPartialTranscript: Boolean(this.partialTranscript.trim()),
      });

      const context = this.buildQuestionContext();
      const text = await this.codex?.askQuestion(question, context, (delta) => {
        answer += delta;
        pendingAnswerDelta += delta;
        if (answerDeltaTimer === null) {
          answerDeltaTimer = setTimeout(() => {
            this.emitEvent({ type: "answer_delta", delta: pendingAnswerDelta });
            pendingAnswerDelta = "";
            answerDeltaTimer = null;
          }, 120);
        }
      });

      if (answerDeltaTimer !== null) {
        clearTimeout(answerDeltaTimer);
      }
      if (pendingAnswerDelta) {
        this.emitEvent({ type: "answer_delta", delta: pendingAnswerDelta });
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
      this.emitEvent({ type: "answer_done", text: answer });
      this.emitEvent({ type: "notes_updated", markdown: this.currentMarkdown() });
    });

    this.askQueue = runAsk.catch(() => undefined);
    return runAsk;
  }

  async pause() {
    if (this.pausePromise) {
      return this.pausePromise;
    }

    if (this.stopped || this.paused) {
      return;
    }

    const runPause = (async () => {
      this.paused = true;
      this.resumePending = false;
      await this.commitTranscript();
      this.closeElevenLabs({ recoverPendingAudio: true });
      await this.writeNote();
      await this.logEvent("session_paused", {
        transcriptSegments: this.transcriptSegments.length,
        questionsAnswered: this.questionAnswers.length,
        audioChunksReceived: this.audioChunkCount,
      });
      this.emitEvent({ type: "session_paused" });
    })();

    this.pausePromise = runPause.finally(() => {
      this.pausePromise = null;
    });

    return this.pausePromise;
  }

  async resume() {
    if (this.stopped || !this.paused) {
      return;
    }

    this.paused = false;
    this.resumePending = true;
    await this.logEvent("resume_requested", {
      transcriptSegments: this.transcriptSegments.length,
      questionsAnswered: this.questionAnswers.length,
      bufferedAudioChunks: this.audioQueue.length,
    });
    this.ensureElevenLabsConnected();
    this.flushQueuedAudio();
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
    this.stopping = true;
    this.resumePending = false;
    await this.pausePromise;

    if (this.audioQueue.length > 0 && (this.paused || this.bridgeConnecting || !this.bridgeReady)) {
      this.paused = false;
      this.emitEvent({
        type: "status",
        message: "Finalizing buffered audio before stopping...",
      });
      await this.logEvent("stop_flushing_buffered_audio", {
        bufferedAudioChunks: this.audioQueue.length,
      });
      this.ensureElevenLabsConnected();
      try {
        await this.waitForBridgeReady();
        await this.commitTranscript();
      } catch (error) {
        await this.logEvent("stop_buffered_audio_unavailable", {
          bufferedAudioChunks: this.audioQueue.length,
          message: String(error),
        });
        this.emitEvent({
          type: "status",
          message: "Could not finalize the last buffered audio before stopping.",
        });
      }
    }

    this.stopped = true;
    await this.commitTranscript();
    this.closeElevenLabs();
    this.codex?.close();
    await this.writeNote();
    await this.logEvent("session_stopped", {
      transcriptSegments: this.transcriptSegments.length,
      questionsAnswered: this.questionAnswers.length,
      audioChunksReceived: this.audioChunkCount,
    });
    this.emitEvent({ type: "session_stopped" });
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
    this.emitEvent({
      type: "transcript_committed",
      text: committedText,
      committedAt,
      resolvedProvisionalId,
    });
    this.emitEvent({ type: "notes_updated", markdown: this.currentMarkdown() });
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
    this.audioQueueOverflowReported = false;
    if (queuedChunkCount > 0) {
      void this.logEvent("audio_queue_flushed", {
        count: queuedChunkCount,
      });
    }
  }

  private enqueueAudioChunk(chunk: AudioChunk) {
    this.audioQueue.push(chunk);
    if (this.audioQueue.length <= MAX_BUFFERED_AUDIO_CHUNKS) {
      return;
    }

    const trimmedCount = this.audioQueue.length - MAX_BUFFERED_AUDIO_CHUNKS;
    this.audioQueue.splice(0, trimmedCount);
    if (!this.audioQueueOverflowReported) {
      this.audioQueueOverflowReported = true;
      void this.logEvent("audio_queue_trimmed", {
        trimmedCount,
        maxBufferedChunks: MAX_BUFFERED_AUDIO_CHUNKS,
      });
      this.emitEvent({
        type: "status",
        message: "Transcription is offline. Keeping only the most recent audio while reconnecting.",
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

  private captureState(): SessionCaptureState {
    if (this.stopped) {
      return "stopped";
    }

    if (this.paused) {
      return "paused";
    }

    return "live";
  }

  private emitEvent(event: ServerEvent) {
    if (event.type === "status") {
      this.lastStatusMessage = event.message;
    }

    this.sendEvent(event);
  }

  private async writeNote() {
    await writeFile(this.notePath, this.currentMarkdown(), "utf8");
  }

  private async ensureCodexReady() {
    if (this.codexUnavailableMessage || this.codexModel) {
      return;
    }

    if (!this.codexStartupPromise) {
      this.codexStartupPromise = (async () => {
        try {
          if (!this.codex) {
            this.codex = new CodexAppServer({
              workingDirectory: this.codexWorkingDirectory,
            });
          }

          await this.codex.ready();
          const model = await this.codex.getSelectedModel();
          this.codexModel = model;
          if (this.stopped) {
            return;
          }

          this.emitEvent({
            type: "buddy_ready",
            model,
          });
          void this.logEvent("codex_ready", {
            model,
          });
        } catch (error) {
          this.codexUnavailableMessage = `Buddy Q&A unavailable: ${String(error)}`;
          if (this.stopped) {
            return;
          }

          this.emitEvent({
            type: "status",
            message: `${this.codexUnavailableMessage} Live capture will continue without Q&A.`,
          });
          void this.logEvent("codex_unavailable", {
            message: this.codexUnavailableMessage,
          });
        }
      })();
    }

    await this.codexStartupPromise;
  }

  private async requireCodexReady() {
    await this.ensureCodexReady();

    if (this.codexUnavailableMessage) {
      throw new Error(this.codexUnavailableMessage);
    }

    if (!this.codexModel) {
      throw new Error("Buddy Q&A is still starting. Please try again in a moment.");
    }

    return this.codexModel;
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
    if (this.stopped || this.paused || this.elevenLabs || this.bridgeConnecting) {
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
      languageCode: this.languageCode,
      onStatus: (message) => {
        if (this.elevenLabs !== bridge) {
          return;
        }

        void this.logEvent("status", { message });
        this.emitEvent({ type: "status", message });
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
        if (this.resumePending && !this.stopping) {
          this.resumePending = false;
          void this.logEvent("session_resumed", {
            transcriptSegments: this.transcriptSegments.length,
            questionsAnswered: this.questionAnswers.length,
            bufferedAudioChunks: this.audioQueue.length,
          });
          this.emitEvent({ type: "session_resumed" });
        }
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
        this.emitEvent({ type: "transcript_partial", text });
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

        if (intentional || this.stopped || this.paused) {
          return;
        }

        this.emitEvent({
          type: "status",
          message: "Transcription connection dropped. Reconnecting...",
        });
        this.ensureElevenLabsConnected();
      },
    });

    this.elevenLabs = bridge;
  }

  private closeElevenLabs(options: { recoverPendingAudio?: boolean } = {}) {
    if (options.recoverPendingAudio) {
      const recoveredChunks = this.elevenLabs?.drainPendingAudioChunks() ?? [];
      if (recoveredChunks.length > 0) {
        this.audioQueue.unshift(...recoveredChunks);
      }
    }

    this.elevenLabs?.close();
    this.elevenLabs = null;
    this.bridgeReady = false;
    this.bridgeConnecting = false;
  }

  private reconnectionContext() {
    const mostRecentText =
      this.transcriptSegments[this.transcriptSegments.length - 1]?.text ??
      this.partialTranscript ??
      "";

    return mostRecentText.slice(-48);
  }

  private async waitForBridgeReady(timeoutMs = 15_000) {
    const startedAt = Date.now();

    while (!this.bridgeReady) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error("Timed out waiting for ElevenLabs to reconnect.");
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
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
    this.emitEvent({
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
    void this.writeNote();
    void this.logEvent("notes_updated", {
      committedTranscriptSegments: this.transcriptSegments.length,
      provisionalSegments: this.provisionalSegments.length,
      questionsAnswered: this.questionAnswers.length,
    });
    this.emitEvent({ type: "notes_updated", markdown: this.currentMarkdown() });

    return provisionalId;
  }

  private resolveCommittedProvisional(committedText: string) {
    const pendingProvisionalId = this.pendingCommitProvisionalIds.shift() ?? "";
    if (!pendingProvisionalId) {
      return "";
    }

    const matchedIndex = this.provisionalSegments.findIndex(
      (segment) => segment.id === pendingProvisionalId
    );

    if (matchedIndex === -1) {
      return "";
    }

    const [resolved] = this.provisionalSegments.splice(matchedIndex, 1);
    if (resolved.text === committedText) {
      return resolved.id;
    }

    return "";
  }

  private dateStamp(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private timeStamp(date: Date) {
    return date.toISOString().slice(11, 19);
  }

  private fileStamp(date: Date) {
    return this.timeStamp(date).replaceAll(":", "-");
  }

  private formatDateTime(date: Date) {
    return date.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  private sanitizeTitleForFileName(title: string) {
    return title.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim() || "Meeting Buddy";
  }
}
