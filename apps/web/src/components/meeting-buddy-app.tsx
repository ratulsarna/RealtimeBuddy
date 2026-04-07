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
type ConnectionState = "idle" | "starting" | "live" | "pausing" | "paused" | "resuming" | "stopping";

type MeetingBuddyAppProps = {
  backendBaseUrl?: string;
};

export function MeetingBuddyApp({
  backendBaseUrl = "",
}: MeetingBuddyAppProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
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

  const startSession = () => {
    setConnectionState("starting");
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
    setStatusMessage("Requesting microphone access...");
    answerBufferRef.current = "";
    pendingQuestionRef.current = "";
    if (answerFlushTimerRef.current !== null) {
      window.clearTimeout(answerFlushTimerRef.current);
      answerFlushTimerRef.current = null;
    }
    if (pauseFlushTimerRef.current !== null) {
      window.clearTimeout(pauseFlushTimerRef.current);
      pauseFlushTimerRef.current = null;
    }
    pendingSocketMessagesRef.current = [];
    captureForwardingEnabledRef.current = true;
    captureIntentRef.current = "starting";
    const requestId = captureRequestIdRef.current + 1;
    captureRequestIdRef.current = requestId;

    startCapture(async (capture) => {
      try {
        const backendAccessToken = await requestBackendAccessToken();
        const { webSocketUrl } = resolveBrowserBackendConfig({
          backendAccessToken,
          backendBaseUrl,
          pageUrl: window.location.href,
        });
        const socket = new WebSocket(webSocketUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          socket.send(
            JSON.stringify({
              type: "start_session",
              sampleRate: capture.sampleRate,
              title,
              includeTabAudio: capture.tabAudioEnabled,
              languagePreference,
            })
          );
          flushPendingSocketMessages();
        };

        socket.onmessage = (event) => {
          const message = JSON.parse(event.data) as ServerEvent;
          handleServerEvent(message);
        };

        socket.onclose = () => {
          setConnectionState("idle");
          setAudioLevel(0);
          setIsAsking(false);
          setStatusMessage((current) => (current === "Session stopped." ? current : "Session closed."));
          captureIntentRef.current = "idle";
          captureForwardingEnabledRef.current = true;
          captureRequestIdRef.current += 1;
          captureRef.current?.stop();
          captureRef.current = null;
          socketRef.current = null;
          pendingSocketMessagesRef.current = [];
        };
      } catch (error) {
        capture.stop();
        captureRef.current = null;
        captureIntentRef.current = "idle";
        captureForwardingEnabledRef.current = true;
        captureRequestIdRef.current += 1;
        setConnectionState("idle");
        setAudioLevel(0);
        setStatusMessage(String(error));
      }
    }, "idle", (capture) =>
      capture.tabAudioEnabled
        ? `${selectedMicLabel} is live with tab audio.`
        : `${selectedMicLabel} is live.`
    , requestId, "starting");
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

  const pauseSession = () => {
    if (!socketRef.current || !captureRef.current) {
      return;
    }

    setConnectionState("pausing");
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
    if (!socketRef.current) {
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
    startCapture(() => {
      queueOrSendSocketMessage(JSON.stringify({ type: "resume_session" }));
    }, "paused", (capture) =>
      capture.tabAudioEnabled
        ? `${selectedMicLabel} is ready with tab audio. Reconnecting transcription...`
        : `${selectedMicLabel} is ready. Reconnecting transcription...`
    , requestId, "resuming");
  };

  const stopSession = () => {
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
      setStatusMessage("Ready when you are.");
      return;
    }

    captureForwardingEnabledRef.current = true;
    flushPendingSocketMessages();
    socket.send(JSON.stringify({ type: "stop_session" }));
    setConnectionState("stopping");
    setStatusMessage("Finishing the current transcript...");
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

  const handleServerEvent = (event: ServerEvent) => {
    if (event.type === "session_ready") {
      captureIntentRef.current = "idle";
      captureForwardingEnabledRef.current = true;
      setConnectionState("live");
      setNotePathRelative(event.notePathRelative);
      setLogPathRelative(event.logPathRelative);
      setModelName(event.model);
      setStatusMessage(`Listening live on ${selectedMicLabel}.`);
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

    if (event.type === "transcript_partial") {
      setPartialTranscript(event.text);
      return;
    }

    if (event.type === "transcript_provisional") {
      setPartialTranscript("");
      setProvisionalEntries((current) => [
        ...current,
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
      setStatusMessage("Capture paused. Resume when you are ready.");
      return;
    }

    if (event.type === "session_resumed") {
      captureIntentRef.current = "idle";
      captureForwardingEnabledRef.current = true;
      flushPendingSocketMessages();
      setConnectionState("live");
      setStatusMessage(`Listening live on ${selectedMicLabel}.`);
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
      setStatusMessage(event.message);
      return;
    }

    if (event.type === "session_stopped") {
      setConnectionState("idle");
      setIsAsking(false);
      setStatusMessage("Session stopped.");
      socketRef.current?.close();
      socketRef.current = null;
    }
  };

  const canStart = connectionState === "idle";
  const canPause = connectionState === "live";
  const canResume = connectionState === "paused";
  const canStop =
    connectionState === "live" ||
    connectionState === "starting" ||
    connectionState === "pausing" ||
    connectionState === "paused" ||
    connectionState === "resuming";
  const canAsk = connectionState === "live" && !isAsking;

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
                Press once. Listen live. Ask while the meeting is still moving.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ink-soft)] md:text-lg">
                RealtimeBuddy streams your meeting audio into live notes in Obsidian and keeps a fast
                Codex thread warm for near realtime questions.
              </p>
            </div>
            <div className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel-strong)] px-5 py-4 shadow-[0_12px_30px_rgba(69,47,28,0.06)]">
              <p className="mono text-xs uppercase tracking-[0.28em] text-[var(--ink-soft)]">
                Status
              </p>
              <p className="mt-2 text-lg font-medium">{statusMessage}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-[var(--ink-soft)]">
                <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1">
                  {connectionState}
                </span>
                {modelName ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">{modelName}</span>
                ) : null}
                {backendTargetLabel ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">
                    backend {backendTargetLabel}
                  </span>
                ) : null}
                {notePathRelative ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">{notePathRelative}</span>
                ) : null}
                {logPathRelative ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">{logPathRelative}</span>
                ) : null}
                <span className="rounded-full border border-[var(--line)] px-3 py-1">
                  {getSessionLanguageLabel(languagePreference)}
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

              <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-full bg-[var(--accent)] px-5 py-3 font-medium text-white shadow-[0_12px_24px_var(--glow)] transition hover:translate-y-[-1px] disabled:opacity-50"
                    disabled={!canStart}
                    onClick={startSession}
                    type="button"
                  >
                    Start listening
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
                    Stop
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
            <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
              Ask the buddy
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <textarea
                className="min-h-28 rounded-[1.5rem] border border-[var(--line)] bg-white/70 px-4 py-3 outline-none transition focus:border-[var(--accent)]"
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What did we decide about deadlines?"
                value={question}
              />
              <button
                className="rounded-full bg-[var(--foreground)] px-5 py-3 font-medium text-white transition hover:translate-y-[-1px] disabled:opacity-50"
                disabled={!canAsk || !question.trim()}
                onClick={sendQuestion}
                type="button"
              >
                Ask now
              </button>
            </div>
            {currentAnswer ? (
              <div className="mt-5 rounded-[1.5rem] border border-[var(--line)] bg-white/75 p-4">
                <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                  Streaming answer
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{currentAnswer}</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr_0.95fr]">
          <article className="glass-panel rounded-[2rem] p-5 md:p-6">
            <div className="flex items-center justify-between">
              <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                Live transcript
              </p>
              <span className="mono text-xs text-[var(--ink-soft)]">{transcriptEntries.length} commits</span>
            </div>
            {partialTranscript ? (
              <div className="mt-4 rounded-[1.5rem] border border-dashed border-[var(--accent)] bg-white/70 p-4">
                <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--accent)]">
                  In progress
                </p>
                <p className="mt-2 text-sm leading-7">{partialTranscript}</p>
              </div>
            ) : null}
            {provisionalEntries.length > 0 ? (
              <div className="mt-4 flex flex-col gap-3">
                {provisionalEntries.map((entry) => (
                  <div
                    className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-white/70 p-4"
                    key={`pending-${entry.at}-${entry.text}`}
                  >
                    <p className="mono text-xs uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                      Pending commit {entry.at}
                    </p>
                    <p className="mt-2 text-sm leading-7">{entry.text}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-4 flex max-h-[32rem] flex-col gap-3 overflow-auto pr-1">
              {transcriptEntries.length > 0 ? (
                transcriptEntries.map((entry) => (
                  <div
                    className="rounded-[1.5rem] border border-[var(--line)] bg-white/70 p-4"
                    key={`${entry.at}-${entry.text}`}
                  >
                    <p className="mono text-xs text-[var(--ink-soft)]">{entry.at}</p>
                    <p className="mt-2 text-sm leading-7">{entry.text}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/60 p-4 text-sm text-[var(--ink-soft)]">
                  Committed transcript chunks will start appearing here.
                </div>
              )}
            </div>
          </article>

          <article className="glass-panel rounded-[2rem] p-5 md:p-6">
            <div className="flex items-center justify-between">
              <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                Obsidian note preview
              </p>
              {notePathRelative ? (
                <span className="mono text-xs text-[var(--ink-soft)]">{notePathRelative}</span>
              ) : null}
            </div>
            <div className="mt-4 max-h-[32rem] overflow-auto rounded-[1.5rem] border border-[var(--line)] bg-[#fffaf4] p-4">
              <pre className="whitespace-pre-wrap text-sm leading-7 text-[var(--foreground)]">
                {noteMarkdown || "Your live note will appear here as transcript chunks land."}
              </pre>
            </div>
          </article>

          <article className="glass-panel rounded-[2rem] p-5 md:p-6">
            <div className="flex items-center justify-between">
              <p className="mono text-xs uppercase tracking-[0.24em] text-[var(--ink-soft)]">
                Recent Q&A
              </p>
              <span className="mono text-xs text-[var(--ink-soft)]">{questionAnswers.length} answers</span>
            </div>
            <div className="mt-4 flex max-h-[32rem] flex-col gap-3 overflow-auto pr-1">
              {questionAnswers.length > 0 ? (
                questionAnswers.map((entry) => (
                  <div
                    className="rounded-[1.5rem] border border-[var(--line)] bg-white/70 p-4"
                    key={`${entry.question}-${entry.answer}`}
                  >
                    <p className="mono text-xs uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                      Question
                    </p>
                    <p className="mt-2 text-sm leading-7">{entry.question}</p>
                    <p className="mono mt-4 text-xs uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                      Answer
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{entry.answer}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/60 p-4 text-sm text-[var(--ink-soft)]">
                  Ask about a decision, a name, or what changed in the conversation and the buddy will answer here.
                </div>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
