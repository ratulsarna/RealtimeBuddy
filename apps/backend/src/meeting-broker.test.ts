import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import type { SessionLanguagePreference } from "@realtimebuddy/shared/language-preferences";
import type { ServerEvent } from "@realtimebuddy/shared/protocol";

import { MeetingBroker } from "./meeting-broker";
import type { MeetingSessionSnapshot } from "./meeting-session";

type SessionId = `${string}-${string}-${string}-${string}-${string}`;

type MockSession = {
  id: SessionId;
  startCalls: number;
  pushAudioChunkCalls: Array<{ pcmBase64: string; sampleRate: number }>;
  logAudioDebugCalls: Array<{
    rms: number;
    peak: number;
    gateOpen: boolean;
    openThreshold: number;
    closeThreshold: number;
    candidateChunks: number;
    sentChunks: number;
    droppedChunks: number;
  }>;
  commitCalls: number;
  pauseCalls: number;
  resumeCalls: number;
  askCalls: string[];
  stopCalls: number;
  snapshot: MeetingSessionSnapshot;
  start: () => Promise<void>;
  pushAudioChunk: (chunk: { pcmBase64: string; sampleRate: number }) => void;
  logAudioDebug: (payload: MockSession["logAudioDebugCalls"][number]) => void;
  commitTranscript: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  ask: (question: string) => Promise<void>;
  stop: () => Promise<void>;
  getSnapshot: () => MeetingSessionSnapshot;
};

class MockSocket extends EventEmitter {
  readonly sent: string[] = [];

  send(payload: string) {
    this.sent.push(payload);
  }
}

function createMockSnapshot(overrides: Partial<MeetingSessionSnapshot> = {}): MeetingSessionSnapshot {
  return {
    sessionId: "11111111-1111-1111-1111-111111111111",
    title: "Mock session",
    includeTabAudio: true,
    languagePreference: "auto",
    notePath: "/tmp/mock-note.md",
    notePathRelative: "Notes/mock-note.md",
    logPath: "/tmp/mock-log.jsonl",
    logPathRelative: "output/mock-log.jsonl",
    model: "gpt-5.4",
    partialTranscript: "",
    provisionalEntries: [],
    transcriptEntries: [],
    buddyEvents: [],
    questionAnswers: [],
    markdown: "# Mock",
    captureState: "live",
    statusMessage: "Listening live.",
    ...overrides,
  };
}

function createMockSession(overrides: Partial<MockSession> = {}): MockSession {
  const snapshot = overrides.snapshot ?? createMockSnapshot();

  return {
    id: snapshot.sessionId as SessionId,
    startCalls: 0,
    pushAudioChunkCalls: [],
    logAudioDebugCalls: [],
    commitCalls: 0,
    pauseCalls: 0,
    resumeCalls: 0,
    askCalls: [],
    stopCalls: 0,
    snapshot,
    async start() {
      this.startCalls += 1;
    },
    pushAudioChunk(chunk) {
      this.pushAudioChunkCalls.push(chunk);
    },
    logAudioDebug(payload) {
      this.logAudioDebugCalls.push(payload);
    },
    async commitTranscript() {
      this.commitCalls += 1;
    },
    async pause() {
      this.pauseCalls += 1;
    },
    async resume() {
      this.resumeCalls += 1;
    },
    async ask(question) {
      this.askCalls.push(question);
    },
    async stop() {
      this.stopCalls += 1;
    },
    getSnapshot() {
      return this.snapshot;
    },
    ...overrides,
  };
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function readEmptyConfig() {
  return {};
}

function parseSentEvents(socket: MockSocket) {
  return socket.sent.map((payload) => JSON.parse(payload) as ServerEvent);
}

function requireCallback(callback: (() => void) | null, label: string) {
  if (!callback) {
    throw new Error(`${label} was not set`);
  }

  return callback;
}

test("MeetingBroker routes capture controls to the active capture client session", async () => {
  const createdSessions: MockSession[] = [];
  const broker = new MeetingBroker(() => {
    const session = createMockSession();
    createdSessions.push(session);
    return session;
  }, readEmptyConfig);
  const socket = new MockSocket();

  broker.attach(socket as never);
  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Pause test",
        includeTabAudio: false,
        languagePreference: "auto",
      })
    )
  );
  await flushAsyncWork();

  const [session] = createdSessions;
  assert.ok(session);
  assert.equal(session.startCalls, 1);

  socket.emit("message", Buffer.from(JSON.stringify({ type: "pause_session" })));
  socket.emit("message", Buffer.from(JSON.stringify({ type: "resume_session" })));
  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "audio_chunk",
        pcmBase64: "abc",
        sampleRate: 48_000,
      })
    )
  );
  socket.emit("message", Buffer.from(JSON.stringify({ type: "commit_transcript" })));
  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "ask",
        question: "What changed?",
      })
    )
  );
  await flushAsyncWork();

  assert.equal(session.pauseCalls, 1);
  assert.equal(session.resumeCalls, 1);
  assert.deepEqual(session.pushAudioChunkCalls, [{ pcmBase64: "abc", sampleRate: 48_000 }]);
  assert.equal(session.commitCalls, 1);
  assert.deepEqual(session.askCalls, ["What changed?"]);
});

