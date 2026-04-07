# RealtimeBuddy

Ambient meeting companion that:

- captures microphone audio and optional browser tab audio
- streams speech to ElevenLabs Scribe v2 realtime
- writes a live markdown note into your Obsidian vault
- keeps a local Codex app-server thread warm for near realtime questions

## Stack

- Next.js 16 app router for the UI
- custom Node WebSocket server in [`server.ts`](./server.ts)
- ElevenLabs realtime speech-to-text over WebSocket
- local `codex app-server` using `gpt-5.3-codex-spark` when available

## Environment

Create `.env.local` from [`.env.example`](./.env.example).

```bash
cp .env.example .env.local
```

The important values are:

- `ELEVENLABS_API_KEY`
- `OBSIDIAN_VAULT_PATH`
- `CODEX_MODEL`

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

From the repo root, the same commands work via workspace scripts:

```bash
pnpm install
pnpm dev
```

## How The Prototype Works

1. The browser asks for microphone access and, if enabled, tab audio via screen share.
2. Audio is mixed client-side and streamed as PCM chunks to the local WebSocket server.
3. The server forwards chunks to ElevenLabs and receives partial + committed transcripts.
4. Every committed transcript chunk updates a live markdown note under:

```text
<vault>/Notes/Dated/YYYY-MM-DD/<session title> - HH-MM.md
```

5. Questions from the UI are answered through the local Codex app-server using the live note plus recent transcript context.

## What Is Intentionally MVP-Level

- notes are currently transcript-driven, not deeply restructured meeting summaries
- tab audio depends on the browser exposing an audio track during screen share
- there is no persisted session database yet; the Obsidian note is the main artifact
- the app assumes a local, trusted machine with Codex and ElevenLabs credentials already available

## Verified

- `pnpm lint`
- `pnpm build`
- local Codex bridge smoke test against `gpt-5.3-codex-spark`
