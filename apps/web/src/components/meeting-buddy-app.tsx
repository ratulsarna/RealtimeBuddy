"use client";

import { useEffect, useRef, useState } from "react";

import { ActivityRail } from "@/components/meeting-buddy/activity-rail";
import { BuddyLane } from "@/components/meeting-buddy/buddy-lane";
import { DrawerShell } from "@/components/meeting-buddy/drawer-shell";
import {
  formatConnectionStateLabel,
  getStatusTone,
} from "@/components/meeting-buddy/format";
import { MeetingBriefCard } from "@/components/meeting-buddy/meeting-brief-card";
import { SessionDrawer } from "@/components/meeting-buddy/session-drawer";
import { SessionSidebar } from "@/components/meeting-buddy/session-sidebar";
import type {
  AudioDiagnostics,
  CaptureIntent,
  CommittedTranscriptEntry,
  ConnectionState,
  PendingTranscriptEntry,
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
  type SessionLanguagePreference,
} from "@realtimebuddy/shared/language-preferences";
import { type BuddyEvent, type ServerEvent } from "@realtimebuddy/shared/protocol";

type MeetingBuddyAppProps = {
  backendBaseUrl?: string;
  initialStaticUserSeed?: string;
};

function dedupeBuddyEventsById(events: BuddyEvent[]): BuddyEvent[] {
  const seen = new Set<string>();
  const result: BuddyEvent[] = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    result.push(event);
  }
  return result;
}