test("MeetingBroker forwards optional Buddy seed layers when starting a session", async () => {
  let receivedOptions:
    | {
        staticUserSeed?: string;
        meetingSeed?: string;
      }
    | undefined;
  const broker = new MeetingBroker((options) => {
    receivedOptions = options;
    return createMockSession();
  }, readEmptyConfig);
  const socket = new MockSocket();

  broker.attach(socket as never);
  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Seeded session",
        includeTabAudio: false,
        languagePreference: "english",
        staticUserSeed: "Ratul prefers concise cards.",
        meetingSeed: "Goal: leave with a pilot owner.",
      })
    )
  );
  await flushAsyncWork();

  assert.equal(receivedOptions?.staticUserSeed, "Ratul prefers concise cards.");
  assert.equal(receivedOptions?.meetingSeed, "Goal: leave with a pilot owner.");
});

test("MeetingBroker keeps a session alive when the capture socket closes but a companion remains", async () => {
  const session = createMockSession();
  const broker = new MeetingBroker(() => session, readEmptyConfig);
  const captureSocket = new MockSocket();
  const companionSocket = new MockSocket();

  broker.attach(captureSocket as never);
  broker.attach(companionSocket as never);

  captureSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Shared session",
        includeTabAudio: true,
        languagePreference: "english",
      })
    )
  );
  await flushAsyncWork();

  companionSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "join_session",
        sessionId: session.id,
      })
    )
  );
  await flushAsyncWork();

  captureSocket.emit("close");
  await flushAsyncWork();

  assert.equal(session.stopCalls, 0);
  const events = parseSentEvents(companionSocket);
  assert.ok(events.some((event) => event.type === "capture_client_disconnected"));
});

test("MeetingBroker resumes a paused session when a new capture client reattaches", async () => {
  const session = createMockSession({
    snapshot: createMockSnapshot({
      sessionId: "22222222-2222-2222-2222-222222222222",
    }),
    async pause(this: MockSession) {
      this.pauseCalls += 1;
      this.snapshot.captureState = "paused";
    },
    async resume(this: MockSession) {
      this.resumeCalls += 1;
      this.snapshot.captureState = "live";
    },
  });
  const broker = new MeetingBroker(() => session, readEmptyConfig);
  const firstCaptureSocket = new MockSocket();
  const companionSocket = new MockSocket();
  const replacementCaptureSocket = new MockSocket();

  broker.attach(firstCaptureSocket as never);
  broker.attach(companionSocket as never);
  broker.attach(replacementCaptureSocket as never);

  firstCaptureSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Reattach paused session",
        includeTabAudio: true,
        languagePreference: "auto",
      })
    )
  );
  await flushAsyncWork();

  companionSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "join_session",
        sessionId: session.id,
      })
    )
  );
  await flushAsyncWork();

  firstCaptureSocket.emit("message", Buffer.from(JSON.stringify({ type: "pause_session" })));
  await flushAsyncWork();
  firstCaptureSocket.emit("close");
  await flushAsyncWork();

  replacementCaptureSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sessionId: session.id,
        role: "capture",
        sampleRate: 48_000,
        title: "Reattach paused session",
        includeTabAudio: true,
        languagePreference: "auto",
      })
    )
  );
  await flushAsyncWork();

  assert.equal(session.pauseCalls, 1);
  assert.equal(session.resumeCalls, 1);
});

