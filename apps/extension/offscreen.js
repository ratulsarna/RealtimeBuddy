let active = null;
let reconnectTimer = null;

let tabStream = null;
let micStream = null;
let audioContext = null;
let mixer = null;
let processor = null;
let tabSourceNode = null;
let micSourceNode = null;
let micHighPass = null;
let micLowPass = null;
let micCompressor = null;
let micGainNode = null;
let tabAnalyser = null;
let micAnalyser = null;
let tabMonitorGainNode = null;
let meterTimer = null;

function clampBaseUrl(baseUrl, pageUrl) {
  if (baseUrl) {
    return new URL(baseUrl);
  }

  const url = new URL(pageUrl);
  url.port = "3001";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function resolveBackendWebSocketUrl({ backendBaseUrl, appUrl, authToken }) {
  const url = clampBaseUrl(backendBaseUrl, appUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  if (authToken) {
    url.searchParams.set("token", authToken);
  }
  return url.toString();
}

async function sendStatePatch(patch) {
  await chrome.runtime
    .sendMessage({
      type: "OFFSCREEN_STATE",
      patch,
    })
    .catch(() => {});
}

async function requestBackendAccessToken(appUrl) {
  const response = await fetch(new URL("/api/backend-auth", appUrl), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not fetch a backend auth token from the companion app.");
  }

  const payload = await response.json();
  if (!payload?.token) {
    throw new Error("The companion app returned no backend auth token.");
  }

  return payload.token;
}

function trackCount(stream) {
  try {
    return stream ? stream.getAudioTracks().length : 0;
  } catch {
    return 0;
  }
}

function int16ToBase64Pcm16(samples) {
  const bytes = new Uint8Array(samples.buffer.slice(0));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function ensureAudioContext() {
  if (audioContext) {
    return audioContext;
  }

  audioContext = new AudioContext({
    sampleRate: 48000,
  });
  await audioContext.audioWorklet.addModule(chrome.runtime.getURL("audio-gate-processor.js"));
  await audioContext.resume();
  return audioContext;
}

async function ensureMicStream(deviceId) {
  if (micStream) {
    return micStream;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
      video: false,
    });
  } catch {
    micStream = null;
  }

  return micStream;
}

function computeRmsDb(analyser) {
  if (!analyser) {
    return null;
  }

  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    sum += buffer[index] * buffer[index];
  }

  const rms = Math.sqrt(sum / buffer.length);
  if (!Number.isFinite(rms) || rms <= 0) {
    return -120;
  }

  return Math.max(-120, Math.min(0, 20 * Math.log10(rms)));
}

function startMeters() {
  if (meterTimer) {
    return;
  }

  meterTimer = setInterval(() => {
    void sendStatePatch({
      tabLevelDb: computeRmsDb(tabAnalyser),
      micLevelDb: computeRmsDb(micAnalyser),
      audioContextState: audioContext ? audioContext.state : null,
      tabTrackCount: trackCount(tabStream),
      micTrackCount: trackCount(micStream),
    });
  }, 500);
}

function stopMeters() {
  if (!meterTimer) {
    return;
  }

  clearInterval(meterTimer);
  meterTimer = null;
}

async function cleanupStreams() {
  stopMeters();

  try {
    processor?.disconnect();
    mixer?.disconnect();
    tabMonitorGainNode?.disconnect();
    micGainNode?.disconnect();
    micCompressor?.disconnect();
    micLowPass?.disconnect();
    micHighPass?.disconnect();
    tabSourceNode?.disconnect();
    micSourceNode?.disconnect();
  } catch {}

  try {
    tabStream?.getTracks().forEach((track) => track.stop());
  } catch {}

  try {
    micStream?.getTracks().forEach((track) => track.stop());
  } catch {}

  try {
    await audioContext?.close();
  } catch {}

  tabStream = null;
  micStream = null;
  audioContext = null;
  mixer = null;
  processor = null;
  tabSourceNode = null;
  micSourceNode = null;
  micHighPass = null;
  micLowPass = null;
  micCompressor = null;
  micGainNode = null;
  tabAnalyser = null;
  micAnalyser = null;
  tabMonitorGainNode = null;
}

