"use client";

import { useEffect, useRef, useState } from "react";

import {
  listAudioInputDevices,
  startAudioCapture,
  type AudioCaptureHandle,
  type AudioInputDevice,
} from "@/lib/audio-capture";
import { resolveBrowserBackendConfig } from "@/lib/backend-config";
import {
  getSessionLanguageLabel,
  sessionLanguageOptions,
  type SessionLanguagePreference,
} from "@realtimebuddy/shared/language-preferences";
import { type ServerEvent } from "@realtimebuddy/shared/protocol";

type PendingTranscriptEntry = {
  id: string;
  text: string;
  at: string;
};

type CommittedTranscriptEntry = {
  text: string;
  at: string;
};

type QuestionAnswer = {
  question: string;
  answer: string;
  askedAt?: string;
};

type AudioDiagnostics = {
  rms: number;
  peak: number;
  gateOpen: boolean;
  openThreshold: number;
  closeThreshold: number;
  candidateChunks: number;
  sentChunks: number;
  droppedChunks: number;
};

type CaptureIntent = "idle" | "starting" | "resuming";
type SessionMode = "local_capture" | "companion" | null;
type ConnectionState =
  | "idle"
  | "connecting"
  | "starting"
  | "live"
  | "paused"
  | "resuming"
  | "stopping";

type MeetingBuddyAppProps = {
  backendBaseUrl?: string;
};

function formatAskedAt(askedAt?: string) {
  return askedAt ? ` at ${askedAt}` : "";
}