test("MeetingBroker stops the session when the last attached socket closes", async () => {
  const session = createMockSession();
  const broker = new MeetingBroker(() => session, readEmptyConfig);
  const captureSocket = new MockSocket();

  broker.attach(captureSocket as never);
  captureSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Close test",
        includeTabAudio: true,
        languagePreference: "english",
      })
    )
  );
  await flushAsyncWork();

  captureSocket.emit("close");
  await flushAsyncWork();

  assert.equal(session.stopCalls, 1);
});

test("MeetingBroker serializes pause and resume on the same socket", async () => {
  let releasePause: (() => void) | null = null;
  const callOrder: string[] = [];
  const broker = new MeetingBroker(() =>
    createMockSession({
      async start() {
        callOrder.push("start");
      },
      pushAudioChunk: () => undefined,
      logAudioDebug: () => undefined,
      commitTranscript: async () => undefined,
      pause: async () => {
        callOrder.push("pause:start");
        await new Promise<void>((resolve) => {
          releasePause = () => {
            callOrder.push("pause:end");
            resolve();
          };
        });
      },
      resume: async () => {
        callOrder.push("resume");
      },
      ask: async () => undefined,
      stop: async () => undefined,
    })
  , readEmptyConfig);
  const socket = new MockSocket();

  broker.attach(socket as never);
  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Serialized lifecycle",
        includeTabAudio: false,
        languagePreference: "auto",
      })
    )
  );
  await flushAsyncWork();

  socket.emit("message", Buffer.from(JSON.stringify({ type: "pause_session" })));
  socket.emit("message", Buffer.from(JSON.stringify({ type: "resume_session" })));
  await flushAsyncWork();

  assert.deepEqual(callOrder, ["start", "pause:start"]);
  const releasePauseFn = requireCallback(releasePause, "releasePause");
  releasePauseFn();
  await flushAsyncWork();
  await flushAsyncWork();

  assert.deepEqual(callOrder, ["start", "pause:start", "pause:end", "resume"]);
});

test("MeetingBroker stops immediately when the last socket closes during in-flight work", async () => {
  let releaseAsk: (() => void) | null = null;
  let stopCalls = 0;
  const callOrder: string[] = [];
  const broker = new MeetingBroker(() =>
    createMockSession({
      async start() {
        callOrder.push("start");
      },
      pushAudioChunk: () => undefined,
      logAudioDebug: () => undefined,
      commitTranscript: async () => undefined,
      pause: async () => undefined,
      resume: async () => undefined,
      ask: async () => {
        callOrder.push("ask:start");
        await new Promise<void>((resolve) => {
          releaseAsk = () => {
            callOrder.push("ask:end");
            resolve();
          };
        });
      },
      stop: async () => {
        stopCalls += 1;
        callOrder.push("stop");
      },
    })
  , readEmptyConfig);
  const socket = new MockSocket();

  broker.attach(socket as never);
  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Close during ask",
        includeTabAudio: false,
        languagePreference: "auto",
      })
    )
  );
  await flushAsyncWork();

  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "ask",
        question: "What did I miss?",
      })
    )
  );
  await flushAsyncWork();

  socket.emit("close");
  await flushAsyncWork();

  assert.equal(stopCalls, 1);
  assert.deepEqual(callOrder, ["start", "ask:start", "stop"]);

  const releaseAskAfterClose = requireCallback(releaseAsk, "releaseAskAfterClose");
  releaseAskAfterClose();
  await flushAsyncWork();
});

