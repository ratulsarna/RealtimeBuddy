# Robust Audio Capture Backlog

## Purpose

This document captures the current thinking for building a decently robust voice-capture system for RealtimeBuddy across desktop and mobile.

The immediate goal is to stop dropping words and phrases during normal speech.

The larger goal is to design the capture stack so it can work:
- on different microphones
- at different distances from the mic
- in different environments
- on mobile as well as web

## Core conclusion

We should not rely on fixed hardcoded gate thresholds as the long-term strategy.

Those values can help during investigation, but they are not universal. They will vary too much across:
- hardware
- voice loudness
- mic placement
- room noise
- mobile vs laptop capture paths

The correct direction is a layered capture system:
- platform voice processing first
- adaptive calibration per session
- VAD / speech segmentation
- optional denoising / enhancement
- explicit diagnostics and device-awareness

## What strong mic-first apps seem to do

We do not know Wispr Flow's exact DSP stack from public sources, so we should not claim otherwise.

What their public docs strongly suggest:
- microphone selection is first-class
- active input device and levels matter
- Bluetooth microphones are treated as a quality risk
- language preferences are used to improve recognition
- they separate "bad audio" from "bad transcription" in their troubleshooting flow
- they still have platform-specific capture issues, including dropped early audio on iOS in at least one public incident

Useful product lessons:
- capture reliability is as important as the ASR model
- debugging surfaces matter
- device-awareness matters
- per-platform behavior matters

Relevant references checked on 2026-04-07:
- Wispr mic troubleshooting:
  https://docs.wisprflow.ai/articles/4351452717-troubleshooting-mic-issues
- Wispr transcription quality troubleshooting:
  https://docs.wisprflow.ai/articles/6901148133-transcription-suddenly-got-worse-or-feels-less-accurate
- Wispr incident example:
  https://docs.wisprflow.ai/articles/8176915730-transcription-degradation-across-platforms-02-24-26

## Current problem in our system

The current web pipeline uses:
- browser mic capture
- a filter/compressor chain
- an `AudioWorklet` gate based mainly on RMS thresholds
- manual commit boundaries

Recent diagnostics show:
- speech often brushes the gate threshold without sustaining it cleanly
- some chunks are dropped before the gate opens
- some speech energy falls below the close threshold during natural speech, which can cause mid-sentence loss

Implication:
- this is not just a "quiet mic" problem
- it is also a segmentation problem
- the current gate is too central to correctness

## Design principles

### 1. Platform-native capture should matter

Web capture is acceptable for a prototype, but mobile should not depend on the exact same JS-side realtime audio path.

Preferred direction:
- web: browser capture pipeline
- iOS: native audio engine and voice-processing path
- Android: native capture path with platform audio preprocessors

Shared code should live at the protocol/session layer, not the raw realtime audio layer.

### 2. Use system voice processing before custom heuristics

We should take advantage of the platform's built-in voice-oriented capture stack first.

iOS direction:
- `AVAudioSession` with a voice-oriented mode such as `voiceChat`
- voice-processing I/O path where appropriate

Android direction:
- `AudioRecord`
- `AutomaticGainControl` where available
- `NoiseSuppressor` where available
- `AcousticEchoCanceler` where available

References:
- Apple `voiceChat` mode:
  https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/voicechat
- Android `AutomaticGainControl`:
  https://developer.android.com/reference/android/media/audiofx/AutomaticGainControl
- Android `NoiseSuppressor`:
  https://developer.android.com/reference/android/media/audiofx/NoiseSuppressor
- Android `AcousticEchoCanceler`:
  https://developer.android.com/reference/android/media/audiofx/AcousticEchoCanceler

### 3. Thresholds should be adaptive, not global

We should add per-session calibration:
- short silence capture to estimate the noise floor
- short normal speech capture to estimate the speech floor

Then derive open/close behavior relative to the measured environment.

This should replace the idea that a single pair of threshold constants can work universally.

### 4. VAD should replace the RMS gate as the main decision-maker

An RMS gate is a coarse heuristic.

A better production direction is:
- use a real VAD or a VAD-like speech detector for open/close decisions
- keep RMS/peak only as supporting signals and diagnostics

Candidates:
- WebRTC-style VAD
- Silero VAD

Notes:
- Silero helps decide whether speech is present
- Silero is not a denoiser

### 5. Pre-roll and hangover are mandatory

