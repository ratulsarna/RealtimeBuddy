import type WebSocket from "ws";

import {
  parseClientEvent,
  serializeServerEvent,
  type ClientEvent,
  type ServerEvent,
} from "../shared/protocol";
import { MeetingSession } from "./meeting-session";

type MeetingSessionLike = Pick<
  MeetingSession,
  "start" | "pushAudioChunk" | "logAudioDebug" | "commitTranscript" | "pause" | "resume" | "ask" | "stop"
>;

type SocketState = {
  session: MeetingSessionLike | null;
  lifecycleWork: Promise<void>;
  closed: boolean;
  stopping: boolean;
};

export class MeetingBroker {
  constructor(
    private readonly createSession: (options: ConstructorParameters<typeof MeetingSession>[0]) => MeetingSessionLike =
      (options) => new MeetingSession(options)
  ) {}

  attach(socket: WebSocket) {
    const state: SocketState = {
      session: null,
      lifecycleWork: Promise.resolve(),
      closed: false,
      stopping: false,
    };

    socket.on("message", (raw) => {
      let message: ClientEvent;
      try {
        message = parseClientEvent(raw.toString());
      } catch (error) {
        this.send(socket, {
          type: "error",
          message: String(error),
        });
        return;
      }

      if (this.isLifecycleEvent(message)) {
        state.lifecycleWork = state.lifecycleWork
          .then(() => this.handleMessage(socket, state, message))
          .catch((error: unknown) => {
            this.send(socket, {
              type: "error",
              message: String(error),
            });
          });
        return;
      }

      void this.handleMessage(socket, state, message).catch((error: unknown) => {
        this.send(socket, {
          type: "error",
          message: String(error),
        });
      });
    });

    socket.on("close", () => {
      state.closed = true;
      state.stopping = true;
      const session = state.session;
      state.session = null;
      void session?.stop();
    });
  }

  private async handleMessage(socket: WebSocket, state: SocketState, message: ClientEvent) {
    if (state.closed) {
      return;
    }

    if (message.type === "start_session") {
      state.stopping = false;
      const session = this.createSession({
        sampleRate: message.sampleRate,
        title: message.title,
        includeTabAudio: message.includeTabAudio,
        sendEvent: (event) => {
          this.send(socket, event);
        },
      });
      state.session = session;
      await session.start();
      if (state.closed && state.session === session) {
        state.session = null;
        await session.stop();
      }
      return;
    }

    if (!state.session) {
      if (state.stopping) {
        return;
      }

      this.send(socket, {
        type: "error",
        message: "Session has not started yet.",
      });
      return;
    }

    if (message.type === "audio_chunk") {
      state.session.pushAudioChunk({
        pcmBase64: message.pcmBase64,
        sampleRate: message.sampleRate,
      });
      return;
    }

    if (message.type === "audio_debug") {
      state.session.logAudioDebug(message);
      return;
    }

    if (message.type === "commit_transcript") {
      await state.session.commitTranscript();
      return;
    }

    if (message.type === "pause_session") {
      await state.session.pause();
      return;
    }

    if (message.type === "resume_session") {
      await state.session.resume();
      return;
    }

    if (message.type === "ask") {
      await state.session.ask(message.question);
      return;
    }

    if (message.type === "stop_session") {
      state.stopping = true;
      const session = state.session;
      state.session = null;
      await session.stop();
      return;
    }
  }

  private isLifecycleEvent(message: ClientEvent) {
    return (
      message.type === "start_session" ||
      message.type === "pause_session" ||
      message.type === "resume_session" ||
      message.type === "stop_session"
    );
  }

  private send(socket: WebSocket, event: ServerEvent) {
    socket.send(serializeServerEvent(event));
  }
}