test("MeetingBroker keeps live audio flowing while an ask is in flight", async () => {
  let releaseAsk: (() => void) | null = null;
  const callOrder: string[] = [];
  const broker = new MeetingBroker(() =>
    createMockSession({
      async start() {
        callOrder.push("start");
      },
      pushAudioChunk: () => {
        callOrder.push("audio");
      },
      logAudioDebug: () => undefined,
      commitTranscript: async () => undefined,
      pause: async () => undefined,
      resume: async () => undefined,
      ask: async () => {
        callOrder.push("ask:start");
        await new Promise<void>((resolve) => {
          releaseAsk = () => {
            callOrder.push("ask:end");
            resolve();
          };
        });
      },
      stop: async () => undefined,
    })
  , readEmptyConfig);
  const socket = new MockSocket();

  broker.attach(socket as never);
  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Audio during ask",
        includeTabAudio: false,
        languagePreference: "auto",
      })
    )
  );
  await flushAsyncWork();

  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "ask",
        question: "What did I miss?",
      })
    )
  );
  await flushAsyncWork();

  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "audio_chunk",
        pcmBase64: "late-audio",
        sampleRate: 48_000,
      })
    )
  );
  await flushAsyncWork();

  assert.deepEqual(callOrder, ["start", "ask:start", "audio"]);

  const releaseAskWhileLive = requireCallback(releaseAsk, "releaseAskWhileLive");
  releaseAskWhileLive();
  await flushAsyncWork();
  assert.deepEqual(callOrder, ["start", "ask:start", "audio", "ask:end"]);
});

test("MeetingBroker forwards the selected language preference into session creation", async () => {
  let receivedLanguagePreference: SessionLanguagePreference | null = null;
  const broker = new MeetingBroker((options) => {
    receivedLanguagePreference = options.languagePreference;
    return createMockSession({
      snapshot: createMockSnapshot({
        sessionId: "33333333-3333-3333-3333-333333333333",
        languagePreference: options.languagePreference,
      }),
    });
  }, readEmptyConfig);
  const socket = new MockSocket();

  broker.attach(socket as never);
  socket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Language test",
        includeTabAudio: false,
        languagePreference: "hinglish",
      })
    )
  );
  await flushAsyncWork();

  assert.equal(receivedLanguagePreference, "hinglish");
});

test("MeetingBroker sends a snapshot when a companion joins an existing session", async () => {
  const session = createMockSession({
      snapshot: createMockSnapshot({
        sessionId: "44444444-4444-4444-4444-444444444444",
        transcriptEntries: [{ text: "Hello team", committedAt: "10:00:00" }],
        questionAnswers: [{ question: "What happened?", answer: "Kickoff", askedAt: "10:02:00" }],
        partialTranscript: "still talking",
    }),
  });
  const broker = new MeetingBroker(() => session, readEmptyConfig);
  const captureSocket = new MockSocket();
  const companionSocket = new MockSocket();

  broker.attach(captureSocket as never);
  broker.attach(companionSocket as never);

  captureSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Joinable",
        includeTabAudio: true,
        languagePreference: "auto",
      })
    )
  );
  await flushAsyncWork();

  companionSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "join_session",
        sessionId: "44444444-4444-4444-4444-444444444444",
      })
    )
  );
  await flushAsyncWork();

  const events = parseSentEvents(companionSocket);
  const snapshot = events.find((event) => event.type === "session_snapshot");
  assert.ok(snapshot);
  if (snapshot?.type !== "session_snapshot") {
    return;
  }

  assert.equal(snapshot.partialTranscript, "still talking");
  assert.deepEqual(snapshot.transcriptEntries, [{ text: "Hello team", committedAt: "10:00:00" }]);
  assert.deepEqual(snapshot.questionAnswers, [
    { question: "What happened?", answer: "Kickoff", askedAt: "10:02:00" },
  ]);
});

