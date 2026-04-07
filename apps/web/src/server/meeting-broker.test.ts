import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import type { SessionLanguagePreference } from "../shared/language-preferences";
import { MeetingBroker } from "./meeting-broker";

type MockSession = {
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
  start: () => Promise<void>;
  pushAudioChunk: (chunk: { pcmBase64: string; sampleRate: number }) => void;
  logAudioDebug: (payload: MockSession["logAudioDebugCalls"][number]) => void;
  commitTranscript: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  ask: (question: string) => Promise<void>;
  stop: () => Promise<void>;
};

class MockSocket extends EventEmitter {
  readonly sent: string[] = [];

  send(payload: string) {
    this.sent.push(payload);
  }
}

function createMockSession(): MockSession {
  return {
    startCalls: 0,
    pushAudioChunkCalls: [],
    logAudioDebugCalls: [],
    commitCalls: 0,
    pauseCalls: 0,
    resumeCalls: 0,
    askCalls: [],
    stopCalls: 0,
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
  };
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("MeetingBroker routes pause and resume to the active session", async () => {
  const createdSessions: MockSession[] = [];
  const broker = new MeetingBroker(() => {
    const session = createMockSession();
    createdSessions.push(session);
    return session;
  });
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

test("MeetingBroker stops the active session when the socket closes", async () => {
  const createdSessions: MockSession[] = [];
  const broker = new MeetingBroker(() => {
    const session = createMockSession();
    createdSessions.push(session);
    return session;
  });
  const socket = new MockSocket();

  broker.attach(socket as never);
  socket.emit(
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

  const [session] = createdSessions;
  socket.emit("close");
  await flushAsyncWork();

  assert.equal(session.stopCalls, 1);
});

test("MeetingBroker serializes pause and resume on the same socket", async () => {
  let releasePause: (() => void) | null = null;
  const callOrder: string[] = [];
  const broker = new MeetingBroker(() => ({
    start: async () => {
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
  }));
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
  assert.ok(releasePause);

  releasePause?.();
  await flushAsyncWork();
  await flushAsyncWork();

  assert.deepEqual(callOrder, ["start", "pause:start", "pause:end", "resume"]);
});

test("MeetingBroker stops immediately when the socket closes during in-flight work", async () => {
  let releaseAsk: (() => void) | null = null;
  let stopCalls = 0;
  const callOrder: string[] = [];
  const broker = new MeetingBroker(() => ({
    start: async () => {
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
  }));
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

  releaseAsk?.();
  await flushAsyncWork();
});

test("MeetingBroker keeps live audio flowing while an ask is in flight", async () => {
  let releaseAsk: (() => void) | null = null;
  const callOrder: string[] = [];
  const broker = new MeetingBroker(() => ({
    start: async () => {
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
  }));
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

  releaseAsk?.();
  await flushAsyncWork();
  assert.deepEqual(callOrder, ["start", "ask:start", "audio", "ask:end"]);
});

test("MeetingBroker forwards the selected language preference into session creation", async () => {
  let receivedLanguagePreference: SessionLanguagePreference | null = null;
  const broker = new MeetingBroker((options) => {
    receivedLanguagePreference = options.languagePreference;
    return createMockSession();
  });
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
