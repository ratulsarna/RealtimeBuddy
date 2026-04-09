const DEFAULT_APP_URL = "http://localhost:3000";

const state = {
  appUrl: DEFAULT_APP_URL,
  backendBaseUrl: "",
  micDeviceId: "",
  languagePreference: "auto",
  autoOpenCompanion: true,
  isRecording: false,
  tabId: null,
  meetingTitle: null,
  status: "Idle",
  sessionId: "",
  companionUrl: "",
  micEnabled: null,
  audioMode: null,
  audioContextState: null,
  tabTrackCount: null,
  micTrackCount: null,
  tabLevelDb: null,
  micLevelDb: null,
  warning: null,
};

async function loadSettings() {
  const data = await chrome.storage.local.get([
    "realtimeBuddyAppUrl",
    "realtimeBuddyBackendBaseUrl",
    "realtimeBuddyMicDeviceId",
    "realtimeBuddyLanguagePreference",
    "realtimeBuddyAutoOpenCompanion",
  ]);

  state.appUrl = (data.realtimeBuddyAppUrl || "").trim() || DEFAULT_APP_URL;
  state.backendBaseUrl = (data.realtimeBuddyBackendBaseUrl || "").trim();
  state.micDeviceId = data.realtimeBuddyMicDeviceId || "";
  state.languagePreference = data.realtimeBuddyLanguagePreference || "auto";
  state.autoOpenCompanion = data.realtimeBuddyAutoOpenCompanion !== false;
}

function broadcastState() {
  chrome.runtime.sendMessage({ type: "STATE_UPDATE", state }).catch(() => {});
}

async function ensureOffscreenDocument() {
  const hasDocument = await chrome.offscreen.hasDocument();
  if (hasDocument) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Capture tab audio and microphone in a stable offscreen document.",
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return tabs?.[0] || null;
}

async function openMicPermissionTab() {
  const url = chrome.runtime.getURL("mic-permission.html");
  try {
    await chrome.tabs.create({ url, active: true });
    return { ok: true };
  } catch (error) {
    return { error: String(error) };
  }
}

async function openCompanionTab() {
  if (!state.companionUrl) {
    return { error: "No live session is available yet." };
  }

  try {
    await chrome.tabs.create({ url: state.companionUrl, active: true });
    return { ok: true };
  } catch (error) {
    return { error: String(error) };
  }
}

async function startRecording() {
  await loadSettings();
  const tab = await getActiveTab();
  if (!tab || !tab.id || !tab.url) {
    return { error: "No active tab found." };
  }

  await ensureOffscreenDocument();

  let streamId = "";
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (error) {
    return { error: `Could not capture the current tab: ${String(error)}` };
  }

  state.isRecording = true;
  state.tabId = tab.id;
  state.meetingTitle = tab.title || "Meeting Buddy";
  state.status = "Starting capture…";
  state.warning = null;
  state.sessionId = "";
  state.companionUrl = "";
  broadcastState();

  const response = await chrome.runtime.sendMessage({
    type: "OFFSCREEN_START",
    appUrl: state.appUrl,
    backendBaseUrl: state.backendBaseUrl,
    title: state.meetingTitle,
    tabUrl: tab.url,
    tabId: tab.id,
    tabStreamId: streamId,
    micDeviceId: state.micDeviceId,
    languagePreference: state.languagePreference,
  });

  if (response?.error) {
    state.isRecording = false;
    state.status = "Idle";
    state.warning = response.error;
    broadcastState();
    return response;
  }

  return { ok: true };
}

async function stopRecording() {
  if (!state.isRecording) {
    return { ok: true };
  }

  state.status = "Stopping…";
  broadcastState();

  const response = await chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP" }).catch((error) => ({
    error: String(error),
  }));

  state.isRecording = false;
  state.status = response?.error ? "Stopped with warnings" : "Stopped";
  if (response?.error) {
    state.warning = response.error;
  }
  broadcastState();
  return { ok: true };
}

chrome.runtime.onInstalled.addListener(async () => {
  await loadSettings();
  broadcastState();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (state.tabId !== tabId || !state.isRecording) {
    return;
  }

  await stopRecording();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || !message.type) {
      return;
    }

    if (message.type === "GET_STATE") {
      await loadSettings();
      sendResponse({ ...state });
      return;
    }

    if (message.type === "SETTINGS_UPDATED") {
      await loadSettings();
      broadcastState();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "LIST_MICS") {
      await ensureOffscreenDocument();
      const response = await chrome.runtime.sendMessage({ type: "OFFSCREEN_LIST_MICS" }).catch(() => ({
        devices: [],
      }));
      sendResponse({
        devices: response?.devices || [],
        selectedId: state.micDeviceId || "",
      });
      return;
    }

    if (message.type === "START") {
      sendResponse(await startRecording());
      return;
    }

    if (message.type === "STOP") {
      sendResponse(await stopRecording());
      return;
    }

    if (message.type === "OPEN_COMPANION") {
      sendResponse(await openCompanionTab());
      return;
    }

    if (message.type === "OPEN_MIC_PERMISSION") {
      sendResponse(await openMicPermissionTab());
      return;
    }

    if (message.type === "OFFSCREEN_STATE") {
      const previousSessionId = state.sessionId;
      Object.assign(state, message.patch || {});
      if (state.sessionId && state.appUrl) {
        try {
          const companionUrl = new URL(state.appUrl);
          companionUrl.searchParams.set("session", state.sessionId);
          state.companionUrl = companionUrl.toString();
        } catch {
          state.companionUrl = "";
        }
      }

      broadcastState();

      if (
        message.patch?.sessionId &&
        message.patch.sessionId !== previousSessionId &&
        state.autoOpenCompanion &&
        state.companionUrl
      ) {
        await openCompanionTab();
      }

      sendResponse({ ok: true });
    }
  })();

  return true;
});
