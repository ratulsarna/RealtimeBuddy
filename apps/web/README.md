# RealtimeBuddy

Ambient meeting companion that:

- captures microphone audio and optional browser tab audio
- streams speech to a dedicated RealtimeBuddy backend over WebSocket
- writes a live markdown note into your Obsidian vault through that backend
- keeps a local Codex app-server thread warm on the backend for near realtime questions

## Stack

- Next.js 16 app router for the UI
- shared workspace types in [`packages/shared`](../../packages/shared)
- standalone backend app in [`apps/backend`](../backend)

## Environment

Create `.env.local` from [`.env.example`](./.env.example).

```bash
cp .env.example .env.local
```

The important values are:

- `BACKEND_BASE_URL`
- `BACKEND_AUTH_TOKEN`

## Run

```bash
pnpm install
pnpm dev:backend
pnpm dev:web
```

Open `http://localhost:3000`.

From the repo root, you can also launch both together:

```bash
pnpm install
pnpm dev
```

## How The Prototype Works

1. The browser asks for microphone access and, if enabled, tab audio via screen share.
2. Audio is mixed client-side and streamed as PCM chunks to the backend WebSocket server.
3. The backend forwards chunks to ElevenLabs and receives partial + committed transcripts.
4. Every committed transcript chunk updates a live markdown note under:

```text
<vault>/Notes/Dated/YYYY-MM-DD/<session title> - HH-MM.md
```

5. Questions from the UI are answered through the backend's local Codex app-server using the live note plus recent transcript context.

## What Is Intentionally MVP-Level

- notes are currently transcript-driven, not deeply restructured meeting summaries
- tab audio depends on the browser exposing an audio track during screen share
- there is no persisted session database yet; the Obsidian note is the main artifact
- the browser still needs a backend auth token configured when the backend is exposed remotely

## Verified

- `pnpm lint`
- `pnpm build`
- `pnpm e2e:validate` against a separate frontend/backend process pair
