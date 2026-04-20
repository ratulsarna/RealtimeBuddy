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

`/api/backend-auth` mints short-lived backend tokens for browser sessions. For
safety, token issuance is limited to local development hosts and Tailscale
addresses/hostnames:

- `localhost`, `127.0.0.0/8`, `::1`, and `0.0.0.0`
- Tailscale IPv4 addresses in `100.64.0.0/10`
- Tailscale IPv6 addresses under `fd7a:115c:a1e0::/48`
- Tailscale MagicDNS hosts ending in `.ts.net`

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

The default web scripts bind to `localhost`. For intentional Tailscale access,
use:

```bash
pnpm dev:web:tailscale
```

Only expose the web app over localhost or your private Tailnet. Do not publish
the web app port directly to the public internet.
