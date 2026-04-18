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
- `CODEX_VAULT_PATH`
- `CODEX_MODEL`
- `CODEX_SANDBOX_MODE`
- `CODEX_APPROVAL_POLICY`
- `BACKEND_AUTH_TOKEN`

For the demo backend, `CODEX_VAULT_PATH` is the single vault root. Buddy writes notes under
`CODEX_VAULT_PATH/Notes/`, and Codex reads from that same vault tree.

## Run

```bash
pnpm --filter @realtimebuddy/backend dev
```

The backend listens on `http://localhost:3001` by default and exposes:

- `GET /health`
- `WS /ws`
