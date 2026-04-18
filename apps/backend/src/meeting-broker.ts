import {
  parseClientEvent,
  serializeServerEvent,
  type ClientEvent,
  type ServerEvent,
  type SessionRole,
} from "@realtimebuddy/shared/protocol";
import type WebSocket from "ws";

import { MeetingSession } from "./meeting-session";

type MeetingSessionLike = Pick<
  MeetingSession,
  | "id"
  | "start"
  | "pushAudioChunk"
  | "logAudioDebug"
  | "commitTranscript"
  | "pause"
  | "resume"
  | "ask"
  | "stop"
  | "getSnapshot"
>;

type SocketState = {
  hostedSession: HostedSession | null;
  role: SessionRole | null;
  lifecycleWork: Promise<void>;
  closed: boolean;
  stopping: boolean;
};

type HostedSession = {
  session: MeetingSessionLike;
  sockets: Set<WebSocket>;
  socketStates: Set<SocketState>;
  roles: Map<WebSocket, SessionRole>;
  stopPromise: Promise<void> | null;
  stopping: boolean;
};

export class MeetingBroker {
  private readonly sessions = new Map<string, HostedSession>();

  constructor(
    private readonly createSession: (options: ConstructorParameters<typeof MeetingSession>[0]) => MeetingSessionLike =
      (options) => new MeetingSession(options)
  ) {}

