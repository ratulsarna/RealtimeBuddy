"use client";

import { useEffect, useRef, useState } from "react";

import {
  formatConnectionStateLabel,
  formatSessionModeLabel,
  getSessionHeadline,
  getStatusTone,
} from "@/components/meeting-buddy/format";
import { LiveQaPanel } from "@/components/meeting-buddy/live-qa-panel";
import { NotePanel } from "@/components/meeting-buddy/note-panel";
import { SessionSidebar } from "@/components/meeting-buddy/session-sidebar";
import { TranscriptPanel } from "@/components/meeting-buddy/transcript-panel";
import type {
  AudioDiagnostics,
  CaptureIntent,
  CommittedTranscriptEntry,
  ConnectionState,
  PendingTranscriptEntry,
  QuestionAnswer,
  SessionDetail,
  SessionMetric,
  SessionMode,
} from "@/components/meeting-buddy/types";
import { WorkspaceHeader } from "@/components/meeting-buddy/workspace-header";
import {
  listAudioInputDevices,
  startAudioCapture,
  type AudioCaptureHandle,
  type AudioInputDevice,
} from "@/lib/audio-capture";
import { resolveBrowserBackendConfig } from "@/lib/backend-config";
import {
  getSessionLanguageLabel,
  type SessionLanguagePreference,
} from "@realtimebuddy/shared/language-preferences";
import { type ServerEvent } from "@realtimebuddy/shared/protocol";

type MeetingBuddyAppProps = {
  backendBaseUrl?: string;
};

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
  const languageLabel = getSessionLanguageLabel(languagePreference);
  const connectionStateLabel = formatConnectionStateLabel(connectionState);
  const sessionModeLabel = formatSessionModeLabel(sessionMode);
  const sessionHeadline = getSessionHeadline(connectionState, sessionMode);
  const statusTone = getStatusTone(connectionState);

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

  const askHint = canAsk
    ? "This workspace stays useful during the meeting: ask for decisions, loose ends, next steps, or what just changed."
    : "Start a local capture or join a live session first, then ask here without leaving the conversation.";

  const sessionMetrics: SessionMetric[] = [
    { label: "State", value: connectionStateLabel },
    { label: "Mode", value: sessionModeLabel },
    { label: "Language", value: languageLabel },
    {
      label: "Clients",
      value: `${captureClientCount} capture / ${companionClientCount} companion`,
    },
  ];

  const sessionDetails: SessionDetail[] = [
    sessionId
      ? {
          label: "Session ID",
          value: sessionId,
          mono: true,
        }
      : null,
    modelName
      ? {
          label: "Answer Model",
          value: modelName,
        }
      : null,
    {
      label: "Backend",
      value: backendTargetLabel,
      mono: true,
    },
    {
      label: "Capture Mix",
      value: includeTabAudio ? "Microphone + tab audio" : "Microphone only",
    },
    notePathRelative
      ? {
          label: "Note Path",
          value: notePathRelative,
          mono: true,
        }
      : null,
    logPathRelative
      ? {
          label: "Log Path",
          value: logPathRelative,
          mono: true,
        }
      : null,
  ].filter((detail): detail is SessionDetail => Boolean(detail));

  return (
    <main className="grain relative min-h-screen overflow-hidden px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 md:gap-6">
        <WorkspaceHeader
          captureClientCount={captureClientCount}
          companionClientCount={companionClientCount}
          connectionStateLabel={connectionStateLabel}
          languageLabel={languageLabel}
          selectedMicLabel={selectedMicLabel}
          sessionHeadline={sessionHeadline}
          sessionId={sessionId}
          sessionModeLabel={sessionModeLabel}
          statusMessage={statusMessage}
          statusTone={statusTone}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.9fr)] md:gap-6">
          <div className="min-w-0">
            <LiveQaPanel
              askHint={askHint}
              canAsk={canAsk}
              currentAnswer={currentAnswer}
              isAsking={isAsking}
              onQuestionChange={setQuestion}
              onSendQuestion={sendQuestion}
              question={question}
              questionAnswers={questionAnswers}
            />
          </div>

          <div className="min-w-0">
            <SessionSidebar
              audioDiagnostics={audioDiagnostics}
              audioLevel={audioLevel}
              canJoin={canJoin}
              canPause={canPause}
              canResume={canResume}
              canStart={canStart}
              canStop={canStop}
              includeTabAudio={includeTabAudio}
              languagePreference={languagePreference}
              microphones={microphones}
              onCopySessionId={() => {
                void copySessionId();
              }}
              onIncludeTabAudioChange={setIncludeTabAudio}
              onJoinSession={() => {
                void joinSession();
              }}
              onLanguageChange={setLanguagePreference}
              onPauseSession={pauseSession}
              onResumeSession={resumeSession}
              onSelectedMicChange={setSelectedMicId}
              onSessionIdInputChange={setSessionIdInput}
              onStartSession={startSession}
              onStopSession={stopSession}
              onTitleChange={setTitle}
              selectedMicId={selectedMicId}
              selectedMicLabel={selectedMicLabel}
              sessionDetails={sessionDetails}
              sessionHeadline={sessionHeadline}
              sessionId={sessionId}
              sessionIdInput={sessionIdInput}
              sessionMetrics={sessionMetrics}
              sessionMode={sessionMode}
              statusMessage={statusMessage}
              statusTone={statusTone}
              title={title}
            />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(20rem,0.82fr)] md:gap-6">
          <div className="min-w-0">
            <NotePanel noteMarkdown={noteMarkdown} notePathRelative={notePathRelative} />
          </div>
          <div className="min-w-0">
            <TranscriptPanel
              partialTranscript={partialTranscript}
              provisionalEntries={provisionalEntries}
              transcriptEntries={transcriptEntries}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
