import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

import { parseBuddyResponse, type BuddyParseResult } from "./buddy-contract";

type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type JsonRpcRequest = {
  id: string;
  method: string;
  params?: JsonObject;
};

type JsonRpcResponse = {
  id: string;
  result?: JsonValue;
  error?: {
    message: string;
  };
};

type JsonRpcNotification = {
  method: string;
  params?: JsonObject;
};

type InitializeResponse = {
  serverInfo?: {
    name?: string;
    version?: string;
  };
};

type ModelRecord = {
  id: string;
  model: string;
  hidden: boolean;
  isDefault: boolean;
};

type ModelListResponse = {
  data: ModelRecord[];
};

type ThreadStartResponse = {
  thread: {
    id: string;
  };
  model: string;
};

type TurnStartResponse = {
  turn: {
    id: string;
  };
};

type AgentMessageDeltaNotification = {
  threadId: string;
  turnId: string;
  itemId: string;
  delta: string;
};

type AgentMessageItem = {
  type: "agentMessage";
  id: string;
  text: string;
};

type ItemCompletedNotification = {
  threadId: string;
  turnId: string;
  item: AgentMessageItem | { type: string };
};

type TurnCompletedNotification = {
  threadId: string;
  turn: {
    id: string;
    status: string;
    error: {
      message: string;
    } | null;
  };
};

type PendingRequest = {
  resolve: (value: JsonValue) => void;
  reject: (message: string) => void;
  timeout: NodeJS.Timeout;
};

type NotificationListener = (notification: JsonRpcNotification) => void;

type PendingTurn = {
  reject: (message: string) => void;
  timeout: NodeJS.Timeout;
  listener: NotificationListener;
};

type CodexAppServerOptions = {
  developerInstructions?: string;
  workingDirectory: string;
};

type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";
type CodexApprovalPolicy = "never" | "on-request" | "on-failure" | "untrusted";
type CodexReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

type ThreadStartParams = {
  model: string;
  cwd: string;
  approvalPolicy: CodexApprovalPolicy;
  sandbox: CodexSandboxMode;
  ephemeral: boolean;
  experimentalRawEvents: boolean;
  persistExtendedHistory: boolean;
  developerInstructions: string;
  serviceName: "realtimebuddy";
};

type TurnStartParams = {
  threadId: string;
  cwd: string;
  input: Array<{
    type: "text";
    text: string;
    text_elements: [];
  }>;
  model: string;
  effort: CodexReasoningEffort;
};

const PREFERRED_MODELS = [
  process.env.CODEX_MODEL ?? "",
  "gpt-5.3-codex-spark",
  "gpt-5.3-codex",
  "gpt-5.4",
];
const DEFAULT_CODEX_SANDBOX_MODE: CodexSandboxMode = "danger-full-access";
const DEFAULT_CODEX_APPROVAL_POLICY: CodexApprovalPolicy = "never";
const DEFAULT_CODEX_REASONING_EFFORT: CodexReasoningEffort = "high";
const REQUEST_TIMEOUT_MS = 20_000;
const TURN_TIMEOUT_MS = 90_000;

function isAgentMessageItem(
  item: ItemCompletedNotification["item"]
): item is AgentMessageItem {
  return item.type === "agentMessage";
}

export function buildQuestionPrompt(options: {
  context: string;
  question: string;
  workingDirectory: string;
}) {
  return [
    "Answer the user's question in concise plain text.",
    "",
    "Current meeting snapshot:",
    options.context,
    "",
    "Local working directory:",
    options.workingDirectory,
    "",
    "User question:",
    options.question,
    "",
    "Answer using the transcript and note context above first. If the user explicitly asks about the working tree, a file, or something outside the live meeting snapshot, inspect the relevant files rooted at the working directory above before answering. Be concise and direct. If something is uncertain, say that plainly.",
  ].join("\n");
}

export async function buildThreadStartParams(options: {
  developerInstructions: string;
  modelPromise: Promise<string>;
  workingDirectory: string;
}): Promise<ThreadStartParams> {
  const sandboxMode = resolveCodexSandboxMode(process.env.CODEX_SANDBOX_MODE);
  const approvalPolicy = resolveCodexApprovalPolicy(process.env.CODEX_APPROVAL_POLICY);

  return {
    model: await options.modelPromise,
    cwd: options.workingDirectory,
    approvalPolicy,
    sandbox: sandboxMode,
    ephemeral: true,
    experimentalRawEvents: false,
    persistExtendedHistory: false,
    developerInstructions: options.developerInstructions,
    serviceName: "realtimebuddy",
  };
}