function clearReconnectTimer() {
  if (!reconnectTimer) {
    return;
  }

  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function currentAudioMode() {
  if (trackCount(tabStream) > 0 && trackCount(micStream) > 0) {
    return "mixed";
  }

  if (trackCount(tabStream) > 0) {
    return "tab_only";
  }

  if (trackCount(micStream) > 0) {
    return "mic_only";
  }

  return "none";
}

async function ensureStreams(tabStreamId, micDeviceId) {
  await cleanupStreams();

  tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: tabStreamId,
      },
    },
    video: false,
  });

  const context = await ensureAudioContext();
  mixer = context.createGain();
  processor = new AudioWorkletNode(context, "audio-gate-processor", {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  processor.port.onmessage = (event) => {
    const message = event.data;

    if (message.type === "level") {
      return;
    }

    if (message.type === "debug") {
      if (active?.socket?.readyState === WebSocket.OPEN) {
        active.socket.send(
          JSON.stringify({
            type: "audio_debug",
            rms: message.rms,
            peak: message.peak,
            gateOpen: message.gateOpen,
            openThreshold: message.openThreshold,
            closeThreshold: message.closeThreshold,
            candidateChunks: message.candidateChunks,
            sentChunks: message.sentChunks,
            droppedChunks: message.droppedChunks,
          })
        );
      }
      return;
    }

    if (message.type === "chunk") {
      if (active?.socket?.readyState !== WebSocket.OPEN) {
        return;
      }

      const pcm = new Int16Array(message.pcmBuffer);
      active.socket.send(
        JSON.stringify({
          type: "audio_chunk",
          pcmBase64: int16ToBase64Pcm16(pcm),
          sampleRate: message.sampleRate,
        })
      );
      return;
    }

    if (message.type === "speech_pause" && active?.socket?.readyState === WebSocket.OPEN) {
      active.socket.send(JSON.stringify({ type: "commit_transcript" }));
    }
  };

  mixer.connect(processor);

  tabSourceNode = context.createMediaStreamSource(tabStream);
  tabAnalyser = context.createAnalyser();
  tabAnalyser.fftSize = 2048;
  tabSourceNode.connect(tabAnalyser);
  tabAnalyser.connect(mixer);

  tabMonitorGainNode = context.createGain();
  tabMonitorGainNode.gain.value = 1.0;
  tabAnalyser.connect(tabMonitorGainNode).connect(context.destination);

  await ensureMicStream(micDeviceId);
  if (micStream) {
    micSourceNode = context.createMediaStreamSource(micStream);
    micHighPass = context.createBiquadFilter();
    micLowPass = context.createBiquadFilter();
    micCompressor = context.createDynamicsCompressor();
    micGainNode = context.createGain();
    micAnalyser = context.createAnalyser();

    micHighPass.type = "highpass";
    micHighPass.frequency.value = 140;
    micHighPass.Q.value = 0.7;

    micLowPass.type = "lowpass";
    micLowPass.frequency.value = 4200;
    micLowPass.Q.value = 0.7;

    micCompressor.threshold.value = -24;
    micCompressor.knee.value = 20;
    micCompressor.ratio.value = 3;
    micCompressor.attack.value = 0.003;
    micCompressor.release.value = 0.2;
    micGainNode.gain.value = 1.8;
    micAnalyser.fftSize = 2048;

    micSourceNode.connect(micHighPass);
    micHighPass.connect(micLowPass);
    micLowPass.connect(micCompressor);
    micCompressor.connect(micGainNode);
    micGainNode.connect(micAnalyser);
    micAnalyser.connect(mixer);
  }

  const tabTrack = tabStream.getAudioTracks()[0];
  if (tabTrack) {
    tabTrack.onended = () => {
      void stopAll("The captured tab stopped sharing audio.");
    };
  }

  startMeters();
  await sendStatePatch({
    micEnabled: Boolean(micStream && trackCount(micStream) > 0),
    audioMode: currentAudioMode(),
    audioContextState: audioContext ? audioContext.state : null,
    tabTrackCount: trackCount(tabStream),
    micTrackCount: trackCount(micStream),
    warning:
      micStream || trackCount(tabStream) === 0
        ? null
        : "Microphone access is unavailable. Tab audio will still stream if present.",
  });
}

function handleBackendEvent(event) {
  if (!active) {
    return;
  }

  if (event.type === "session_ready") {
    active.sessionId = event.sessionId;
    void sendStatePatch({
      isRecording: true,
      status: "Recording live",
      sessionId: event.sessionId,
      warning: null,
    });
    return;
  }

  if (event.type === "session_stopped") {
    void stopAll("Session stopped.");
    return;
  }

  if (event.type === "status") {
    void sendStatePatch({
      status: event.message,
    });
    return;
  }

  if (event.type === "error") {
    void sendStatePatch({
      warning: event.message,
      status: "Backend error",
    });
  }
}

async function connectSocket({ reuseSessionId }) {
  if (!active) {
    return;
  }

  const token = await requestBackendAccessToken(active.appUrl);
  const socketUrl = resolveBackendWebSocketUrl({
    backendBaseUrl: active.backendBaseUrl,
    appUrl: active.appUrl,
    authToken: token,
  });

  const socket = new WebSocket(socketUrl);
  active.socket = socket;

  await new Promise((resolve, reject) => {
    let settled = false;

    socket.onopen = () => {
      settled = true;
      socket.send(
        JSON.stringify({
          type: "start_session",
          role: "capture",
          ...(reuseSessionId && active.sessionId ? { sessionId: active.sessionId } : {}),
          sampleRate: audioContext ? audioContext.sampleRate : 48000,
          title: active.title,
          includeTabAudio: trackCount(tabStream) > 0,
          languagePreference: active.languagePreference,
        })
      );
      resolve();
    };

    socket.onerror = () => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new Error("Could not open the backend websocket."));
    };
  });

  socket.onmessage = (event) => {
    handleBackendEvent(JSON.parse(event.data));
  };

  socket.onclose = () => {
    if (!active || active.socket !== socket) {
      return;
    }

    active.socket = null;
    if (active.intentionalStop) {
      return;
    }

    void sendStatePatch({
      status: "Capture disconnected. Reconnecting…",
      warning: "The extension is reconnecting to the backend.",
    });

    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      void reconnectActiveSession();
    }, 2000);
  };
}