test("MeetingBroker refreshes participant counts for existing peers when a companion joins", async () => {
  const session = createMockSession();
  const broker = new MeetingBroker(() => session, readEmptyConfig);
  const captureSocket = new MockSocket();
  const companionSocket = new MockSocket();

  broker.attach(captureSocket as never);
  broker.attach(companionSocket as never);

  captureSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Participant counts",
        includeTabAudio: true,
        languagePreference: "auto",
      })
    )
  );
  await flushAsyncWork();

  captureSocket.sent.length = 0;

  companionSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "join_session",
        sessionId: session.id,
      })
    )
  );
  await flushAsyncWork();

  const captureSnapshots = parseSentEvents(captureSocket).filter(
    (event) => event.type === "session_snapshot"
  );
  assert.ok(captureSnapshots.length > 0);
  const latestSnapshot = captureSnapshots.at(-1);
  assert.ok(latestSnapshot);
  if (latestSnapshot?.type !== "session_snapshot") {
    return;
  }

  assert.equal(latestSnapshot.captureClients, 1);
  assert.equal(latestSnapshot.companionClients, 1);
});

test("MeetingBroker rejects capture-only actions from companion sockets", async () => {
  const session = createMockSession();
  const broker = new MeetingBroker(() => session, readEmptyConfig);
  const captureSocket = new MockSocket();
  const companionSocket = new MockSocket();

  broker.attach(captureSocket as never);
  broker.attach(companionSocket as never);

  captureSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Shared session",
        includeTabAudio: true,
        languagePreference: "english",
      })
    )
  );
  await flushAsyncWork();

  companionSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "join_session",
        sessionId: session.id,
      })
    )
  );
  await flushAsyncWork();

  companionSocket.emit("message", Buffer.from(JSON.stringify({ type: "pause_session" })));
  await flushAsyncWork();

  assert.equal(session.pauseCalls, 0);
  const lastEvent = parseSentEvents(companionSocket).at(-1);
  assert.deepEqual(lastEvent, {
    type: "error",
    message: "This action requires the active capture client.",
  });
});

test("MeetingBroker rejects stop_session from companion sockets", async () => {
  const session = createMockSession();
  const broker = new MeetingBroker(() => session, readEmptyConfig);
  const captureSocket = new MockSocket();
  const companionSocket = new MockSocket();

  broker.attach(captureSocket as never);
  broker.attach(companionSocket as never);

  captureSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Shared stop guard",
        includeTabAudio: true,
        languagePreference: "english",
      })
    )
  );
  await flushAsyncWork();

  companionSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "join_session",
        sessionId: session.id,
      })
    )
  );
  await flushAsyncWork();

  companionSocket.emit("message", Buffer.from(JSON.stringify({ type: "stop_session" })));
  await flushAsyncWork();

  assert.equal(session.stopCalls, 0);
  const lastEvent = parseSentEvents(companionSocket).at(-1);
  assert.deepEqual(lastEvent, {
    type: "error",
    message: "This action requires the active capture client.",
  });
});

test("MeetingBroker marks late companion snapshots as paused when no capture client is attached", async () => {
  const session = createMockSession({
    snapshot: createMockSnapshot({
      sessionId: "55555555-5555-5555-5555-555555555555",
      captureState: "live",
      statusMessage: "Listening live.",
    }),
  });
  const broker = new MeetingBroker(() => session, readEmptyConfig);
  const captureSocket = new MockSocket();
  const firstCompanionSocket = new MockSocket();
  const lateCompanionSocket = new MockSocket();

  broker.attach(captureSocket as never);
  broker.attach(firstCompanionSocket as never);
  broker.attach(lateCompanionSocket as never);

  captureSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "start_session",
        sampleRate: 48_000,
        title: "Late companion",
        includeTabAudio: true,
        languagePreference: "auto",
      })
    )
  );
  await flushAsyncWork();

  firstCompanionSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "join_session",
        sessionId: session.id,
      })
    )
  );
  await flushAsyncWork();

  captureSocket.emit("close");
  await flushAsyncWork();
  lateCompanionSocket.sent.length = 0;

  lateCompanionSocket.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "join_session",
        sessionId: session.id,
      })
    )
  );
  await flushAsyncWork();

  const snapshot = parseSentEvents(lateCompanionSocket).find((event) => event.type === "session_snapshot");
  assert.ok(snapshot);
  if (snapshot?.type !== "session_snapshot") {
    return;
  }

  assert.equal(snapshot.captureClients, 0);
  assert.equal(snapshot.captureState, "paused");
  assert.equal(
    snapshot.statusMessage,
    "Capture source disconnected. The session is still open while you reconnect."
  );
});
