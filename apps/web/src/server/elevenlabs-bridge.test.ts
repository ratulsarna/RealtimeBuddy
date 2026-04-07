import assert from "node:assert/strict";
import test from "node:test";

import { buildRealtimeTranscriptionQuery } from "./elevenlabs-bridge";

test("buildRealtimeTranscriptionQuery includes language_code when provided", () => {
  const query = buildRealtimeTranscriptionQuery({
    sampleRate: 48_000,
    languageCode: "hi",
  });

  assert.equal(query.get("audio_format"), "pcm_48000");
  assert.equal(query.get("language_code"), "hi");
});

test("buildRealtimeTranscriptionQuery omits language_code for auto detection", () => {
  const query = buildRealtimeTranscriptionQuery({
    sampleRate: 48_000,
  });

  assert.equal(query.get("audio_format"), "pcm_48000");
  assert.equal(query.has("language_code"), false);
});
