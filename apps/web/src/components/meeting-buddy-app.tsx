"use client";

import { useEffect, useRef, useState } from "react";

import {
  listAudioInputDevices,
  startAudioCapture,
  type AudioCaptureHandle,
  type AudioInputDevice,
} from "@/lib/audio-capture";
import { type ServerEvent } from "@/shared/protocol";

type TranscriptEntry = {
  text: string;
  committedAt: string;
};

type QuestionAnswer = {
  question: string;
  answer: string;
};

type ConnectionState = "idle" | "starting" | "live" | "stopping";

export function MeetingBuddyApp() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [includeTabAudio, setIncludeTabAudio] = useState(false);
  const [title, setTitle] = useState("Meeting Buddy");
  const [question, setQuestion] = useState("");
  const [microphones, setMicrophones] = useState<AudioInputDevice[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [noteMarkdown, setNoteMarkdown] = useState("");
  const [notePathRelative, setNotePathRelative] = useState("");
  const [logPathRelative, setLogPathRelative] = useState("");
  const [statusMessage, setStatusMessage] = useState("Ready when you are.");
  const [modelName, setModelName] = useState("");
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [questionAnswers, setQuestionAnswers] = useState<QuestionAnswer[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<AudioCaptureHandle | null>(null);
  const pendingQuestionRef = useRef("");
  const answerBufferRef = useRef("");
  const answerFlushTimerRef = useRef<number | null>(null);

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
      captureRef.current?.stop();
      socketRef.current?.close();
    };
  }, []);

  const selectedMicLabel =
    microphones.find((device) => device.deviceId === selectedMicId)?.label ||
    "Browser default microphone";

  const startSession = () => {
    setConnectionState("starting");
    setAudioLevel(0);
    setPartialTranscript("");
    setTranscriptEntries([]);
    setQuestionAnswers([]);
    setCurrentAnswer("");
    setNoteMarkdown("");
    setNotePathRelative("");
    setLogPathRelative("");
    setStatusMessage("Requesting microphone access...");
    answerBufferRef.current = "";
    if (answerFlushTimerRef.current !== null) {
      window.clearTimeout(answerFlushTimerRef.current);
      answerFlushTimerRef.current = null;
    }

    void startAudioCapture({
      includeTabAudio,
      deviceId: selectedMicId || undefined,
      onChunk: (pcmBase64, sampleRate) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(
          JSON.stringify({
            type: "audio_chunk",
            pcmBase64,
            sampleRate,
          })
        );
      },
      onSpeechPause: () => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(
          JSON.stringify({
            type: "commit_transcript",
          })
        );
      },
      onLevel: (level) => {
        setAudioLevel(level);
      },
    })
      .then((capture) => {
        captureRef.current = capture;
        void listAudioInputDevices().then((devices) => {
          setMicrophones(devices);
        });
        setStatusMessage(
          capture.tabAudioEnabled
            ? `${selectedMicLabel} is live with tab audio.`
            : `${selectedMicLabel} is live.`
        );

        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
        socketRef.current = socket;

        socket.onopen = () => {
          socket.send(
            JSON.stringify({
              type: "start_session",
              sampleRate: capture.sampleRate,
              title,
              includeTabAudio: capture.tabAudioEnabled,
            })
          );
        };

        socket.onmessage = (event) => {
          const message = JSON.parse(event.data) as ServerEvent;
          handleServerEvent(message);
        };

        socket.onclose = () => {
          setConnectionState("idle");
          setAudioLevel(0);
          setStatusMessage((current) => (current === "Session stopped." ? current : "Session closed."));
          captureRef.current?.stop();
          captureRef.current = null;
          socketRef.current = null;
        };
      })
      .catch((error: unknown) => {
        setConnectionState("idle");
        setAudioLevel(0);
        setStatusMessage(String(error));
      });
  };

  const stopSession = () => {
    socketRef.current?.send(JSON.stringify({ type: "stop_session" }));
    captureRef.current?.stop();
    captureRef.current = null;
    setAudioLevel(0);
    setConnectionState("stopping");
    setStatusMessage("Finishing the current transcript...");
  };

  const sendQuestion = () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || !socketRef.current) {
      return;
    }

    pendingQuestionRef.current = trimmedQuestion;
    setCurrentAnswer("");
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
      setConnectionState("live");
      setNotePathRelative(event.notePathRelative);
      setLogPathRelative(event.logPathRelative);
      setModelName(event.model);
      setStatusMessage(`Listening live on ${selectedMicLabel}.`);
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

    if (event.type === "transcript_committed") {
      setPartialTranscript("");
      setTranscriptEntries((current) => [
        {
          text: event.text,
          committedAt: event.committedAt,
        },
        ...current,
      ]);
      return;
    }

    if (event.type === "notes_updated") {
      setNoteMarkdown(event.markdown);
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
      setQuestionAnswers((current) => [
        {
          question: pendingQuestionRef.current,
          answer: event.text,
        },
        ...current,
      ]);
      setCurrentAnswer("");
      return;
    }

    if (event.type === "error") {
      setStatusMessage(event.message);
      return;
    }

    if (event.type === "session_stopped") {
      setConnectionState("idle");
      setStatusMessage("Session stopped.");
      socketRef.current?.close();
      socketRef.current = null;
    }
  };

  const canStart = connectionState === "idle";
  const canStop = connectionState === "live" || connectionState === "starting";
  const canAsk = connectionState === "live" && currentAnswer === "";

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
                {notePathRelative ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">{notePathRelative}</span>
                ) : null}
                {logPathRelative ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1">{logPathRelative}</span>
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

                <div className="grid gap-4 md:grid-cols-[1.2fr_auto]">
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
            <div className="mt-4 flex max-h-[32rem] flex-col gap-3 overflow-auto pr-1">
              {transcriptEntries.length > 0 ? (
                transcriptEntries.map((entry) => (
                  <div
                    className="rounded-[1.5rem] border border-[var(--line)] bg-white/70 p-4"
                    key={`${entry.committedAt}-${entry.text}`}
                  >
                    <p className="mono text-xs text-[var(--ink-soft)]">{entry.committedAt}</p>
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
