import type { ConnectionState, SessionMode } from "@/components/meeting-buddy/types";

export function formatAskedAt(askedAt?: string) {
  return askedAt ? `Asked ${askedAt}` : "Asked just now";
}

export function formatConnectionStateLabel(connectionState: ConnectionState) {
  switch (connectionState) {
    case "connecting":
      return "Connecting";
    case "starting":
      return "Starting";
    case "live":
      return "Live";
    case "paused":
      return "Paused";
    case "resuming":
      return "Resuming";
    case "stopping":
      return "Stopping";
    default:
      return "Ready";
  }
}

export function formatSessionModeLabel(sessionMode: SessionMode) {
  switch (sessionMode) {
    case "local_capture":
      return "Local capture";
    case "companion":
      return "Companion";
    default:
      return "Detached";
  }
}

export function getSessionHeadline(connectionState: ConnectionState, sessionMode: SessionMode) {
  if (sessionMode === "companion") {
    switch (connectionState) {
      case "connecting":
        return "Joining the live room";
      case "live":
        return "Companion console attached";
      case "paused":
        return "Companion console standing by";
      default:
        return "Ready to attach";
    }
  }

  switch (connectionState) {
    case "starting":
      return "Opening the capture session";
    case "live":
      return "Capture is live";
    case "paused":
      return "Capture is paused";
    case "resuming":
      return "Reconnecting microphone";
    case "stopping":
      return "Wrapping up the session";
    default:
      return "Ready to record";
  }
}

export function getStatusTone(connectionState: ConnectionState): "active" | "warning" | "neutral" {
  if (connectionState === "live" || connectionState === "starting" || connectionState === "resuming") {
    return "active";
  }

  if (connectionState === "paused" || connectionState === "stopping" || connectionState === "connecting") {
    return "warning";
  }

  return "neutral";
}