async function reconnectActiveSession() {
  if (!active) {
    return;
  }

  clearReconnectTimer();

  try {
    await connectSocket({ reuseSessionId: true });
    await sendStatePatch({
      status: "Recording live",
      warning: null,
    });
  } catch (error) {
    await sendStatePatch({
      status: "Reconnect failed. Retrying…",
      warning: String(error),
    });
    reconnectTimer = setTimeout(() => {
      void reconnectActiveSession();
    }, 3000);
  }
}

async function startAll(message) {
  if (active) {
    throw new Error("The recorder is already active.");
  }

  active = {
    appUrl: message.appUrl,
    backendBaseUrl: message.backendBaseUrl,
    title: message.title || "Meeting Buddy",
    tabUrl: message.tabUrl,
    tabId: message.tabId,
    tabStreamId: message.tabStreamId,
    micDeviceId: message.micDeviceId || "",
    languagePreference: message.languagePreference || "auto",
    sessionId: "",
    socket: null,
    intentionalStop: false,
  };

  await ensureStreams(active.tabStreamId, active.micDeviceId);
  await connectSocket({ reuseSessionId: false });
}

async function stopAll(finalStatus = "Stopped.") {
  clearReconnectTimer();

  if (!active) {
    await cleanupStreams();
    await sendStatePatch({
      isRecording: false,
      status: finalStatus,
      sessionId: "",
      warning: null,
      micEnabled: null,
      audioMode: null,
      audioContextState: null,
      tabTrackCount: null,
      micTrackCount: null,
      tabLevelDb: null,
      micLevelDb: null,
    });
    return;
  }

  const current = active;
  active = null;
  current.intentionalStop = true;

  try {
    if (current.socket?.readyState === WebSocket.OPEN) {
      current.socket.send(JSON.stringify({ type: "stop_session" }));
    }
  } catch {}

  try {
    current.socket?.close();
  } catch {}

  await cleanupStreams();
  await sendStatePatch({
    isRecording: false,
    status: finalStatus,
    sessionId: "",
    companionUrl: "",
    warning: null,
    micEnabled: null,
    audioMode: null,
    audioContextState: null,
    tabTrackCount: null,
    micTrackCount: null,
    tabLevelDb: null,
    micLevelDb: null,
  });
}

async function listMics() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device) => ({
      deviceId: device.deviceId,
      label: device.label || "Microphone",
    }));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || !message.type) {
      return;
    }

    if (message.type === "OFFSCREEN_START") {
      try {
        await startAll(message);
        await sendStatePatch({
          isRecording: true,
          status: "Recorder connected. Waiting for the backend session…",
        });
        sendResponse({ ok: true });
      } catch (error) {
        await stopAll("Recorder failed to start.");
        sendResponse({ error: String(error) });
      }
      return;
    }

    if (message.type === "OFFSCREEN_STOP") {
      await stopAll("Stopped.");
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "OFFSCREEN_LIST_MICS") {
      sendResponse({
        devices: await listMics(),
      });
    }
  })();

  return true;
});
