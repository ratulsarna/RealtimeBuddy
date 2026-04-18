# RealtimeBuddy Web

The web app is the main local UI for RealtimeBuddy. It handles:

- microphone capture and optional tab audio
- the pre-meeting brief and standing-context entry points
- the Buddy-first meeting UI
- direct Buddy Q&A during a session
- server-side helpers for backend auth and standing-context load/save

## Environment

Create `.env.local` from [`.env.example`](./.env.example).

```bash
cp .env.example .env.local
```

Required values:

- `BACKEND_BASE_URL`
- `BACKEND_AUTH_TOKEN`

## Run

From the repo root:

```bash
pnpm dev:web
```

Or start the whole stack:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).
