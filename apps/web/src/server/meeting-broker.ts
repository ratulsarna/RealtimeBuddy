import type WebSocket from "ws";

import { parseClientEvent, serializeServerEvent, type ServerEvent } from "../shared/protocol";
import { MeetingSession } from "./meeting-session";

type SocketState = {
  session: MeetingSession | null;
};

export class MeetingBroker {
  attach(socket: WebSocket) {
    const state: SocketState = {
      session: null,
    };

    socket.on("message", (raw) => {
      const payload = raw.toString();
      void this.handleMessage(socket, state, payload).catch((error: unknown) => {
        this.send(socket, {
          type: "error",
          message: String(error),
        });
      });
    });

    socket.on("close", () => {
      if (state.session) {
        void state.session.stop();
      }
    });
  }

  private async handleMessage(socket: WebSocket, state: SocketState, payload: string) {
    const message = parseClientEvent(payload);

    if (message.type === "start_session") {
      state.session = new MeetingSession({
        sampleRate: message.sampleRate,
        title: message.title,
        includeTabAudio: message.includeTabAudio,
        sendEvent: (event) => {
          this.send(socket, event);
        },
      });
      await state.session.start();
      return;
    }

    if (!state.session) {
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

    if (message.type === "commit_transcript") {
      await state.session.commitTranscript();
      return;
    }

    if (message.type === "ask") {
      await state.session.ask(message.question);
      return;
    }

    if (message.type === "stop_session") {
      await state.session.stop();
      state.session = null;
    }
  }

  private send(socket: WebSocket, event: ServerEvent) {
    socket.send(serializeServerEvent(event));
  }
}