  attach(socket: WebSocket) {
    const state: SocketState = {
      hostedSession: null,
      role: null,
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
      this.detachSocket(socket, state);
    });
  }

  private async handleMessage(socket: WebSocket, state: SocketState, message: ClientEvent) {
    if (state.closed) {
      return;
    }

    if (message.type === "start_session") {
      await this.handleStartSession(socket, state, message);
      return;
    }

    if (message.type === "join_session") {
      await this.handleJoinSession(socket, state, message);
      return;
    }

    const hostedSession = state.hostedSession;
    if (!hostedSession) {
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
      if (!this.requireCaptureRole(socket, state)) {
        return;
      }

      hostedSession.session.pushAudioChunk({
        pcmBase64: message.pcmBase64,
        sampleRate: message.sampleRate,
      });
      return;
    }

    if (message.type === "audio_debug") {
      if (!this.requireCaptureRole(socket, state)) {
        return;
      }

      hostedSession.session.logAudioDebug(message);
      return;
    }

    if (message.type === "commit_transcript") {
      if (!this.requireCaptureRole(socket, state)) {
        return;
      }

      await hostedSession.session.commitTranscript();
      return;
    }

    if (message.type === "pause_session") {
      if (!this.requireCaptureRole(socket, state)) {
        return;
      }

      await hostedSession.session.pause();
      return;
    }

    if (message.type === "resume_session") {
      if (!this.requireCaptureRole(socket, state)) {
        return;
      }

      await hostedSession.session.resume();
      return;
    }

    if (message.type === "ask") {
      await hostedSession.session.ask(message.question);
      return;
    }

    if (message.type === "stop_session") {
      if (!this.requireCaptureRole(socket, state)) {
        return;
      }

      state.stopping = true;
      await this.stopHostedSession(hostedSession);
    }
  }

  private async handleStartSession(
    socket: WebSocket,
    state: SocketState,
    message: Extract<ClientEvent, { type: "start_session" }>
  ) {
    const requestedRole = message.role ?? "capture";
    if (requestedRole !== "capture") {
      this.send(socket, {
        type: "error",
        message: "Only capture clients can create or resume a recording session.",
      });
      return;
    }

    if (message.sessionId) {
      const existingSession = this.sessions.get(message.sessionId);
      if (!existingSession) {
        this.send(socket, {
          type: "error",
          message: `Session ${message.sessionId} was not found.`,
        });
        return;
      }

      if (this.captureClientCount(existingSession) > 0) {
        this.send(socket, {
          type: "error",
          message: "A capture client is already attached to this session.",
        });
        return;
      }

      this.attachSocket(existingSession, socket, state, "capture");
      if (existingSession.session.getSnapshot().captureState === "paused") {
        await existingSession.session.resume();
      }
      this.sendSessionAttached(socket, existingSession);
      this.broadcastSessionSnapshot(existingSession);
      return;
    }

    const hostedSession = this.createHostedSession(message);
    this.attachSocket(hostedSession, socket, state, "capture");
    try {
      await hostedSession.session.start();
    } catch (error) {
      this.sessions.delete(hostedSession.session.id);
      this.detachSocket(socket, state);
      throw error;
    }
    this.sendSessionSnapshot(socket, hostedSession);

    if (state.closed) {
      this.detachSocket(socket, state);
    }
  }

  private async handleJoinSession(
    socket: WebSocket,
    state: SocketState,
    message: Extract<ClientEvent, { type: "join_session" }>
  ) {
    const hostedSession = this.sessions.get(message.sessionId);
    if (!hostedSession) {
      this.send(socket, {
        type: "error",
        message: `Session ${message.sessionId} was not found.`,
      });
      return;
    }

    const role = message.role ?? "companion";
    if (role !== "companion") {
      this.send(socket, {
        type: "error",
        message: "Use start_session to attach a capture client.",
      });
      return;
    }

    this.attachSocket(hostedSession, socket, state, role);
    this.sendSessionAttached(socket, hostedSession);
    this.broadcastSessionSnapshot(hostedSession);
  }

  private createHostedSession(
    message: Extract<ClientEvent, { type: "start_session" }>
  ) {
    const hostedSession = {
      session: null as unknown as MeetingSessionLike,
      sockets: new Set<WebSocket>(),
      socketStates: new Set<SocketState>(),
      roles: new Map<WebSocket, SessionRole>(),
      stopPromise: null,
      stopping: false,
    };

    const session = this.createSession({
      sampleRate: message.sampleRate,
      title: message.title,
      includeTabAudio: message.includeTabAudio,
      languagePreference: message.languagePreference,
      staticUserSeed: message.staticUserSeed,
      meetingSeed: message.meetingSeed,
      sendEvent: (event) => {
        this.broadcast(hostedSession, event);
      },
    });

    hostedSession.session = session;
    this.sessions.set(session.id, hostedSession);
    return hostedSession;
  }

  private attachSocket(
    hostedSession: HostedSession,
    socket: WebSocket,
    state: SocketState,
    role: SessionRole
  ) {
    if (state.hostedSession && state.hostedSession !== hostedSession) {
      this.detachSocket(socket, state);
    }

    hostedSession.sockets.add(socket);
    hostedSession.socketStates.add(state);
    hostedSession.roles.set(socket, role);
    state.hostedSession = hostedSession;
    state.role = role;
    state.stopping = false;
  }

  private detachSocket(socket: WebSocket, state: SocketState) {
    const hostedSession = state.hostedSession;
    if (!hostedSession) {
      return;
    }

    hostedSession.sockets.delete(socket);
    hostedSession.socketStates.delete(state);
    const previousRole = hostedSession.roles.get(socket);
    hostedSession.roles.delete(socket);
    state.hostedSession = null;
    state.role = null;

    if (previousRole === "capture" && hostedSession.sockets.size > 0 && !hostedSession.stopping) {
      this.broadcast(hostedSession, {
        type: "capture_client_disconnected",
        message: "Capture source disconnected. The session is still open while you reconnect.",
      });
    }

    if (hostedSession.sockets.size > 0 && !hostedSession.stopping) {
      this.broadcastSessionSnapshot(hostedSession);
    }

    if (hostedSession.sockets.size === 0 && !hostedSession.stopping) {
      void this.stopHostedSession(hostedSession);
    }
  }

  private async stopHostedSession(hostedSession: HostedSession) {
    if (hostedSession.stopPromise) {
      return await hostedSession.stopPromise;
    }

    hostedSession.stopping = true;
    this.sessions.delete(hostedSession.session.id);
    for (const socketState of hostedSession.socketStates) {
      socketState.hostedSession = null;
      socketState.role = null;
      socketState.stopping = true;
    }

    hostedSession.stopPromise = hostedSession.session.stop().finally(() => {
      hostedSession.sockets.clear();
      hostedSession.socketStates.clear();
      hostedSession.roles.clear();
    });

    return await hostedSession.stopPromise;
  }

  private sendSessionAttached(socket: WebSocket, hostedSession: HostedSession) {
    const snapshot = hostedSession.session.getSnapshot();
    this.send(socket, {
      type: "session_ready",
      sessionId: snapshot.sessionId,
      title: snapshot.title,
      includeTabAudio: snapshot.includeTabAudio,
      languagePreference: snapshot.languagePreference,
      notePath: snapshot.notePath,
      notePathRelative: snapshot.notePathRelative,
      logPath: snapshot.logPath,
      logPathRelative: snapshot.logPathRelative,
      model: snapshot.model,
    });

    if (snapshot.model) {
      this.send(socket, {
        type: "buddy_ready",
        model: snapshot.model,
      });
    }

    this.sendSessionSnapshot(socket, hostedSession);
  }

  private sendSessionSnapshot(socket: WebSocket, hostedSession: HostedSession) {
    const snapshot = hostedSession.session.getSnapshot();
    const captureClients = this.captureClientCount(hostedSession);
    const companionClients = this.companionClientCount(hostedSession);
    const captureDisconnected = captureClients === 0 && snapshot.captureState === "live";
    const captureState = captureDisconnected ? "paused" : snapshot.captureState;
    const statusMessage = captureDisconnected
      ? "Capture source disconnected. The session is still open while you reconnect."
      : snapshot.statusMessage;

    this.send(socket, {
      type: "session_snapshot",
      sessionId: snapshot.sessionId,
      title: snapshot.title,
      includeTabAudio: snapshot.includeTabAudio,
      languagePreference: snapshot.languagePreference,
      notePath: snapshot.notePath,
      notePathRelative: snapshot.notePathRelative,
      logPath: snapshot.logPath,
      logPathRelative: snapshot.logPathRelative,
      model: snapshot.model,
      partialTranscript: snapshot.partialTranscript,
      provisionalEntries: snapshot.provisionalEntries,
      transcriptEntries: snapshot.transcriptEntries,
      buddyEvents: snapshot.buddyEvents,
      questionAnswers: snapshot.questionAnswers,
      markdown: snapshot.markdown,
      captureState,
      statusMessage,
      captureClients,
      companionClients,
    });
  }

  private broadcastSessionSnapshot(hostedSession: HostedSession) {
    for (const socket of hostedSession.sockets) {
      this.sendSessionSnapshot(socket, hostedSession);
    }
  }

  private requireCaptureRole(socket: WebSocket, state: SocketState) {
    if (state.role === "capture") {
      return true;
    }

    this.send(socket, {
      type: "error",
      message: "This action requires the active capture client.",
    });
    return false;
  }

  private captureClientCount(hostedSession: HostedSession) {
    return [...hostedSession.roles.values()].filter((role) => role === "capture").length;
  }

  private companionClientCount(hostedSession: HostedSession) {
    return [...hostedSession.roles.values()].filter((role) => role === "companion").length;
  }

  private isLifecycleEvent(message: ClientEvent) {
    return (
      message.type === "start_session" ||
      message.type === "join_session" ||
      message.type === "pause_session" ||
      message.type === "resume_session" ||
      message.type === "stop_session"
    );
  }

  private broadcast(hostedSession: HostedSession, event: ServerEvent) {
    for (const socket of hostedSession.sockets) {
      this.send(socket, event);
    }
  }

  private send(socket: WebSocket, event: ServerEvent) {
    socket.send(serializeServerEvent(event));
  }
}
