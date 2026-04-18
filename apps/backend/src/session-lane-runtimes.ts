import type { BuddyParseResult } from "./buddy-contract";
import type { CodexAppServer } from "./codex-app-server";

export type CodexSessionClient = Pick<
  CodexAppServer,
  "ready" | "getSelectedModel" | "askBuddy" | "askQuestion" | "close"
>;

export type CreateCodexAppServer = (options: {
  developerInstructions: string;
  workingDirectory: string;
}) => CodexSessionClient;

export type BuddyLaneRuntime = {
  ready: () => Promise<void>;
  getSelectedModel: () => Promise<string>;
  prime: (prompt: string) => Promise<BuddyParseResult>;
  runBuddyTurn: (prompt: string) => Promise<BuddyParseResult>;
  close: () => Promise<void>;
};

export type QuestionLaneRuntime = {
  runQuestion: (
    question: string,
    context: string,
    onDelta: (delta: string) => void
  ) => Promise<string>;
  close: () => Promise<void>;
};

type SharedCodexSessionRuntimeOptions = {
  createCodexAppServer: CreateCodexAppServer;
  developerInstructions: string;
  workingDirectory: string;
};

export class SharedCodexSessionRuntime {
  private readonly createCodexAppServer: CreateCodexAppServer;
  private readonly developerInstructions: string;
  private readonly workingDirectory: string;
  private codex: CodexSessionClient | null = null;
  private readyPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;
  private closed = false;

  constructor(options: SharedCodexSessionRuntimeOptions) {
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
      throw new Error("Shared Codex session runtime is closed.");
    }

    if (!this.readyPromise) {
      const codex = this.requireClient();
      this.readyPromise = codex.ready();
    }

    await this.readyPromise;
  }

  private requireClient() {
    if (this.closed) {
      throw new Error("Shared Codex session runtime is closed.");
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
  constructor(private readonly sharedRuntime: SharedCodexSessionRuntime) {}

  async ready() {
    await this.sharedRuntime.ready();
  }

  async getSelectedModel() {
    return await this.sharedRuntime.getSelectedModel();
  }

  async prime(prompt: string) {
    return await this.sharedRuntime.askBuddy(prompt);
  }

  async runBuddyTurn(prompt: string) {
    return await this.sharedRuntime.askBuddy(prompt);
  }

  async close() {
    await this.sharedRuntime.close();
  }
}

class DefaultQuestionLaneRuntime implements QuestionLaneRuntime {
  constructor(private readonly sharedRuntime: SharedCodexSessionRuntime) {}

  async runQuestion(
    question: string,
    context: string,
    onDelta: (delta: string) => void
  ) {
    return await this.sharedRuntime.askQuestion(question, context, onDelta);
  }

  async close() {
    await this.sharedRuntime.close();
  }
}

export function createSessionLaneRuntimes(options: SharedCodexSessionRuntimeOptions): {
  buddyRuntime: BuddyLaneRuntime;
  qaRuntime: QuestionLaneRuntime;
} {
  const sharedRuntime = new SharedCodexSessionRuntime(options);

  return {
    buddyRuntime: new DefaultBuddyLaneRuntime(sharedRuntime),
    qaRuntime: new DefaultQuestionLaneRuntime(sharedRuntime),
  };
}
