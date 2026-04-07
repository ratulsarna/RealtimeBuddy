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

## Commit & Pull Request Guidelines
Follow the existing commit style: short, imperative, sentence-case summaries such as `Improve live capture reliability and session logging`. PRs should explain the user-visible change, call out any env or setup changes, link the relevant issue, and include screenshots for UI updates. Mention which checks you ran (`pnpm lint`, `pnpm build`, `pnpm e2e:validate`) and do not commit `.env.local`, `.next`, or `apps/web/output/`.

## Security & Configuration Tips
Start from `apps/web/.env.example` and keep secrets in `apps/web/.env.local` only. This app writes notes and session logs locally, so be careful when changing filesystem paths, logging, or captured transcript content.
