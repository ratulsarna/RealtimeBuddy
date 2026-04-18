# Repository Guidelines

## Project Structure & Module Organization
RealtimeBuddy is a `pnpm` monorepo. The main product is split across `apps/web` and `apps/backend`: the Next.js UI lives in `apps/web`, while session orchestration, WebSocket handling, Codex integration, and note/config persistence live in `apps/backend`. The browser extension lives in `apps/extension`, shared protocol/auth types live in `packages/shared`, and `apps/mobile` remains minimal unless you are actively extending it. Static assets for the web app live in `apps/web/public`.

## Build, Test, and Development Commands
Install dependencies once with `pnpm install`.

- `pnpm dev` starts both backend and web from the workspace root.
- `pnpm dev:backend` starts the standalone backend.
- `pnpm dev:web` starts the Next.js app.
- `pnpm build` runs workspace builds/typechecks.
- `pnpm start` starts both backend and web in production mode.
- `pnpm lint` runs workspace lint/typecheck commands.
- `pnpm e2e:validate` runs the Playwright-based validation script in `apps/web/scripts/validate-e2e.ts`.

For app-specific work, use `pnpm --filter @realtimebuddy/backend <command>` or `pnpm --filter @realtimebuddy/web <command>`.

## Coding Style & Naming Conventions
Use TypeScript with strict typing and keep the existing style: 2-space indentation, double quotes, semicolons, and small focused modules. Prefer `PascalCase` for React components, `camelCase` for functions and variables, and kebab-case for non-component filenames like `note-builder.ts`. Use the `@/*` alias for imports within `apps/web/src`. Run `pnpm lint` before opening a PR.

## Testing Guidelines
There is no broad unit test suite yet; current validation is repo-level linting, production build, backend/web targeted tests, and the end-to-end script. When you touch capture, transcript, or Q&A flows, run `pnpm e2e:validate` and note any required env vars such as `ELEVENLABS_API_KEY` and `REALTIMEBUDDY_BASE_PATH`. Keep new tests close to the feature they validate, and name them after the behavior under test.

### E2E Runbook

- `pnpm e2e:validate` is unattended once the local dependencies are ready. The script launches headless Chromium, grants microphone permission, feeds prerecorded audio, asks a question in the UI, and validates the written note output.
- Start the app separately before running the validator. The script expects `APP_URL` to already be serving the app and defaults to `http://localhost:3000`; it does not boot the server for you.
- The validator depends on local machine setup, not just repo code. Make sure `ELEVENLABS_API_KEY` is set, `REALTIMEBUDDY_BASE_PATH` points at a writable base directory, and the `codex` CLI is installed so the local app-server Q&A flow can answer the test question.
- The fake audio capture file must exist at `FAKE_AUDIO_PATH`; by default this is `/tmp/realtimebuddy-e2e.wav`. Override the env var if your fixture lives somewhere else.
- The note assertion is date-based and writes to `<base>/Notes/Dated/YYYY-MM-DD/...`, so timezone and local filesystem access matter.

### E2E Gotchas

- If `pnpm dev` says another dev server is already running, reuse the existing processes or stop them first. This is easy to mistake for an app failure.
- A passing browser flow can still fail overall if ElevenLabs credentials are missing, the fake audio file is absent, the base path does not exist, or the `codex` CLI is unavailable.
- The current validator checks for specific transcript and answer content from the bundled fake audio fixture, so changes to that fixture or to the answer behavior can break the test even when the UI still looks healthy.

## Commit & Pull Request Guidelines
Follow the existing commit style: short, imperative, sentence-case summaries such as `Improve live capture reliability and session logging`. PRs should explain the user-visible change, call out any env or setup changes, link the relevant issue, and include screenshots for UI updates. Mention which checks you ran (`pnpm lint`, `pnpm build`, `pnpm e2e:validate`) and do not commit `.env.local`, `.next`, or `apps/web/output/`.

## Security & Configuration Tips
Start from both `apps/backend/.env.example` and `apps/web/.env.example`, and keep secrets in the respective `.env.local` files only. This app writes notes, standing context, and session logs locally, so be careful when changing filesystem paths, logging, or captured transcript content.
