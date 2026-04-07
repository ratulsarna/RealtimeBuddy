# RealtimeBuddy Backlog

## Current priority

1. Add pause and resume for the same session.
2. Add language preference controls, especially for Hindi.
3. Decouple frontend and backend for remote use.
4. Link Codex session to the vault path.

## Items

### 1. Pause and resume the same session

Status: Planned

Why:
- Stopping currently ends the session lifecycle instead of letting you temporarily pause capture.

Likely work:
- Add explicit `pause_session` and `resume_session` client events.
- Keep the same note, session state, transcript history, and Codex thread alive across pauses.
- Reflect paused state clearly in the UI and logs.

### 2. Language preference controls

Status: Planned

Why:
- Automatic language detection is not behaving well enough for Hindi right now.
- Hindi speech is sometimes being rendered as Urdu-script output even when meaning is roughly correct.

Likely work:
- Add a language selector in the UI.
- Send `language_code` to ElevenLabs realtime when the user picks a language.
- Start with a simple `Auto / Hindi / English / Hinglish` UX and refine from real usage.

Notes:
- ElevenLabs realtime STT supports an optional `language_code` parameter.
- If the language is known ahead of time, their docs say it can improve transcription performance.

### 3. Decouple frontend and backend for remote use

Status: Planned

Why:
- The long-term usage model is remote: Ratul should be able to use the product from a phone or laptop outside the house, with the backend running elsewhere.
- The current code already splits responsibilities logically, but the deployment model is still coupled inside `apps/web`.

Target architecture:
- Frontend captures audio, renders transcript / notes / Q&A, and streams events to a remote backend.
- Backend owns session state, ElevenLabs integration, Codex integration, logging, and note writing.
- Frontend should not assume same-origin `/ws`; it should talk to an explicit configurable backend host.

Likely work:
- Extract the current websocket/session server into a standalone backend app.
- Introduce shared protocol/types in `packages/shared`.
- Add explicit frontend config for a remote API / websocket base URL.
- Keep browser/mobile clients thin so the future mobile app can reuse the same backend contract.
- Add auth before exposing the backend remotely.
- Verify the audio-streaming flow works against a non-local backend with real network latency.

Notes:
- This is not about turning the project into SaaS right now.
- The goal is personal remote usability: coffee shop, phone-only, backend elsewhere.

### 4. Link Codex session to the vault path

Status: Planned

Why:
- When the buddy answers questions, it should be able to look beyond the live session transcript and consult the Obsidian vault when relevant.
- The Codex session should run with the vault as its working context so it can inspect existing notes and related material in the vault.

Likely work:
- Open the Codex app-server thread/session against the vault path instead of the app repo path.
- Make the vault path explicit in backend configuration.
- Ensure the model can safely search/read relevant vault files when answering questions.
- Keep the live meeting context primary, but allow vault lookups as supporting context.

Notes:
- The desired vault path is the same Obsidian vault used for note writing.
- This is about giving the model access to the vault as context, not moving note writing to the frontend.

## Source notes

Relevant ElevenLabs docs checked on 2026-04-07:
- Realtime STT API: `language_code` is supported and `commit_strategy` defaults to `manual`.
- Batch STT API: diarization is supported on `scribe_v2`.
- Models overview: diarization is listed for `scribe_v2`, not for `scribe_v2_realtime`.
- Realtime product page FAQ: realtime speaker diarization is not a priority at the moment.

Other relevant references checked on 2026-04-07:
- RNNoise: realtime neural noise suppression library from Xiph.
- WebRTC APM: standalone or pipeline-integrated audio processing with NS / AEC / AGC.
- Silero VAD: fast multilingual speech activity detector.
- DeepFilterNet: realtime speech enhancement with a heavier quality/perf tradeoff.
