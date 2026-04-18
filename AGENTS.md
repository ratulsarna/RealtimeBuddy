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

For app-specific work, use `pnpm --filter @realtimebuddy/backend <command>` or `pnpm --filter @realtimebuddy/web <command>`.

## Coding Style & Naming Conventions
Use TypeScript with strict typing and keep the existing style: 2-space indentation, double quotes, semicolons, and small focused modules. Prefer `PascalCase` for React components, `camelCase` for functions and variables, and kebab-case for non-component filenames like `note-builder.ts`. Use the `@/*` alias for imports within `apps/web/src`. Run `pnpm lint` before opening a PR.

## Testing Guidelines
There is no broad unit test suite yet; current validation is repo-level linting, production build, and backend/web targeted tests. Keep new tests close to the feature they validate, and name them after the behavior under test.

## Commit & Pull Request Guidelines
Follow the existing commit style: short, imperative, sentence-case summaries such as `Improve live capture reliability and session logging`. PRs should explain the user-visible change, call out any env or setup changes, link the relevant issue, and include screenshots for UI updates. Mention which checks you ran (`pnpm lint`, `pnpm build`, targeted tests) and do not commit `.env.local`, `.next`, or `apps/web/output/`.

## Security & Configuration Tips
Start from both `apps/backend/.env.example` and `apps/web/.env.example`, and keep secrets in the respective `.env.local` files only. This app writes notes, standing context, and session logs locally, so be careful when changing filesystem paths, logging, or captured transcript content.