To avoid clipping:
- keep a short rolling prebuffer before speech start
- keep streaming for a short period after energy drops

This matters on both web and mobile.

### 6. Denoising is useful, but it is not the first layer

We should not jump straight to heavy source separation.

Better order:
- system voice processing
- adaptive segmentation
- then add lightweight speech enhancement if needed

Candidate directions:
- RNNoise-class denoising
- WebRTC APM in native paths

Notes:
- heavy source separation is a bad default for live meetings
- denoising helps, but it does not solve segmentation mistakes by itself

Reference:
- RNNoise/Xiph repo:
  https://github.com/xiph/rnnoise

## Mobile-specific reality

Mobile is very much in the picture, but one distinction matters:

### Supported and realistic
- capture your own microphone audio
- stream it to the backend
- render live transcript / notes / Q&A

### Harder / platform-constrained
- capturing audio from another app's meeting on the same phone
- capturing system or call audio from apps like Zoom/Meet/WhatsApp/FaceTime

This means our mobile design should start from:
- mic-first capture
- not assume system-audio capture is universally available

## Recommended architecture

### Shared across platforms
- backend owns session state, transcription integration, Codex integration, logging, and note generation
- client captures audio and renders state
- shared protocol/types should move into `packages/shared`

### Web
- keep current browser pipeline as prototype path
- add calibration and better diagnostics
- reduce dependence on fixed thresholds

### iOS
- native capture implementation
- Apple voice-processing path
- shared websocket/session protocol with backend

### Android
- native capture implementation
- `AudioRecord` plus system preprocessors where available
- shared websocket/session protocol with backend

## Backlog

### Priority 1: Add calibration mode

Goal:
- estimate silence floor and normal speech floor per session/device

Work:
- add `Calibrate mic` flow in the UI
- record a short silence window
- record a short normal-speech window
- compute dynamic thresholds and keep them in session state
- log calibration results

Success criteria:
- threshold selection no longer depends on one global constant pair
- logs show per-session calibration data

### Priority 2: Keep audio diagnostics as a first-class feature

Goal:
- distinguish capture problems from transcription problems

Work:
- keep logging RMS, peak, gate state, sent chunks, dropped chunks
- surface a concise capture-health indicator in the UI
- add session summaries like:
  - average RMS during speech
  - % chunks dropped before open
  - number of mid-speech gate closures

Success criteria:
- a bad run can be diagnosed from logs without guessing

### Priority 3: Replace the gate with adaptive segmentation

Goal:
- move from fixed-threshold gating to more robust speech decisions

Work:
- keep prebuffer + hangover
- compute thresholds from calibration
- reduce raw RMS gate dependence
- explore WebRTC VAD or Silero-style speech decision layer

Success criteria:
- fewer clipped starts
- fewer missing words mid-sentence
- better behavior across different mic distances

### Priority 4: Improve device-awareness

Goal:
- make input quality issues visible to the user

Work:
- show active input device clearly
- warn when Bluetooth mic is active
- detect device changes during session
- add a quick "speak normally" capture-health check

Success criteria:
- users can tell whether the wrong mic or a poor-quality mic is in use

### Priority 5: Design native mobile capture paths

Goal:
- make mobile a first-class target, not a web afterthought

Work:
- define iOS capture architecture
- define Android capture architecture
- keep the backend protocol shared
- avoid sharing raw audio pipeline logic across platforms where that harms quality

Success criteria:
- there is a clear path from today's prototype to a robust mobile implementation

### Priority 6: Evaluate lightweight speech enhancement

Goal:
- improve robustness in noisy environments without making the system fragile

Work:
- evaluate RNNoise-class denoising
- evaluate native platform audio processing before adding custom ML
- only add enhancement after calibration + segmentation are in place

Success criteria:
- better speech clarity in moderate noise
- no major regression into ambient-noise over-capture

## Explicit anti-goals

We should avoid:
- tuning only by hardcoded global thresholds
- building for one specific mic distance
- assuming the web audio path is the final mobile architecture
- using text-level transcript filtering as the primary fix for audio problems
- jumping to heavy voice-isolation/source-separation as the default solution

## Immediate next step

The next implementation step should be:
- add a calibration flow and dynamic thresholds

That is the best bridge from the current prototype toward a robust system without overcommitting too early to a heavy native-only or ML-only solution.
