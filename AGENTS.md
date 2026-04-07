# Repository Guidelines

## Project Structure & Module Organization
RealtimeBuddy is a `pnpm` monorepo. The active product lives in `apps/web`, with the Next.js app router UI under `apps/web/src/app`, shared UI in `apps/web/src/components`, browser audio helpers in `apps/web/src/lib`, WebSocket and note-writing logic in `apps/web/src/server`, and protocol types in `apps/web/src/shared`. Static assets live in `apps/web/public`. `apps/mobile` and `packages/shared` are reserved for future work and should stay minimal unless you are actively extending those targets.

## Build, Test, and Development Commands
Install dependencies once with `pnpm install`.

- `pnpm dev` runs the local web app through the workspace root.
- `pnpm build` runs the production Next.js build for `apps/web`.
- `pnpm start` starts the local Node/TSX server entrypoint in `apps/web/server.ts`.
- `pnpm lint` runs ESLint with the Next.js + TypeScript config.
- `pnpm e2e:validate` runs the Playwright-based validation script in `apps/web/scripts/validate-e2e.ts`.

For app-specific work, use `pnpm --filter @realtimebuddy/web <command>`.

## Coding Style & Naming Conventions
Use TypeScript with strict typing and keep the existing style: 2-space indentation, double quotes, semicolons, and small focused modules. Prefer `PascalCase` for React components, `camelCase` for functions and variables, and kebab-case for non-component filenames like `note-builder.ts`. Use the `@/*` alias for imports within `apps/web/src`. Run `pnpm lint` before opening a PR.

## Testing Guidelines
There is no broad unit test suite yet; current validation is repo-level linting, production build, and the end-to-end script. When you touch capture, transcript, or Q&A flows, run `pnpm e2e:validate` and note any required env vars such as `ELEVENLABS_API_KEY` and `OBSIDIAN_VAULT_PATH`. Keep new tests close to the feature they validate, and name them after the behavior under test.

### E2E Runbook

- `pnpm e2e:validate` is unattended once the local dependencies are ready. The script launches headless Chromium, grants microphone permission, feeds prerecorded audio, asks a question in the UI, and validates the written Obsidian note.
- Start the app separately before running the validator. The script expects `APP_URL` to already be serving the app and defaults to `http://localhost:3000`; it does not boot the server for you.
- The validator depends on local machine setup, not just repo code. Make sure `ELEVENLABS_API_KEY` is set, `OBSIDIAN_VAULT_PATH` points at a writable vault, and the `codex` CLI is installed so the local app-server Q&A flow can answer the test question.
- The fake audio capture file must exist at `FAKE_AUDIO_PATH`; by default this is `/tmp/realtimebuddy-e2e.wav`. Override the env var if your fixture lives somewhere else.
- The note assertion is date-based and writes to `<vault>/Notes/Dated/YYYY-MM-DD/...`, so timezone and local filesystem access matter.

### E2E Gotchas

- If `pnpm dev` says another Next dev server is already running, reuse the existing server or stop it first. This came up locally and is easy to mistake for an app failure.
- A passing browser flow can still fail overall if ElevenLabs credentials are missing, the fake audio file is absent, the Obsidian vault path does not exist, or the `codex` CLI is unavailable.
- The current validator checks for specific transcript and answer content from the bundled fake audio fixture, so changes to that fixture or to the answer behavior can break the test even when the UI still looks healthy.

## Commit & Pull Request Guidelines
Follow the existing commit style: short, imperative, sentence-case summaries such as `Improve live capture reliability and session logging`. PRs should explain the user-visible change, call out any env or setup changes, link the relevant issue, and include screenshots for UI updates. Mention which checks you ran (`pnpm lint`, `pnpm build`, `pnpm e2e:validate`) and do not commit `.env.local`, `.next`, or `apps/web/output/`.

## Security & Configuration Tips
Start from `apps/web/.env.example` and keep secrets in `apps/web/.env.local` only. This app writes notes and session logs locally, so be careful when changing filesystem paths, logging, or captured transcript content.
