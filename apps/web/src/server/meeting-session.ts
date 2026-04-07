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
      type: "transcript_committed";
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
  private readonly questionAnswers: QuestionAnswer[] = [];
  private readonly startedAt = new Date();
  private readonly vaultPath = process.env.OBSIDIAN_VAULT_PATH ?? DEFAULT_VAULT_PATH;
  private readonly notePath: string;
  private readonly notePathRelative: string;
  private readonly logPath: string;
  private readonly logPathRelative: string;
  private readonly codex = new CodexAppServer();
  private readonly audioQueue: AudioChunk[] = [];

  private elevenLabs: ElevenLabsBridge | null = null;
  private partialTranscript = "";
  private askQueue = Promise.resolve();
  private commitQueue = Promise.resolve();
  private audioChunkCount = 0;

  constructor(options: MeetingSessionOptions) {
    this.sampleRate = options.sampleRate;
    this.title = options.title.trim() || "Meeting Buddy";
    this.includeTabAudio = options.includeTabAudio;
    this.sendEvent = options.sendEvent;

    const noteFolder = path.join(this.vaultPath, "Notes", "Dated", this.dateStamp(this.startedAt));
    const noteFileName = `${this.title} - ${this.timeStamp(this.startedAt)}.md`;
    this.notePath = path.join(noteFolder, noteFileName);
    this.notePathRelative = path.relative(this.vaultPath, this.notePath);

    const logFolder = path.join(WEB_APP_DIR, "output", "session-logs", this.dateStamp(this.startedAt));
    const logFileName = `${this.title} - ${this.timeStamp(this.startedAt)}.jsonl`;
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

    this.elevenLabs = new ElevenLabsBridge({
      sampleRate: this.sampleRate,
      onStatus: (message) => {
        void this.logEvent("status", { message });
        this.sendEvent({ type: "status", message });
      },
      onPartialTranscript: (text) => {
        this.partialTranscript = text;
        void this.logEvent("transcript_partial", {
          text,
          charCount: text.length,
        });
        this.sendEvent({ type: "transcript_partial", text });
      },
      onCommittedTranscript: (text) => {
        void this.handleCommittedTranscript(text);
      },
    });

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
    if (!this.elevenLabs) {
      this.audioQueue.push(chunk);
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
      if (!this.partialTranscript.trim() || !this.elevenLabs) {
        return;
      }

      await this.logEvent("commit_requested", {
        partialTranscript: this.partialTranscript,
      });
      await this.elevenLabs.commit();
    });

    return this.commitQueue;
  }

  async stop() {
    await this.commitTranscript();
    this.elevenLabs?.close();
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
    const committedAt = this.timeStamp(new Date());

    this.transcriptSegments.push({
      text: committedText,
      committedAt,
    });

    await this.writeNote();
    await this.logEvent("transcript_committed", {
      text: committedText,
      committedAt,
      totalCommittedSegments: this.transcriptSegments.length,
    });
    this.sendEvent({ type: "transcript_committed", text: committedText, committedAt });
    this.sendEvent({ type: "notes_updated", markdown: this.currentMarkdown() });
  }

  private flushQueuedAudio() {
    if (!this.elevenLabs) {
      return;
    }

    for (const chunk of this.audioQueue) {
      this.elevenLabs.sendAudioChunk(chunk);
    }
    this.audioQueue.length = 0;
  }

  private buildQuestionContext() {
    const transcriptContext = this.transcriptSegments
      .slice(-24)
      .map((segment) => `- [${segment.committedAt}] ${segment.text}`)
      .join("\n");

    return [
      this.currentMarkdown(),
      "",
      "Recent transcript excerpts:",
      transcriptContext || "- No committed transcript yet.",
    ].join("\n");
  }

  private currentMarkdown() {
    return buildMeetingNote({
      title: this.title,
      startedAt: this.formatDateTime(this.startedAt),
      includeTabAudio: this.includeTabAudio,
      transcriptSegments: this.transcriptSegments,
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
}
