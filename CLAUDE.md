# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

RealtimeBuddy is an ambient meeting companion that streams microphone (and optional browser tab) audio to ElevenLabs Scribe v2 for realtime transcription, writes a live markdown note into an Obsidian vault, and keeps a local Codex app-server thread warm for near-realtime Q&A during the meeting.

The repository is structured as a small monorepo:
- `apps/web` contains the current Next.js app
- `apps/mobile` is reserved for the upcoming mobile app
- `packages/shared` is reserved for shared types and logic

## Commands

Preferred commands run from the repo root:

```bash
pnpm install          # install workspace dependencies
pnpm dev              # web dev server (tsx watch server.ts) on http://localhost:3000
pnpm build            # production Next.js build for the web app
pnpm start            # production server for the web app
pnpm lint             # eslint for the web app
pnpm e2e:validate     # Playwright E2E smoke test for the web app
```

There is no test runner beyond lint and the E2E script.

## Environment

Copy `apps/web/.env.example` to `apps/web/.env.local`. Required values:
- `ELEVENLABS_API_KEY` - ElevenLabs API key for realtime STT
- `OBSIDIAN_VAULT_PATH` - absolute path to Obsidian vault root
- `CODEX_MODEL` - preferred Codex model (default: `gpt-5.3-codex-spark`)

## Architecture

### Custom server (`apps/web/server.ts`)

The app does **not** use `next start`. A custom Node HTTP server wraps Next.js and adds a WebSocket upgrade handler. Requests to `/ws` go to the app's own `WebSocketServer`; all other upgrades fall through to Next.js (HMR etc). This means `pnpm dev` runs `tsx watch server.ts`, not `next dev`.

### WebSocket protocol (`src/shared/protocol.ts`)

All client-server communication during a session flows over a single WebSocket. `ClientEvent` and `ServerEvent` are discriminated unions shared between client and server. Changes to these types affect both sides.

### Server-side data flow

```
WebSocket connection
  -> MeetingBroker (src/server/meeting-broker.ts)
       attaches one MeetingSession per socket
  -> MeetingSession (src/server/meeting-session.ts)
       orchestrates the session lifecycle:
       - ElevenLabsBridge: forwards PCM audio chunks to ElevenLabs, receives partial/committed transcripts
       - CodexAppServer: spawns `codex app-server` subprocess, communicates via JSON-RPC over stdio
       - NoteBuilder: pure function that assembles the markdown note
       - Writes the note to disk at <vault>/Notes/Dated/YYYY-MM-DD/<title> - HH-MM.md
```

`ElevenLabsBridge` (`src/server/elevenlabs-bridge.ts`) uses manual commit strategy -- the client triggers commits on speech pauses.

`CodexAppServer` (`src/server/codex-app-server.ts`) manages the full JSON-RPC lifecycle: initialize, model selection, thread creation, and streaming turn responses via notifications.

### Client-side

The entire UI is a single client component `MeetingBuddyApp` (`src/components/meeting-buddy-app.tsx`).

`AudioCapture` (`src/lib/audio-capture.ts`) handles microphone + optional tab audio capture, mixes to mono, applies a noise gate with prebuffer/hangover, and encodes to base64 PCM16. The noise gate's `onSpeechPause` callback triggers transcript commits.

### Next.js version

This uses **Next.js 16** which has breaking changes from earlier versions. Read `apps/web/node_modules/next/dist/docs/` before writing Next.js-specific code. Heed deprecation notices.

## Path alias

`@/*` maps to `./src/*` (configured in tsconfig.json).
