import type { SessionLanguagePreference } from "@realtimebuddy/shared/language-preferences";

import {
  buildBuddyPrimingPrompt,
  buildBuddyTurnPrompt,
  type BuddyParseResult,
} from "./buddy-contract";
import type { CodexAppServer } from "./codex-app-server";

export type CodexSessionClient = Pick<
  CodexAppServer,
  "ready" | "getSelectedModel" | "askBuddy" | "askQuestion" | "close"
>;

export type CreateCodexAppServer = (options: {
  developerInstructions: string;
  workingDirectory: string;
}) => CodexSessionClient;

export type BuddyLaneStartupContext = {
  includeTabAudio: boolean;
  languagePreference: SessionLanguagePreference;
  meetingSeed: string;
  meetingTitle: string;
  staticUserSeed: string;
  workingDirectory: string;
};

export type QuestionLaneStartupContext = BuddyLaneStartupContext;

export type BuddyLaneTurnInput = {
  trigger: string;
  context: string;
};

export type BuddyLaneRuntime = {
  initialize: (context: BuddyLaneStartupContext) => Promise<BuddyParseResult>;
  getSelectedModel: () => Promise<string>;
  runBuddyTurn: (input: BuddyLaneTurnInput) => Promise<BuddyParseResult>;
  close: () => Promise<void>;
};

export type QuestionLaneRuntime = {
  initialize: (context: QuestionLaneStartupContext) => Promise<void>;
  getSelectedModel: () => Promise<string>;
  runQuestion: (
    question: string,
    context: string,
    onDelta: (delta: string) => void
  ) => Promise<string>;
  close: () => Promise<void>;
};

type SessionLaneRuntimeOptions = {
  createCodexAppServer: CreateCodexAppServer;
  developerInstructions: string;
  workingDirectory: string;
};

class LazyCodexLaneClient {
  private readonly createCodexAppServer: CreateCodexAppServer;
  private readonly developerInstructions: string;
  private readonly workingDirectory: string;
  private codex: CodexSessionClient | null = null;
  private readyPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;
  private closed = false;

  constructor(options: SessionLaneRuntimeOptions) {
    this.createCodexAppServer = options.createCodexAppServer;
    this.developerInstructions = options.developerInstructions;
    this.workingDirectory = options.workingDirectory;
  }

  async ready() {
    await this.ensureReady();
  }

  async getSelectedModel() {
    await this.ensureReady();
    return await this.requireClient().getSelectedModel();
  }

  async askBuddy(prompt: string) {
    await this.ensureReady();
    return await this.requireClient().askBuddy(prompt);
  }

  async askQuestion(
    question: string,
    context: string,
    onDelta: (delta: string) => void
  ) {
    await this.ensureReady();
    return await this.requireClient().askQuestion(question, context, onDelta);
  }

  async close() {
    if (this.closePromise) {
      return await this.closePromise;
    }

    this.closed = true;
    this.closePromise = Promise.resolve().then(() => {
      this.codex?.close();
      this.codex = null;
    });

    return await this.closePromise;
  }

  private async ensureReady() {
    if (this.closed) {
      throw new Error("Codex lane runtime is closed.");
    }

    if (!this.readyPromise) {
      const codex = this.requireClient();
      this.readyPromise = codex.ready();
    }

    await this.readyPromise;
  }

  private requireClient() {
    if (this.closed) {
      throw new Error("Codex lane runtime is closed.");
    }

    if (!this.codex) {
      this.codex = this.createCodexAppServer({
        developerInstructions: this.developerInstructions,
        workingDirectory: this.workingDirectory,
      });
    }

    return this.codex;
  }
}

class DefaultBuddyLaneRuntime implements BuddyLaneRuntime {
  private readonly runtime: LazyCodexLaneClient;
  private initializedPromise: Promise<BuddyParseResult> | null = null;

  constructor(options: SessionLaneRuntimeOptions) {
    this.runtime = new LazyCodexLaneClient(options);
  }

  async initialize(context: BuddyLaneStartupContext) {
    if (!this.initializedPromise) {
      this.initializedPromise = this.runtime.askBuddy(
        buildBuddyPrimingPrompt({
          includeTabAudio: context.includeTabAudio,
          languagePreference: context.languagePreference,
          meetingSeed: context.meetingSeed,
          meetingTitle: context.meetingTitle,
          staticUserSeed: context.staticUserSeed,
          workingDirectory: context.workingDirectory,
        })
      );
    }

    return await this.initializedPromise;
  }

  async getSelectedModel() {
    return await this.runtime.getSelectedModel();
  }

  async runBuddyTurn(input: BuddyLaneTurnInput) {
    if (!this.initializedPromise) {
      throw new Error("Buddy lane runtime is not initialized.");
    }

    return await this.runtime.askBuddy(
      buildBuddyTurnPrompt({
        context: input.context,
        trigger: input.trigger,
      })
    );
  }

  async close() {
    await this.runtime.close();
  }
}

class DefaultQuestionLaneRuntime implements QuestionLaneRuntime {
  private readonly runtime: LazyCodexLaneClient;
  private initializedPromise: Promise<void> | null = null;

  constructor(options: SessionLaneRuntimeOptions) {
    this.runtime = new LazyCodexLaneClient(options);
  }

  async initialize(context: QuestionLaneStartupContext) {
    if (!this.initializedPromise) {
      const initialization = this.runtime
        .askQuestion(
          "This is a silent setup turn for the dedicated Q&A lane. Absorb the meeting startup context for future questions in this meeting and reply with READY only.",
          buildQuestionLaneStartupContext(context),
          () => undefined
        )
        .then(() => undefined)
        .catch((error) => {
          if (this.initializedPromise === initialization) {
            this.initializedPromise = null;
          }

          throw error;
        });

      this.initializedPromise = initialization;
    }

    await this.initializedPromise;
  }

  async getSelectedModel() {
    return await this.runtime.getSelectedModel();
  }

  async runQuestion(
    question: string,
    context: string,
    onDelta: (delta: string) => void
  ) {
    if (!this.initializedPromise) {
      throw new Error("Question lane runtime is not initialized.");
    }

    return await this.runtime.askQuestion(question, context, onDelta);
  }

  async close() {
    await this.runtime.close();
  }
}

export function createSessionLaneRuntimes(options: SessionLaneRuntimeOptions): {
  buddyRuntime: BuddyLaneRuntime;
  qaRuntime: QuestionLaneRuntime;
} {
  return {
    buddyRuntime: new DefaultBuddyLaneRuntime(options),
    qaRuntime: new DefaultQuestionLaneRuntime(options),
  };
}

function buildQuestionLaneStartupContext(context: QuestionLaneStartupContext) {
  const staticSeed = context.staticUserSeed || "None provided.";
  const meetingSeed = context.meetingSeed || "None provided.";

  return [
    "Meeting startup context for the dedicated Q&A lane:",
    `- Meeting title: ${context.meetingTitle}`,
    `- Audio sources: microphone${context.includeTabAudio ? " + tab audio" : ""}`,
    `- Preferred transcription language: ${context.languagePreference}`,
    `- Working directory: ${context.workingDirectory}`,
    "",
    "Static user seed:",
    staticSeed,
    "",
    "Dynamic meeting seed:",
    meetingSeed,
  ].join("\n");
}
