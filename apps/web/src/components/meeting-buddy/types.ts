export type PendingTranscriptEntry = {
  id: string;
  text: string;
  at: string;
};

export type CommittedTranscriptEntry = {
  text: string;
  at: string;
};

export type QuestionAnswer = {
  question: string;
  answer: string;
  askedAt?: string;
};

export type AudioDiagnostics = {
  rms: number;
  peak: number;
  gateOpen: boolean;
  openThreshold: number;
  closeThreshold: number;
  candidateChunks: number;
  sentChunks: number;
  droppedChunks: number;
};

export type CaptureIntent = "idle" | "starting" | "resuming";
export type SessionMode = "local_capture" | "companion" | null;
export type ConnectionState =
  | "idle"
  | "connecting"
  | "starting"
  | "live"
  | "paused"
  | "resuming"
  | "stopping";
