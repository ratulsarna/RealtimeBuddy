# RealtimeBuddy Backlog

## Current priority

1. Improve microphone sensitivity and gain tuning.
2. Add pause and resume for the same session.
3. Add language preference controls, especially for Hindi.
4. Investigate speaker attribution strategy.

## Items

### 1. Improve microphone sensitivity and gain tuning

Status: Next

Why:
- Current capture feels under-gained.
- You have to be too close to the mic for reliable transcription.

Likely work:
- Revisit the current browser audio constraints and filter chain.
- Tune gate thresholds after the move to `AudioWorklet`.
- Consider making gain and speech-threshold controls adjustable in the UI.
- Add a simple calibration/test step before starting a session.
- Add a real speech denoiser before transcription, not just gating.

Recommended technical direction:
- Do not rely on gain changes alone.
- Do not use heavy vocal-stem separation for live mic capture.
- Prefer a layered approach:
- Browser / device noise suppression where available.
- Voice activity detection / gating.
- A speech enhancement model tuned for low-latency denoising.

Candidate options:
- RNNoise:
  lightweight, realtime, speech-focused denoiser; strong fit for browser or mobile integration.
- WebRTC Audio Processing Module:
  includes noise suppression, echo cancellation, and automatic gain control; especially useful in native/mobile paths.
- DeepFilterNet:
  stronger enhancement quality than lightweight denoisers, but heavier and more operationally expensive for a web-first realtime path.
- Silero VAD:
  useful for speech detection and turn boundaries, but not a denoiser by itself.

Current recommendation:
- Short term: tune gain and thresholds conservatively and add RNNoise-class denoising.
- Medium term: for mobile/native paths, evaluate WebRTC APM or a native RNNoise integration.
- Avoid Demucs-style source separation for live meetings unless we later support offline cleanup, because it is heavier and more artifact-prone for this use case.

### 2. Pause and resume the same session

Status: Planned

Why:
- Stopping currently ends the session lifecycle instead of letting you temporarily pause capture.

Likely work:
- Add explicit `pause_session` and `resume_session` client events.
- Keep the same note, session state, transcript history, and Codex thread alive across pauses.
- Reflect paused state clearly in the UI and logs.

### 3. Language preference controls

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

### 4. Speaker detection and attribution

Status: Research / design

Question:
- Is this possible with ElevenLabs?

Current answer:
- ElevenLabs supports speaker diarization on `scribe_v2` batch transcription.
- ElevenLabs does not currently prioritize realtime speaker diarization for `scribe_v2_realtime`.
- Their public realtime page explicitly says speaker diarization is not a priority for the realtime model right now.

Implication for us:
- For live meetings, native ElevenLabs realtime diarization is not something we should rely on today.
- If we want live speaker attribution, we will likely need one of these paths:
- Build a local attribution layer on top of the live stream.
- Post-process committed transcript chunks with a second pass.
- Explore a different realtime diarization provider later if this becomes critical.

Notes:
- Batch `scribe_v2` also supports multichannel transcription and diarization-related controls like `diarize`, `num_speakers`, and `diarization_threshold`.

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