export function MeetingBuddyApp({
  backendBaseUrl = "",
}: MeetingBuddyAppProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [sessionMode, setSessionMode] = useState<SessionMode>(null);
  const [sessionId, setSessionId] = useState("");
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [includeTabAudio, setIncludeTabAudio] = useState(false);
  const [languagePreference, setLanguagePreference] = useState<SessionLanguagePreference>("auto");
  const [title, setTitle] = useState("Meeting Buddy");
  const [question, setQuestion] = useState("");
  const [microphones, setMicrophones] = useState<AudioInputDevice[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [provisionalEntries, setProvisionalEntries] = useState<PendingTranscriptEntry[]>([]);
  const [transcriptEntries, setTranscriptEntries] = useState<CommittedTranscriptEntry[]>([]);
  const [noteMarkdown, setNoteMarkdown] = useState("");
  const [notePathRelative, setNotePathRelative] = useState("");
  const [logPathRelative, setLogPathRelative] = useState("");
  const [statusMessage, setStatusMessage] = useState("Ready when you are.");
  const [modelName, setModelName] = useState("");
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [questionAnswers, setQuestionAnswers] = useState<QuestionAnswer[]>([]);
  const [audioDiagnostics, setAudioDiagnostics] = useState<AudioDiagnostics | null>(null);
  const [captureClientCount, setCaptureClientCount] = useState(0);
  const [companionClientCount, setCompanionClientCount] = useState(0);
  const [isAsking, setIsAsking] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<AudioCaptureHandle | null>(null);
  const pendingQuestionRef = useRef("");
  const answerBufferRef = useRef("");
  const answerFlushTimerRef = useRef<number | null>(null);
  const pauseFlushTimerRef = useRef<number | null>(null);
  const pendingSocketMessagesRef = useRef<string[]>([]);
  const captureRequestIdRef = useRef(0);
  const captureIntentRef = useRef<CaptureIntent>("idle");
  const captureForwardingEnabledRef = useRef(true);
  const autoJoinAttemptedRef = useRef(false);
  const joinSessionRef = useRef<(targetSessionId?: string) => Promise<void>>(async () => undefined);
  const statusMessageRef = useRef("Ready when you are.");
  const closeMessageRef = useRef<string | null>(null);
  const sessionModeRef = useRef<SessionMode>(null);
  const connectionStateRef = useRef<ConnectionState>("idle");
  const captureDisconnectedRef = useRef(false);

  useEffect(() => {
    statusMessageRef.current = statusMessage;
  }, [statusMessage]);

  useEffect(() => {
    sessionModeRef.current = sessionMode;
  }, [sessionMode]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    if (window.location.hostname === "0.0.0.0") {
      const redirectUrl = new URL(window.location.href);
      redirectUrl.hostname = "localhost";
      window.location.replace(redirectUrl.toString());
      return;
    }

    const mediaDevices = navigator.mediaDevices;
    const refreshMicrophones = () => {
      void listAudioInputDevices().then((devices) => {
        setMicrophones(devices);
      });
    };

    const querySessionId = new URL(window.location.href).searchParams.get("session")?.trim() ?? "";
    if (querySessionId) {
      setSessionIdInput(querySessionId);
    }

    refreshMicrophones();
    mediaDevices?.addEventListener("devicechange", refreshMicrophones);

    return () => {
      mediaDevices?.removeEventListener("devicechange", refreshMicrophones);
      if (answerFlushTimerRef.current !== null) {
        window.clearTimeout(answerFlushTimerRef.current);
      }
      if (pauseFlushTimerRef.current !== null) {
        window.clearTimeout(pauseFlushTimerRef.current);
      }
      captureIntentRef.current = "idle";
      captureForwardingEnabledRef.current = true;
      captureRequestIdRef.current += 1;
      captureRef.current?.stop();
      socketRef.current?.close();
      pendingSocketMessagesRef.current = [];
    };
  }, [backendBaseUrl]);

  const selectedMicLabel =
    microphones.find((device) => device.deviceId === selectedMicId)?.label ||
    "Browser default microphone";
  const backendTargetLabel = backendBaseUrl.replace(/\/$/, "") || "current host:3001";
  const sessionModeLabel =
    sessionMode === "local_capture"
      ? "local capture"
      : sessionMode === "companion"
        ? "companion"
        : "detached";

  const syncSessionQuery = (nextSessionId: string) => {
    const url = new URL(window.location.href);
    if (nextSessionId) {
      url.searchParams.set("session", nextSessionId);
    } else {
      url.searchParams.delete("session");
    }
    window.history.replaceState(null, "", url.toString());
  };

  const resetLiveState = () => {
    setAudioLevel(0);
    setPartialTranscript("");
    setProvisionalEntries([]);
    setTranscriptEntries([]);
    setQuestionAnswers([]);
    setCurrentAnswer("");
    setIsAsking(false);
    setNoteMarkdown("");
    setNotePathRelative("");
    setLogPathRelative("");
    setAudioDiagnostics(null);
    setModelName("");
    setCaptureClientCount(0);
    setCompanionClientCount(0);
    captureDisconnectedRef.current = false;
    answerBufferRef.current = "";
    pendingQuestionRef.current = "";
    if (answerFlushTimerRef.current !== null) {
      window.clearTimeout(answerFlushTimerRef.current);
      answerFlushTimerRef.current = null;
    }
  };

  const queueOrSendSocketMessage = (payload: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      pendingSocketMessagesRef.current.push(payload);
      return;
    }

    socket.send(payload);
  };

  const flushPendingSocketMessages = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !captureForwardingEnabledRef.current) {
      return;
    }

    for (const payload of pendingSocketMessagesRef.current) {
      socket.send(payload);
    }
    pendingSocketMessagesRef.current = [];
  };

  const queueOrSendCaptureMessage = (payload: string) => {
    if (!captureForwardingEnabledRef.current) {
      pendingSocketMessagesRef.current.push(payload);
      return;
    }

    queueOrSendSocketMessage(payload);
  };

  const isCurrentCaptureRequest = (requestId: number, expectedIntent: CaptureIntent) => {
    if (requestId !== captureRequestIdRef.current || captureIntentRef.current !== expectedIntent) {
      return false;
    }

    if (expectedIntent === "resuming") {
      return socketRef.current?.readyState === WebSocket.OPEN;
    }

    return true;
  };

  const startCapture = (
    onReady: (capture: AudioCaptureHandle) => void,
    onErrorState: ConnectionState,
    readyMessage: (capture: AudioCaptureHandle) => string,
    requestId: number,
    expectedIntent: CaptureIntent
  ) => {
    void startAudioCapture({
      includeTabAudio,
      deviceId: selectedMicId || undefined,
      onChunk: (pcmBase64, sampleRate) => {
        queueOrSendCaptureMessage(
          JSON.stringify({
            type: "audio_chunk",
            pcmBase64,
            sampleRate,
          })
        );
      },
      onSpeechPause: () => {
        queueOrSendCaptureMessage(
          JSON.stringify({
            type: "commit_transcript",
          })
        );
      },
      onLevel: (level) => {
        setAudioLevel(level);
      },
      onDebug: (diagnostics) => {
        setAudioDiagnostics(diagnostics);

        queueOrSendCaptureMessage(
          JSON.stringify({
            type: "audio_debug",
            ...diagnostics,
          })
        );
      },
    })
      .then((capture) => {
        if (!isCurrentCaptureRequest(requestId, expectedIntent)) {
          capture.stop();
          return;
        }

        captureRef.current = capture;
        void listAudioInputDevices().then((devices) => {
          setMicrophones(devices);
        });
        setStatusMessage(readyMessage(capture));
        onReady(capture);
      })
      .catch((error: unknown) => {
        if (!isCurrentCaptureRequest(requestId, expectedIntent)) {
          return;
        }

        setConnectionState(onErrorState);
        captureIntentRef.current = "idle";
        setAudioLevel(0);
        setStatusMessage(String(error));
      });
  };

  const requestBackendAccessToken = async () => {
    const response = await fetch("/api/backend-auth", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Could not authorize the backend connection.");
    }

    const payload = (await response.json()) as { token?: string };
    if (!payload.token) {
      throw new Error("Backend auth route returned no token.");
    }

    return payload.token;
  };

  const connectSocket = async (initialMessage: Record<string, unknown>) => {
    const backendAccessToken = await requestBackendAccessToken();
    const { webSocketUrl } = resolveBrowserBackendConfig({
      backendAccessToken,
      backendBaseUrl,
      pageUrl: window.location.href,
    });

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(webSocketUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify(initialMessage));
        flushPendingSocketMessages();
        resolve();
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerEvent;
        handleServerEvent(message);
      };

      socket.onerror = () => {
        reject(new Error("Could not open the backend websocket."));
      };

      socket.onclose = () => {
        const nextMessage =
          closeMessageRef.current ??
          (statusMessageRef.current === "Session stopped."
            ? "Session stopped."
            : "Session disconnected.");
        closeMessageRef.current = null;
        captureIntentRef.current = "idle";
        captureForwardingEnabledRef.current = true;
        captureRequestIdRef.current += 1;
        captureRef.current?.stop();
        captureRef.current = null;
        socketRef.current = null;
        pendingSocketMessagesRef.current = [];
        setIsAsking(false);
        setCurrentAnswer("");
        answerBufferRef.current = "";
        setConnectionState("idle");
        setSessionMode(null);
        setCaptureClientCount(0);
        setCompanionClientCount(0);
        setStatusMessage(nextMessage);
        syncSessionQuery("");
      };
    });
  };

  const startSession = () => {
    resetLiveState();
    setConnectionState("starting");
    setSessionMode("local_capture");
    setSessionId("");
    setStatusMessage("Requesting microphone access...");
    pendingSocketMessagesRef.current = [];
    captureForwardingEnabledRef.current = true;
    captureIntentRef.current = "starting";
    const requestId = captureRequestIdRef.current + 1;
    captureRequestIdRef.current = requestId;

    startCapture(
      async (capture) => {
        try {
          await connectSocket({
            type: "start_session",
            role: "capture",
            sampleRate: capture.sampleRate,
            title,
            includeTabAudio: capture.tabAudioEnabled,
            languagePreference,
          });
        } catch (error) {
          capture.stop();
          captureRef.current = null;
          captureIntentRef.current = "idle";
          captureForwardingEnabledRef.current = true;
          captureRequestIdRef.current += 1;
          setConnectionState("idle");
          setSessionMode(null);
          setAudioLevel(0);
          setStatusMessage(String(error));
        }
      },
      "idle",
      (capture) =>
        capture.tabAudioEnabled
          ? `${selectedMicLabel} is live with tab audio.`
          : `${selectedMicLabel} is live.`,
      requestId,
      "starting"
    );
  };

  const joinSession = async (targetSessionId = sessionIdInput.trim()) => {
    if (!targetSessionId) {
      return;
    }

    resetLiveState();
    setConnectionState("connecting");
    setSessionMode("companion");
    setSessionId(targetSessionId);
    setSessionIdInput(targetSessionId);
    setStatusMessage("Connecting to the live session...");

    try {
      await connectSocket({
        type: "join_session",
        role: "companion",
        sessionId: targetSessionId,
      });
    } catch (error) {
      socketRef.current?.close();
      socketRef.current = null;
      setConnectionState("idle");
      setSessionMode(null);
      setStatusMessage(String(error));
    }
  };

  joinSessionRef.current = joinSession;

  useEffect(() => {
    if (autoJoinAttemptedRef.current) {
      return;
    }

    if (connectionState !== "idle" || !sessionIdInput.trim()) {
      return;
    }

    autoJoinAttemptedRef.current = true;
    void joinSessionRef.current(sessionIdInput.trim());
  }, [connectionState, sessionIdInput]);

  const pauseSession = () => {
    if (!socketRef.current || !captureRef.current || sessionMode !== "local_capture") {
      return;
    }

    setConnectionState("paused");
    setAudioLevel(0);
    setStatusMessage("Pausing capture...");
    captureIntentRef.current = "idle";
    captureForwardingEnabledRef.current = false;
    captureRequestIdRef.current += 1;
    captureRef.current.stop();
    captureRef.current = null;
    pauseFlushTimerRef.current = window.setTimeout(() => {
      pauseFlushTimerRef.current = null;
      captureForwardingEnabledRef.current = true;
      flushPendingSocketMessages();
      queueOrSendSocketMessage(JSON.stringify({ type: "pause_session" }));
    }, 0);
  };

  const resumeSession = () => {
    if (!socketRef.current || sessionMode !== "local_capture") {
      return;
    }

    setConnectionState("resuming");
    setAudioLevel(0);
    setAudioDiagnostics(null);
    setStatusMessage("Reconnecting microphone...");
    captureForwardingEnabledRef.current = false;
    captureIntentRef.current = "resuming";
    const requestId = captureRequestIdRef.current + 1;
    captureRequestIdRef.current = requestId;
    startCapture(
      () => {
        queueOrSendSocketMessage(JSON.stringify({ type: "resume_session" }));
      },
      "paused",
      (capture) =>
        capture.tabAudioEnabled
          ? `${selectedMicLabel} is ready with tab audio. Reconnecting transcription...`
          : `${selectedMicLabel} is ready. Reconnecting transcription...`,
      requestId,
      "resuming"
    );
  };

  const stopSession = () => {
    if (sessionMode === "companion") {
      closeMessageRef.current = "Disconnected from the live session.";
      socketRef.current?.close();
      return;
    }

    captureIntentRef.current = "idle";
    captureRequestIdRef.current += 1;
    if (pauseFlushTimerRef.current !== null) {
      window.clearTimeout(pauseFlushTimerRef.current);
      pauseFlushTimerRef.current = null;
    }
    captureRef.current?.stop();
    captureRef.current = null;
    setAudioLevel(0);
    const socket = socketRef.current;
    if (!socket) {
      captureForwardingEnabledRef.current = true;
      pendingSocketMessagesRef.current = [];
      setConnectionState("idle");
      setSessionMode(null);
      setStatusMessage("Ready when you are.");
      syncSessionQuery("");
      return;
    }

    captureForwardingEnabledRef.current = true;
    flushPendingSocketMessages();
    socket.send(JSON.stringify({ type: "stop_session" }));
    setConnectionState("stopping");
    setStatusMessage("Finishing the current transcript...");
  };

  const copySessionId = async () => {
    if (!sessionId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(sessionId);
      setStatusMessage("Session ID copied to the clipboard.");
    } catch {
      setStatusMessage("Could not copy the session ID.");
    }
  };

  const handleServerEvent = (event: ServerEvent) => {
    if (event.type === "session_ready") {
      captureIntentRef.current = "idle";
      captureForwardingEnabledRef.current = true;
      captureDisconnectedRef.current = false;
      setSessionId(event.sessionId);
      setSessionIdInput(event.sessionId);
      setTitle(event.title);
      setIncludeTabAudio(event.includeTabAudio);
      setLanguagePreference(event.languagePreference);
      syncSessionQuery(event.sessionId);
      if (sessionModeRef.current === "local_capture") {
        setConnectionState("live");
        setStatusMessage(`Listening live on ${selectedMicLabel}.`);
      } else {
        setStatusMessage(`Connected to live session ${event.sessionId}.`);
      }
      setNotePathRelative(event.notePathRelative);
      setLogPathRelative(event.logPathRelative);
      setModelName(event.model);
      return;
    }

    if (event.type === "session_snapshot") {
      setSessionId(event.sessionId);
      setSessionIdInput(event.sessionId);
      setTitle(event.title);
      setIncludeTabAudio(event.includeTabAudio);
      setLanguagePreference(event.languagePreference);
      setNotePathRelative(event.notePathRelative);
      setLogPathRelative(event.logPathRelative);
      setModelName(event.model);
      setPartialTranscript(event.partialTranscript);
      setProvisionalEntries(
        event.provisionalEntries.map((entry) => ({
          id: entry.id,
          text: entry.text,
          at: entry.provisionalAt,
        }))
      );
      setTranscriptEntries(
        event.transcriptEntries
          .map((entry) => ({
            text: entry.text,
            at: entry.committedAt,
          }))
          .reverse()
      );
      setQuestionAnswers(
        event.questionAnswers.map((entry) => ({
          question: entry.question,
          answer: entry.answer,
          askedAt: entry.askedAt,
        }))
      );
      setNoteMarkdown(event.markdown);
      setCaptureClientCount(event.captureClients);
      setCompanionClientCount(event.companionClients);
      if (event.captureClients > 0) {
        captureDisconnectedRef.current = false;
      }
      if (!(captureDisconnectedRef.current && event.captureClients === 0 && sessionModeRef.current === "companion")) {
        setStatusMessage(event.statusMessage);
      }
      if (event.captureState === "paused") {
        setConnectionState("paused");
      } else if (event.captureState === "stopped") {
        setConnectionState("idle");
      } else {
        setConnectionState("live");
      }
      return;
    }

    if (event.type === "buddy_ready") {
      setModelName(event.model);
      return;
    }

    if (event.type === "status") {
      setStatusMessage(event.message);
      return;
    }

    if (event.type === "capture_client_disconnected") {
      captureDisconnectedRef.current = true;
      setCaptureClientCount(0);
      setStatusMessage(event.message);
      return;
    }

    if (event.type === "transcript_partial") {
      setPartialTranscript(event.text);
      return;
    }

    if (event.type === "transcript_provisional") {
      setPartialTranscript("");
      setProvisionalEntries((current) => [
        ...current.filter((entry) => entry.id !== event.provisionalId),
        {
          id: event.provisionalId,
          text: event.text,
          at: event.provisionalAt,
        },
      ]);
      return;
    }

    if (event.type === "transcript_committed") {
      setPartialTranscript("");
      setProvisionalEntries((current) =>
        event.resolvedProvisionalId
          ? current.filter((entry) => entry.id !== event.resolvedProvisionalId)
          : current.slice(1)
      );
      setTranscriptEntries((current) => [
        {
          text: event.text,
          at: event.committedAt,
        },
        ...current,
      ]);
      return;
    }

    if (event.type === "notes_updated") {
      setNoteMarkdown(event.markdown);
      return;
    }

    if (event.type === "session_paused") {
      captureIntentRef.current = "idle";
      captureForwardingEnabledRef.current = true;
      setConnectionState("paused");
      setAudioLevel(0);
      setAudioDiagnostics(null);
      setStatusMessage(
        sessionModeRef.current === "local_capture"
          ? "Capture paused. Resume when you are ready."
          : "Capture paused on the active recording source."
      );
      return;
    }

    if (event.type === "session_resumed") {
      captureIntentRef.current = "idle";
      captureForwardingEnabledRef.current = true;
      captureDisconnectedRef.current = false;
      flushPendingSocketMessages();
      setConnectionState("live");
      setStatusMessage(
        sessionModeRef.current === "local_capture"
          ? `Listening live on ${selectedMicLabel}.`
          : "Capture resumed on the active recording source."
      );
      return;
    }

    if (event.type === "answer_delta") {
      answerBufferRef.current += event.delta;
      if (answerFlushTimerRef.current === null) {
        answerFlushTimerRef.current = window.setTimeout(() => {
          setCurrentAnswer(answerBufferRef.current);
          answerFlushTimerRef.current = null;
        }, 120);
      }
      return;
    }

    if (event.type === "answer_done") {
      if (answerFlushTimerRef.current !== null) {
        window.clearTimeout(answerFlushTimerRef.current);
        answerFlushTimerRef.current = null;
      }
      answerBufferRef.current = "";
      setIsAsking(false);
      setQuestionAnswers((current) => [
        {
          question: pendingQuestionRef.current,
          answer: event.text,
        },
        ...current,
      ]);
      pendingQuestionRef.current = "";
      setCurrentAnswer("");
      return;
    }

    if (event.type === "error") {
      if (answerFlushTimerRef.current !== null) {
        window.clearTimeout(answerFlushTimerRef.current);
        answerFlushTimerRef.current = null;
      }
      answerBufferRef.current = "";
      setCurrentAnswer("");
      setIsAsking(false);
      if (sessionModeRef.current === "companion" && connectionStateRef.current === "connecting") {
        closeMessageRef.current = event.message;
        socketRef.current?.close();
      }
      setStatusMessage(event.message);
      return;
    }

    if (event.type === "session_stopped") {
      closeMessageRef.current = "Session stopped.";
      setConnectionState("idle");
      setSessionMode(null);
      setIsAsking(false);
      setStatusMessage("Session stopped.");
      setCaptureClientCount(0);
      setCompanionClientCount(0);
      syncSessionQuery("");
      socketRef.current?.close();
      socketRef.current = null;
    }
  };

  const sendQuestion = () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || !socketRef.current) {
      return;
    }

    pendingQuestionRef.current = trimmedQuestion;
    setIsAsking(true);
    setCurrentAnswer("");
    answerBufferRef.current = "";
    socketRef.current.send(
      JSON.stringify({
        type: "ask",
        question: trimmedQuestion,
      })
    );
    setQuestion("");
  };

  const canStart = connectionState === "idle";
  const canJoin = connectionState === "idle" && Boolean(sessionIdInput.trim());
  const canPause = sessionMode === "local_capture" && connectionState === "live";
  const canResume = sessionMode === "local_capture" && connectionState === "paused";
  const canStop = connectionState !== "idle";
  const canAsk =
    Boolean(socketRef.current) &&
    !isAsking &&
    (connectionState === "live" || connectionState === "paused");

  return (
    <main className="grain relative min-h-screen overflow-hidden px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <section className="glass-panel rounded-[2rem] p-5 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mono text-xs uppercase tracking-[0.3em] text-[var(--ink-soft)]">
                Ambient Meeting Companion
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--foreground)] md:text-6xl">
                Record from the browser or extension. Keep the live Q&A tab open either way.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ink-soft)] md:text-lg">
                RealtimeBuddy now supports a shared live session model: one capture source can stream audio
                while another browser tab stays attached for note review and live questions.
              </p>
            </div>
            <div className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel-strong)] px-5 py-4 shadow-[0_12px_30px_rgba(69,47,28,0.06)]">
              <p className="mono text-xs uppercase tracking-[0.28em] text-[var(--ink-soft)]">Status</p>
              <p className="mt-2 text-lg font-medium">{statusMessage}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-[var(--ink-soft)]">
                <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1">{connectionState}</span>
                <span className="rounded-full border border-[var(--line)] px-3 py-1">{sessionModeLabel}</span>
                {sessionId ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">session {sessionId}</span>
                ) : null}
                {modelName ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">{modelName}</span>
                ) : null}
                <span className="rounded-full border border-[var(--line)] px-3 py-1">
                  backend {backendTargetLabel}
                </span>
                {notePathRelative ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">{notePathRelative}</span>
                ) : null}
                {logPathRelative ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">{logPathRelative}</span>
                ) : null}
                <span className="rounded-full border border-[var(--line)] px-3 py-1">
                  {getSessionLanguageLabel(languagePreference)}
                </span>
                <span className="rounded-full border border-[var(--line)] px-3 py-1">
                  capture {captureClientCount}
                </span>
                <span className="rounded-full border border-[var(--line)] px-3 py-1">
                  companions {companionClientCount}
                </span>
                {audioDiagnostics ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">
                    gate {audioDiagnostics.gateOpen ? "open" : "closed"}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.9fr]">
          <div className="glass-panel rounded-[2rem] p-5 md:p-6">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <label className="flex flex-col gap-2">
                  <span className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                    Session Title
                  </span>
                  <input
                    className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Weekly review"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-[1fr_1.2fr_auto]">
                  <label className="flex flex-col gap-2">
                    <span className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                      Language
                    </span>
                    <select
                      className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                      disabled={!canStart}
                      onChange={(event) =>
                        setLanguagePreference(event.target.value as SessionLanguagePreference)
                      }
                      value={languagePreference}
                    >
                      {sessionLanguageOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                      Microphone
                    </span>
                    <select
                      className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                      disabled={!canStart}
                      onChange={(event) => setSelectedMicId(event.target.value)}
                      value={selectedMicId}
                    >
                      <option value="">Browser default microphone</option>
                      {microphones.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex items-end gap-3 rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3">
                    <input
                      checked={includeTabAudio}
                      disabled={!canStart}
                      onChange={(event) => setIncludeTabAudio(event.target.checked)}
                      type="checkbox"
                    />
                    <span className="text-sm text-[var(--foreground)]">Try tab audio too</span>
                  </label>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
                <label className="flex flex-col gap-2">
                  <span className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                    Companion Session ID
                  </span>
                  <input
                    className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                    disabled={!canStart}
                    value={sessionIdInput}
                    onChange={(event) => setSessionIdInput(event.target.value)}
                    placeholder="Paste an extension-owned session ID"
                  />
                </label>
                <button
                  className="rounded-full border border-[var(--line)] bg-white/60 px-5 py-3 font-medium text-[var(--foreground)] transition hover:bg-white disabled:opacity-50"
                  disabled={!canJoin}
                  onClick={() => {
                    void joinSession();
                  }}
                  type="button"
                >
                  Join session
                </button>
                <button
                  className="rounded-full border border-[var(--line)] bg-white/60 px-5 py-3 font-medium text-[var(--foreground)] transition hover:bg-white disabled:opacity-50"
                  disabled={!sessionId}
                  onClick={() => {
                    void copySessionId();
                  }}
                  type="button"
                >
                  Copy session ID
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-full bg-[var(--accent)] px-5 py-3 font-medium text-white shadow-[0_12px_24px_var(--glow)] transition hover:translate-y-[-1px] disabled:opacity-50"
                    disabled={!canStart}
                    onClick={startSession}
                    type="button"
                  >
                    Start local capture
                  </button>
                  <button
                    className="rounded-full border border-[var(--line)] bg-white/60 px-5 py-3 font-medium text-[var(--foreground)] transition hover:bg-white disabled:opacity-50"
                    disabled={!canPause}
                    onClick={pauseSession}
                    type="button"
                  >
                    Pause
                  </button>
                  <button
                    className="rounded-full border border-[var(--line)] bg-white/60 px-5 py-3 font-medium text-[var(--foreground)] transition hover:bg-white disabled:opacity-50"
                    disabled={!canResume}
                    onClick={resumeSession}
                    type="button"
                  >
                    Resume
                  </button>
                  <button
                    className="rounded-full border border-[var(--line)] bg-white/60 px-5 py-3 font-medium text-[var(--foreground)] transition hover:bg-white disabled:opacity-50"
                    disabled={!canStop}
                    onClick={stopSession}
                    type="button"
                  >
                    {sessionMode === "companion" ? "Leave session" : "Stop"}
                  </button>
                </div>

                <div className="rounded-2xl border border-[var(--line)] bg-white/55 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="mono text-xs uppercase tracking-[0.22em] text-[var(--ink-soft)]">
                        Live mic level
                      </p>
                      <p className="mt-1 text-sm text-[var(--ink-soft)]">{selectedMicLabel}</p>
                    </div>
                    <div className="h-3 w-40 overflow-hidden rounded-full bg-[var(--accent-soft)]/45">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                        style={{ width: `${audioLevel * 100}%` }}
                      />
                    </div>
                  </div>
                  {audioDiagnostics ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--ink-soft)] md:grid-cols-4">
                      <span>RMS {audioDiagnostics.rms.toFixed(4)}</span>
                      <span>Peak {audioDiagnostics.peak.toFixed(4)}</span>
                      <span>Gate {audioDiagnostics.gateOpen ? "open" : "closed"}</span>
                      <span>Candidates {audioDiagnostics.candidateChunks}</span>
                      <span>Open {audioDiagnostics.openThreshold.toFixed(3)}</span>
                      <span>Close {audioDiagnostics.closeThreshold.toFixed(3)}</span>
                      <span>Sent {audioDiagnostics.sentChunks}</span>
                      <span>Dropped {audioDiagnostics.droppedChunks}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-[2rem] p-5 md:p-6">
            <div className="flex h-full flex-col gap-4">
              <div>
                <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                  Ask Live
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                  Keep this tab attached as your live Q&A console while the extension or another browser tab
                  handles capture.
                </p>
              </div>

              <textarea
                className="min-h-32 rounded-[1.5rem] border border-[var(--line)] bg-white/70 px-4 py-4 outline-none transition focus:border-[var(--accent)]"
                disabled={!canAsk}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What did we decide about launch timing?"
                value={question}
              />

              <div className="flex items-center justify-between gap-3">
                <button
                  className="rounded-full bg-[var(--foreground)] px-5 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  disabled={!canAsk || !question.trim()}
                  onClick={sendQuestion}
                  type="button"
                >
                  Ask buddy
                </button>
                {currentAnswer ? (
                  <span className="mono text-xs uppercase tracking-[0.22em] text-[var(--ink-soft)]">
                    streaming reply
                  </span>
                ) : null}
              </div>

              <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/55 p-4">
                <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                  Current Reply
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--foreground)]">
                  {currentAnswer || "No live answer in progress."}
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/55 p-4">
                <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                  Recent Q&A
                </p>
                <div className="mt-3 flex max-h-72 flex-col gap-3 overflow-auto">
                  {questionAnswers.length > 0 ? (
                    questionAnswers.map((entry, index) => (
                      <article
                        className="rounded-2xl border border-[var(--line)] bg-white/75 px-4 py-3"
                        key={`${entry.question}-${index}`}
                      >
                        <p className="text-sm font-medium">
                          Q: {entry.question}
                          {formatAskedAt(entry.askedAt)}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--ink-soft)]">
                          {entry.answer}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--ink-soft)]">No questions asked yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.85fr_0.85fr_1.3fr]">
          <div className="glass-panel rounded-[2rem] p-5 md:p-6">
            <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">Live Speech</p>
            <p className="mt-3 min-h-28 whitespace-pre-wrap text-sm leading-7 text-[var(--foreground)]">
              {partialTranscript || "Waiting for live speech..."}
            </p>
          </div>

          <div className="glass-panel rounded-[2rem] p-5 md:p-6">
            <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
              Pending Transcript
            </p>
            <div className="mt-3 flex max-h-72 flex-col gap-3 overflow-auto">
              {provisionalEntries.length > 0 ? (
                provisionalEntries
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <article
                      className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3"
                      key={entry.id}
                    >
                      <p className="mono text-xs uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                        pending {entry.at}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-[var(--foreground)]">{entry.text}</p>
                    </article>
                  ))
              ) : (
                <p className="text-sm text-[var(--ink-soft)]">No pending transcript chunks right now.</p>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-[2rem] p-5 md:p-6">
            <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">Committed Transcript</p>
            <div className="mt-3 flex max-h-72 flex-col gap-3 overflow-auto">
              {transcriptEntries.length > 0 ? (
                transcriptEntries.map((entry, index) => (
                  <article
                    className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3"
                    key={`${entry.at}-${index}`}
                  >
                    <p className="mono text-xs uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                      {entry.at}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[var(--foreground)]">{entry.text}</p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-[var(--ink-soft)]">Transcript has not started yet.</p>
              )}
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] p-5 md:p-6">
          <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">Live Note</p>
          <pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-[1.5rem] border border-[var(--line)] bg-white/65 p-4 text-sm leading-7 text-[var(--foreground)]">
            {noteMarkdown || "The live note will appear here as soon as the session starts."}
          </pre>
        </section>
      </div>
    </main>
  );
}
