# RealtimeBuddy Backend

The backend owns:

- websocket session orchestration
- ElevenLabs realtime speech-to-text
- note writing and session logs
- Codex app-server Q&A

## Environment

Create `.env.local` from [`.env.example`](./.env.example).

```bash
cp .env.example .env.local
```

Important values:

- `ELEVENLABS_API_KEY`
- `REALTIMEBUDDY_BASE_PATH`
- `CODEX_MODEL`
- `CODEX_REASONING_EFFORT`
- `CODEX_SANDBOX_MODE`
- `CODEX_APPROVAL_POLICY`
- `BACKEND_AUTH_TOKEN`

`CODEX_REASONING_EFFORT` accepts the Codex app-server reasoning levels:
`none`, `minimal`, `low`, `medium`, `high`, or `xhigh`. When unset or invalid, the backend
defaults to `high`.

`REALTIMEBUDDY_BASE_PATH` is the single base directory. When unset, it
defaults to `~/.realtimebuddy`. Buddy writes notes under
`REALTIMEBUDDY_BASE_PATH/Notes/`, Codex reads from that same tree, and the backend stores standing
context in `~/.realtimebuddy/config.json`.

## Run

```bash
pnpm --filter @realtimebuddy/backend dev
```

The backend listens on `http://localhost:3001` by default and exposes:

- `GET /health`
- `GET /config`
- `PUT /config`
- `WS /ws`