export function MeetingBuddyApp({
  backendBaseUrl = "",
  initialStaticUserSeed = "",
}: MeetingBuddyAppProps) {
  const [secondaryPanelTab, setSecondaryPanelTab] = useState<"transcript" | "qa">("transcript");
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [sessionMode, setSessionMode] = useState<SessionMode>(null);
  const [sessionId, setSessionId] = useState("");
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [includeTabAudio, setIncludeTabAudio] = useState(false);
  const [languagePreference, setLanguagePreference] = useState<SessionLanguagePreference>("auto");
  const [title, setTitle] = useState("Session");
  const [staticUserSeed, setStaticUserSeed] = useState(initialStaticUserSeed);
  const [meetingSeed, setMeetingSeed] = useState("");
  const [question, setQuestion] = useState("");
  const [microphones, setMicrophones] = useState<AudioInputDevice[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const [, setAudioLevel] = useState(0);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [provisionalEntries, setProvisionalEntries] = useState<PendingTranscriptEntry[]>([]);
  const [transcriptEntries, setTranscriptEntries] = useState<CommittedTranscriptEntry[]>([]);
  const [noteMarkdown, setNoteMarkdown] = useState("");
  const [notePathRelative, setNotePathRelative] = useState("");
  const [logPathRelative, setLogPathRelative] = useState("");
  const [statusMessage, setStatusMessage] = useState("Ready when you are.");
  const [, setModelName] = useState("");
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [buddyEvents, setBuddyEvents] = useState<BuddyEvent[]>([]);
  const [, setAudioDiagnostics] = useState<AudioDiagnostics | null>(null);
  const [, setCaptureClientCount] = useState(0);
  const [, setCompanionClientCount] = useState(0);
  const [isAsking, setIsAsking] = useState(false);
  const [isSavingStandingContext, setIsSavingStandingContext] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<"settings" | "session" | null>(null);

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
  const initialAutoJoinSessionIdRef = useRef("");
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
    setStaticUserSeed(initialStaticUserSeed);
  }, [initialStaticUserSeed]);

  useEffect(() => {
    if (!activeDrawer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveDrawer(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeDrawer]);

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
      initialAutoJoinSessionIdRef.current = querySessionId;
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
  const connectionStateLabel = formatConnectionStateLabel(connectionState);
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
    setCurrentAnswer("");
    setIsAsking(false);
    setAudioDiagnostics(null);
    captureDisconnectedRef.current = false;
    answerBufferRef.current = "";
    pendingQuestionRef.current = "";
    if (answerFlushTimerRef.current !== null) {
      window.clearTimeout(answerFlushTimerRef.current);
      answerFlushTimerRef.current = null;
    }
  };

  const resetMeetingState = () => {
    resetLiveState();
    setTranscriptEntries([]);
    setBuddyEvents([]);
    setQuestion("");
    setMeetingSeed("");
    setNoteMarkdown("");
    setNotePathRelative("");
    setLogPathRelative("");
    setModelName("");
    setCaptureClientCount(0);
    setCompanionClientCount(0);
    setSessionId("");
    setSessionIdInput("");
    setSessionMode(null);
    setConnectionState("idle");
    setStatusMessage("Ready when you are.");
    setTitle("Session");
    captureIntentRef.current = "idle";
    captureForwardingEnabledRef.current = true;
    pendingSocketMessagesRef.current = [];
    closeMessageRef.current = null;
    syncSessionQuery("");
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
    resetMeetingState();
    setConnectionState("starting");
    setSessionMode("local_capture");
    setSessionId("");
    setStatusMessage("Requesting microphone access...");
    pendingSocketMessagesRef.current = [];
    captureForwardingEnabledRef.current = true;
    captureIntentRef.current = "starting";
    const requestId = captureRequestIdRef.current + 1;
    captureRequestIdRef.current = requestId;

    const trimmedStaticUserSeed = staticUserSeed.trim();
    const trimmedMeetingSeed = meetingSeed.trim();

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
            ...(trimmedStaticUserSeed ? { staticUserSeed: trimmedStaticUserSeed } : {}),
            ...(trimmedMeetingSeed ? { meetingSeed: trimmedMeetingSeed } : {}),
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

    resetMeetingState();
    setConnectionState("connecting");
    setSessionMode("companion");
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

    const initialAutoJoinSessionId = initialAutoJoinSessionIdRef.current.trim();
    if (connectionState !== "idle" || !initialAutoJoinSessionId) {
      return;
    }

    autoJoinAttemptedRef.current = true;
    initialAutoJoinSessionIdRef.current = "";
    void joinSessionRef.current(initialAutoJoinSessionId);
  }, [connectionState]);

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
      setCaptureClientCount(0);
      setCompanionClientCount(0);
      setStatusMessage("Session stopped.");
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

  const saveStandingContext = async () => {
    setIsSavingStandingContext(true);

    try {
      const response = await fetch("/api/buddy-config", {
        body: JSON.stringify({
          staticUserSeed,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "PUT",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message ?? "Could not save standing context.");
      }

      const savedConfig = (await response.json()) as {
        staticUserSeed?: string;
      };
      setStaticUserSeed(savedConfig.staticUserSeed ?? "");

      setStatusMessage(
        (savedConfig.staticUserSeed ?? "").trim()
          ? "Standing context saved."
          : "Standing context cleared."
      );
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setIsSavingStandingContext(false);
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
      setBuddyEvents(dedupeBuddyEventsById(event.buddyEvents));
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

    if (event.type === "buddy_event") {
      setBuddyEvents((current) =>
        current.some((entry) => entry.id === event.event.id)
          ? current
          : [event.event, ...current]
      );
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

  const sendQuestion = (explicitText?: string) => {
    const source = explicitText !== undefined ? explicitText : question;
    const trimmedQuestion = source.trim();
    if (!trimmedQuestion || !socketRef.current || isAsking) {
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
    if (explicitText === undefined) {
      setQuestion("");
    }
  };

  const hasPreservedMeetingState = Boolean(
    sessionId ||
      notePathRelative ||
      logPathRelative ||
      noteMarkdown.trim() ||
      partialTranscript.trim() ||
      provisionalEntries.length > 0 ||
      transcriptEntries.length > 0 ||
      buddyEvents.length > 0
  );
  const canStart = connectionState === "idle" && !hasPreservedMeetingState;
  const canJoin =
    connectionState === "idle" &&
    !hasPreservedMeetingState &&
    Boolean(sessionIdInput.trim());
  const canPause = sessionMode === "local_capture" && connectionState === "live";
  const canResume = sessionMode === "local_capture" && connectionState === "paused";
  const canSaveStandingContext = canStart && !isSavingStandingContext;
  const canStop = connectionState !== "idle";
  const canReset = connectionState === "idle" && hasPreservedMeetingState;
  const canAsk =
    Boolean(socketRef.current) &&
    !isAsking &&
    (connectionState === "live" || connectionState === "paused");

  const askHint = canAsk
    ? "Ask about decisions, loose ends, next steps, or what just changed."
    : canReset
      ? "Session ended. Reset when you want to start a fresh meeting."
      : "Start a session first, then ask questions here.";

  const showBrief = connectionState === "idle" && !hasPreservedMeetingState;

  const sidebarProps = {
    canJoin,
    canSaveStandingContext,
    canStart,
    isSavingStandingContext,
    languagePreference,
    microphones,
    onCopySessionId: () => { void copySessionId(); },
    onJoinSession: () => { void joinSession(); },
    onLanguageChange: setLanguagePreference,
    onSaveStandingContext: () => { void saveStandingContext(); },
    onSelectedMicChange: setSelectedMicId,
    onSessionIdInputChange: setSessionIdInput,
    onStaticUserSeedChange: setStaticUserSeed,
    onTitleChange: setTitle,
    selectedMicId,
    sessionId,
    sessionIdInput,
    staticUserSeed,
    title,
  } as const;

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <WorkspaceHeader
        canPause={canPause}
        canResume={canResume}
        canReset={canReset}
        canStart={canStart}
        canStop={canStop}
        connectionStateLabel={connectionStateLabel}
        onPauseSession={pauseSession}
        onResumeSession={resumeSession}
        onResetSession={resetMeetingState}
        onStartSession={startSession}
        onStopSession={stopSession}
        onToggleActivity={() =>
          setActiveDrawer((prev) => (prev === "session" ? null : "session"))
        }
        onToggleSettings={() =>
          setActiveDrawer((prev) => (prev === "settings" ? null : "settings"))
        }
        sessionMode={sessionMode}
        showActivityAction={!showBrief}
        showStartAction={!showBrief}
        showSessionTitle={!showBrief}
        statusTone={statusTone}
        title={title}
      />

      <div className="flex-1 overflow-hidden">
        {showBrief ? (
          <div className="h-full overflow-y-auto">
            <MeetingBriefCard
              canStart={canStart}
              includeTabAudio={includeTabAudio}
              meetingSeed={meetingSeed}
              onIncludeTabAudioChange={setIncludeTabAudio}
              onMeetingSeedChange={setMeetingSeed}
              onStartSession={startSession}
            />
          </div>
        ) : (
          <div className="mx-auto flex h-full w-full max-w-[1480px] min-w-0 flex-col gap-4 overflow-hidden px-4 pb-4 pt-6 sm:px-6 lg:flex-row lg:gap-6 lg:px-8 lg:pb-6">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <BuddyLane
                connectionState={connectionState}
                events={buddyEvents}
                hasPreservedMeetingState={hasPreservedMeetingState}
                meetingSeed={meetingSeed}
                staticUserSeed={staticUserSeed}
              />
            </div>

            <ActivityRail
              askHint={askHint}
              canAsk={canAsk}
              className="hidden h-full flex-shrink-0 lg:flex lg:w-[22rem] xl:w-[24rem]"
              currentAnswer={currentAnswer}
              isAsking={isAsking}
              onQuestionChange={setQuestion}
              onSendQuestion={sendQuestion}
              onTabChange={setSecondaryPanelTab}
              partialTranscript={partialTranscript}
              provisionalEntries={provisionalEntries}
              qaMarkdown={noteMarkdown}
              question={question}
              tab={secondaryPanelTab}
              transcriptEntries={transcriptEntries}
            />
          </div>
        )}
      </div>

      {activeDrawer === "session" ? (
        <SessionDrawer
          askHint={askHint}
          canAsk={canAsk}
          currentAnswer={currentAnswer}
          isAsking={isAsking}
          onClose={() => setActiveDrawer(null)}
          onQuestionChange={setQuestion}
          onSendQuestion={sendQuestion}
          onTabChange={setSecondaryPanelTab}
          partialTranscript={partialTranscript}
          provisionalEntries={provisionalEntries}
          qaMarkdown={noteMarkdown}
          question={question}
          tab={secondaryPanelTab}
          transcriptEntries={transcriptEntries}
        />
      ) : null}

      {activeDrawer === "settings" ? (
        <DrawerShell onClose={() => setActiveDrawer(null)} title="Settings">
          <SessionSidebar {...sidebarProps} />
        </DrawerShell>
      ) : null}
    </main>
  );
}