export async function buildTurnStartParams(options: {
  inputText: string;
  modelPromise: Promise<string>;
  threadId: string;
  workingDirectory: string;
}): Promise<TurnStartParams> {
  return {
    threadId: options.threadId,
    cwd: options.workingDirectory,
    input: [
      {
        type: "text",
        text: options.inputText,
        text_elements: [],
      },
    ],
    model: await options.modelPromise,
    effort: resolveCodexReasoningEffort(process.env.CODEX_REASONING_EFFORT),
  };
}

export class CodexAppServer {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly developerInstructions: string;
  private readonly workingDirectory: string;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly notificationListeners = new Set<NotificationListener>();
  private readonly pendingTurns = new Map<string, PendingTurn>();
  private readonly selectedModelPromise: Promise<string>;
  private threadIdPromise: Promise<string> | null = null;
  private closedMessage: string | null = null;

  constructor(options: CodexAppServerOptions) {
    this.workingDirectory = options.workingDirectory;
    this.developerInstructions =
      options.developerInstructions ??
      "You are RealtimeBuddy, a fast ambient meeting assistant. Answer from the live meeting context first, and be concise.";
    this.process = spawn("codex", buildCodexAppServerArgs(), {
      cwd: this.workingDirectory,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const output = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });

    output.on("line", (line) => {
      const message = JSON.parse(line) as JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;
      this.handleIncomingMessage(message);
    });

    this.process.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        console.log(`[codex-app-server] ${message}`);
      }
    });

    this.process.on("error", (error) => {
      this.failPendingWork(`Codex app-server error: ${error.message}`);
    });

    this.process.on("exit", (code, signal) => {
      const reason =
        this.closedMessage ??
        `Codex app-server exited${signal ? ` via ${signal}` : ` with code ${code ?? "unknown"}`}.`;
      this.failPendingWork(reason);
    });

    this.selectedModelPromise = this.bootstrap();
  }

  async ready() {
    await this.selectedModelPromise;
  }

  async getSelectedModel() {
    return this.selectedModelPromise;
  }

  async askQuestion(
    question: string,
    context: string,
    onDelta: (delta: string) => void
  ) {
    return await this.runTurn(
      buildQuestionPrompt({
        context,
        question,
        workingDirectory: this.workingDirectory,
      }),
      onDelta
    );
  }

  async askBuddy(prompt: string): Promise<BuddyParseResult> {
    const rawText = await this.runTurn(prompt, () => undefined);
    return parseBuddyResponse(rawText);
  }

  close() {
    this.closedMessage = "Codex app-server closed.";
    this.failPendingWork(this.closedMessage);
    this.process.kill();
  }

  private async bootstrap() {
    await this.request<InitializeResponse>("initialize", {
      clientInfo: {
        name: "realtimebuddy",
        title: "RealtimeBuddy",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: false,
      },
    });

    this.notify("initialized", {});

    const modelList = await this.request<ModelListResponse>("model/list", {
      includeHidden: true,
    });

    return this.pickModel(modelList.data);
  }

  private async getThreadId() {
    if (this.threadIdPromise) {
      return await this.threadIdPromise;
    }

    this.threadIdPromise = this.createThread();
    return await this.threadIdPromise;
  }

  private async createThread() {
    const thread = await this.request<ThreadStartResponse>(
      "thread/start",
      await buildThreadStartParams({
        developerInstructions: this.developerInstructions,
        modelPromise: this.getSelectedModel(),
        workingDirectory: this.workingDirectory,
      })
    );

    return thread.thread.id;
  }

  private pickModel(models: ModelRecord[]) {
    const visibleModels = models.filter((model) => !model.hidden);
    const candidates = visibleModels.length > 0 ? visibleModels : models;

    for (const preferredModel of PREFERRED_MODELS) {
      if (!preferredModel) {
        continue;
      }

      const match = candidates.find(
        (candidate) =>
          candidate.id === preferredModel || candidate.model === preferredModel
      );

      if (match) {
        return match.model;
      }
    }

    const defaultModel =
      candidates.find((candidate) => candidate.isDefault) ?? candidates[0];

    return defaultModel.model;
  }

  private async runTurn(inputText: string, onDelta: (delta: string) => void) {
    const threadId = await this.getThreadId();
    const turn = await this.request<TurnStartResponse>(
      "turn/start",
      await buildTurnStartParams({
        inputText,
        modelPromise: this.getSelectedModel(),
        threadId,
        workingDirectory: this.workingDirectory,
      })
    );

    return await new Promise<string>((resolve, reject) => {
      const turnId = turn.turn.id;
      let answer = "";

      const timeout = setTimeout(() => {
        this.notificationListeners.delete(listener);
        this.pendingTurns.delete(turnId);
        reject("Codex app-server timed out waiting for the assistant reply.");
      }, TURN_TIMEOUT_MS);

      const listener: NotificationListener = (notification) => {
        if (notification.method === "item/agentMessage/delta") {
          const params = notification.params as unknown as AgentMessageDeltaNotification;
          if (params.turnId === turnId) {
            answer += params.delta;
            onDelta(params.delta);
          }
        }

        if (notification.method === "item/completed") {
          const params = notification.params as unknown as ItemCompletedNotification;
          const item = params.item;
          if (params.turnId === turnId && isAgentMessageItem(item)) {
            answer = item.text;
          }
        }

        if (notification.method === "turn/completed") {
          const params = notification.params as unknown as TurnCompletedNotification;
          if (params.turn.id === turnId) {
            clearTimeout(timeout);
            this.notificationListeners.delete(listener);
            this.pendingTurns.delete(turnId);
            if (params.turn.status === "failed" && params.turn.error) {
              reject(params.turn.error.message);
              return;
            }
            resolve(answer.trim());
          }
        }
      };

      this.notificationListeners.add(listener);
      this.pendingTurns.set(turnId, {
        reject,
        timeout,
        listener,
      });
    });
  }

  private notify(method: string, params: JsonObject) {
    if (this.closedMessage || this.process.stdin.destroyed) {
      return;
    }

    const message = JSON.stringify({
      method,
      params,
    });

    this.process.stdin.write(`${message}\n`);
  }

  private async request<T extends JsonValue>(method: string, params: JsonObject) {
    if (this.closedMessage || this.process.stdin.destroyed) {
      throw new Error(this.closedMessage ?? "Codex app-server is unavailable.");
    }

    const id = crypto.randomUUID();
    const message = JSON.stringify({
      id,
      method,
      params,
    });

    const promise = new Promise<JsonValue>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(`Codex app-server timed out waiting for ${method}.`);
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout,
      });
    });

    this.process.stdin.write(`${message}\n`);
    return (await promise) as T;
  }

  private handleIncomingMessage(
    message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification
  ) {
    if ("method" in message && "id" in message) {
      this.process.stdin.write(
        `${JSON.stringify({
          id: message.id,
          result: {},
        })}\n`
      );
      return;
    }

    if ("id" in message) {
      const pending = this.pendingRequests.get(message.id);
      if (!pending) {
        return;
      }

      this.pendingRequests.delete(message.id);
      clearTimeout(pending.timeout);

      if (message.error) {
        pending.reject(message.error.message);
        return;
      }

      pending.resolve(message.result ?? null);
      return;
    }

    for (const listener of this.notificationListeners) {
      listener(message);
    }
  }

  private failPendingWork(message: string) {
    if (!this.closedMessage) {
      this.closedMessage = message;
    }

    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(message);
      this.pendingRequests.delete(id);
    }

    for (const [turnId, pendingTurn] of this.pendingTurns) {
      clearTimeout(pendingTurn.timeout);
      this.notificationListeners.delete(pendingTurn.listener);
      pendingTurn.reject(message);
      this.pendingTurns.delete(turnId);
    }
  }
}

