const DEFAULT_APP_URL = "http://localhost:3000";

function $(id) {
  return document.getElementById(id);
}

async function send(message) {
  return await chrome.runtime.sendMessage(message);
}

function formatDb(value) {
  if (value === null || value === undefined) return "-";
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(1)} dB`;
}

function setWarning(text) {
  const el = $("warning");
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    return;
  }

  el.hidden = false;
  el.textContent = text;
}

function setStatus(state) {
  $("status").textContent = state.status || "Idle";
  $("isRecording").textContent = state.isRecording ? "yes" : "no";
  $("sessionId").textContent = state.sessionId || "-";
  $("companionUrl").textContent = state.companionUrl || "-";
  $("audioMode").textContent = state.audioMode || "-";
  $("micEnabled").textContent =
    state.micEnabled === true ? "on" : state.micEnabled === false ? "off" : "?";
  $("tabLevel").textContent = formatDb(state.tabLevelDb);
  $("micLevel").textContent = formatDb(state.micLevelDb);
  $("start").disabled = !!state.isRecording;
  $("stop").disabled = !state.isRecording;
  $("openCompanion").disabled = !state.sessionId;
  setWarning(state.warning || "");
}

async function loadSettings() {
  const data = await chrome.storage.local.get([
    "realtimeBuddyAppUrl",
    "realtimeBuddyBackendBaseUrl",
    "realtimeBuddyMicDeviceId",
    "realtimeBuddyLanguagePreference",
    "realtimeBuddyAutoOpenCompanion",
  ]);

  $("appUrl").value = data.realtimeBuddyAppUrl || DEFAULT_APP_URL;
  $("backendBaseUrl").value = data.realtimeBuddyBackendBaseUrl || "";
  $("language").value = data.realtimeBuddyLanguagePreference || "auto";
  $("autoOpenCompanion").checked = data.realtimeBuddyAutoOpenCompanion !== false;
}

async function saveSettings() {
  const nextSettings = {
    realtimeBuddyAppUrl: ($("appUrl").value || "").trim() || DEFAULT_APP_URL,
    realtimeBuddyBackendBaseUrl: ($("backendBaseUrl").value || "").trim(),
    realtimeBuddyMicDeviceId: $("micDevice").value || "",
    realtimeBuddyLanguagePreference: $("language").value || "auto",
    realtimeBuddyAutoOpenCompanion: $("autoOpenCompanion").checked,
  };

  await chrome.storage.local.set(nextSettings);
  await send({
    type: "SETTINGS_UPDATED",
    ...nextSettings,
  });
}

async function refreshMicList() {
  const resp = await send({ type: "LIST_MICS" });
  const select = $("micDevice");
  select.textContent = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Default microphone";
  select.appendChild(defaultOption);

  const devices = resp?.devices || [];
  for (const device of devices) {
    const option = document.createElement("option");
    option.value = device.deviceId || "";
    option.textContent = device.label || "Microphone";
    select.appendChild(option);
  }

  select.value = resp?.selectedId || "";
}

async function refresh() {
  const state = await send({ type: "GET_STATE" });
  setStatus(state || {});
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await refreshMicList().catch(() => {});
  await refresh();

  $("save").addEventListener("click", async () => {
    await saveSettings();
    await refresh();
  });

  $("refreshMics").addEventListener("click", async () => {
    await refreshMicList();
  });

  $("enableMic").addEventListener("click", async () => {
    const resp = await send({ type: "OPEN_MIC_PERMISSION" });
    if (resp?.error) {
      setWarning(resp.error);
    }
  });

  $("start").addEventListener("click", async () => {
    await saveSettings();
    const resp = await send({ type: "START" });
    if (resp?.error) {
      setWarning(resp.error);
    }
    await refresh();
  });

  $("stop").addEventListener("click", async () => {
    const resp = await send({ type: "STOP" });
    if (resp?.error) {
      setWarning(resp.error);
    }
    await refresh();
  });

  $("openCompanion").addEventListener("click", async () => {
    const resp = await send({ type: "OPEN_COMPANION" });
    if (resp?.error) {
      setWarning(resp.error);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "STATE_UPDATE") {
      return;
    }

    setStatus(message.state || {});
  });
});
