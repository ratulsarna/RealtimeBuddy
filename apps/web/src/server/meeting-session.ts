import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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
  private readonly codex = new CodexAppServer();
  private readonly audioQueue: AudioChunk[] = [];

  private elevenLabs: ElevenLabsBridge | null = null;
  private partialTranscript = "";
  private askQueue = Promise.resolve();
  private commitQueue = Promise.resolve();

  constructor(options: MeetingSessionOptions) {
    this.sampleRate = options.sampleRate;
    this.title = options.title.trim() || "Meeting Buddy";
    this.includeTabAudio = options.includeTabAudio;
    this.sendEvent = options.sendEvent;

    const noteFolder = path.join(this.vaultPath, "Notes", "Dated", this.dateStamp(this.startedAt));
    const noteFileName = `${this.title} - ${this.timeStamp(this.startedAt)}.md`;
    this.notePath = path.join(noteFolder, noteFileName);
    this.notePathRelative = path.relative(this.vaultPath, this.notePath);
  }

  async start() {
    await mkdir(path.dirname(this.notePath), { recursive: true });
    await this.writeNote();

    this.elevenLabs = new ElevenLabsBridge({
      sampleRate: this.sampleRate,
      onStatus: (message) => {
        this.sendEvent({ type: "status", message });
      },
      onPartialTranscript: (text) => {
        this.partialTranscript = text;
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
      model: await this.codex.getSelectedModel(),
    });
    this.sendEvent({ type: "notes_updated", markdown: this.currentMarkdown() });

    this.flushQueuedAudio();
  }

  pushAudioChunk(chunk: AudioChunk) {
    if (!this.elevenLabs) {
      this.audioQueue.push(chunk);
      return;
    }

    this.elevenLabs.sendAudioChunk(chunk);
  }

  ask(question: string) {
    this.askQueue = this.askQueue.then(async () => {
      const askedAt = this.timeStamp(new Date());
      let answer = "";

      const context = this.buildQuestionContext();
      const text = await this.codex.askQuestion(question, context, (delta) => {
        answer += delta;
        this.sendEvent({ type: "answer_delta", delta });
      });

      answer = text || answer;
      this.questionAnswers.unshift({
        question,
        answer,
        askedAt,
      });

      await this.writeNote();
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

      await this.elevenLabs.commit();
    });

    return this.commitQueue;
  }

  async stop() {
    await this.commitTranscript();
    this.elevenLabs?.close();
    this.codex.close();
    await this.writeNote();
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