export function buildCodexAppServerArgs() {
  const sandboxMode = resolveCodexSandboxMode(process.env.CODEX_SANDBOX_MODE);
  const approvalPolicy = resolveCodexApprovalPolicy(process.env.CODEX_APPROVAL_POLICY);
  const reasoningEffort = resolveCodexReasoningEffort(process.env.CODEX_REASONING_EFFORT);

  return [
    "app-server",
    "--listen",
    "stdio://",
    "-c",
    `sandbox_mode="${sandboxMode}"`,
    "-c",
    `approval_policy="${approvalPolicy}"`,
    "-c",
    `model_reasoning_effort="${reasoningEffort}"`,
  ];
}

function resolveCodexSandboxMode(value: string | undefined): CodexSandboxMode {
  const normalized = value?.trim();

  switch (normalized) {
    case "read-only":
      return "read-only";
    case "workspace-write":
      return "workspace-write";
    case "danger-full-access":
      return "danger-full-access";
    default:
      return DEFAULT_CODEX_SANDBOX_MODE;
  }
}

function resolveCodexApprovalPolicy(value: string | undefined): CodexApprovalPolicy {
  const normalized = value?.trim();

  switch (normalized) {
    case "never":
      return "never";
    case "on-request":
      return "on-request";
    case "on-failure":
      return "on-failure";
    case "untrusted":
      return "untrusted";
    default:
      return DEFAULT_CODEX_APPROVAL_POLICY;
  }
}

function resolveCodexReasoningEffort(value: string | undefined): CodexReasoningEffort {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case "none":
      return "none";
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
      return "xhigh";
    default:
      return DEFAULT_CODEX_REASONING_EFFORT;
  }
}
