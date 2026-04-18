# RealtimeBuddy

RealtimeBuddy is a local-first meeting assistant built around a proactive "Buddy" model.
You give Buddy a short brief before a meeting, stream live audio into the app, and Buddy
surfaces short in-the-moment nudges while also staying available for direct Q&A.

## Features

- captures microphone audio and optional tab audio from the browser
- streams audio to ElevenLabs for realtime transcription
- keeps Buddy aware of the meeting as transcript updates arrive
- shows proactive Buddy cards in a dedicated meeting lane
- supports direct Buddy Q&A during the meeting
- persists standing context and stores notes locally

## Why Realtime Works

The Buddy loop depends on low-latency model turns. In the current setup, RealtimeBuddy uses
`gpt-5.3-codex-spark` by default for the Codex app-server session, which keeps the transcript-fed
Buddy turns fast enough to be useful during a live meeting instead of only after the fact.

## Running Locally

- Node.js with `pnpm`
- an `ELEVENLABS_API_KEY`
- local `codex` CLI available on `PATH`

Install dependencies:

```bash
pnpm install
```

Create local env files:

```bash
cp apps/backend/.env.example apps/backend/.env.local
cp apps/web/.env.example apps/web/.env.local
```

Set these values:

- `ELEVENLABS_API_KEY`
- `BACKEND_AUTH_TOKEN`
- `BACKEND_BASE_URL=http://localhost:3001`
- optionally `REALTIMEBUDDY_BASE_PATH` (defaults to `~/.realtimebuddy`)

The web and backend apps must use the same `BACKEND_AUTH_TOKEN`.

Start the stack:

```bash
pnpm dev
```

This starts the backend on `http://localhost:3001` and the web app on `http://localhost:3000`.

## Quick Test Flow

The most reliable local path right now is browser-based tab-audio testing:

1. Open the web app at `http://localhost:3000`
2. Enter a short meeting brief
3. Click `Start meeting`
4. Enable tab audio if you want to test from a meeting recording
5. Share the browser tab that is playing the audio file
6. Watch the transcript and Buddy lane update in realtime

## Configuration

- `ELEVENLABS_API_KEY`
- `REALTIMEBUDDY_BASE_PATH`
- `BACKEND_AUTH_TOKEN`
- `CODEX_MODEL`
- `CODEX_SANDBOX_MODE`
- `CODEX_APPROVAL_POLICY`
- `BUDDY_STATIC_USER_SEED`

Local data is stored under `REALTIMEBUDDY_BASE_PATH`, including:

- `Notes/...`
- `config.json`

## Validation

Useful commands from the repo root:

```bash
pnpm lint
pnpm build
pnpm test
```

There is also a Playwright validation script:

```bash
pnpm e2e:validate
```

Manual testing is often the fastest path for realtime behavior.

## Limitations

- optimized for speed of iteration rather than production robustness
- extension-specific flows are not fully aligned with the latest web app flow
- manual testing is currently the main validation path for realtime behavior
- security and privacy hardening are not the current focus
- the written note artifact is intentionally minimal right now
