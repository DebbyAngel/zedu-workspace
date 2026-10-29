# Zedu Workspace

A cohort workspace mock with channels, a Ziki AI planning panel, and a human-review gate.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string; `XAI_API_KEY` — server-side xAI Responses API key for Ziki

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/zedu-workspace/src/App.tsx` — workspace UI, chat, agent controls, and process flow
- `artifacts/zedu-workspace/src/index.css` — layout and visual theme
- `artifacts/api-server/src/routes/workspace.ts` — persisted chat/checkpoint routes and xAI-backed Ziki analysis
- `lib/api-spec/openapi.yaml` — API source of truth; regenerate clients with the codegen command above
- `lib/db/src/schema` — Drizzle database schema

## Architecture decisions

- The browser calls Ziki only when a user mentions `@Ziki`; `XAI_API_KEY` stays on the API server.
- Ziki receives the task and up to six recent messages from that channel. The xAI Responses API request sets `store: false`.
- Ziki drafts a three-step plan. Approval is recorded as a checkpoint only; this workspace does not edit files, execute code, commit, or deploy.
- The model route has a best-effort per-IP in-memory rate limit. This public demo has no sign-in; set provider-side usage limits before broad exposure.

## Product

Users can explore cohort channels, send messages, ask Ziki for a model-generated plan, inspect or revise the plan, and explicitly record human approval.

## User preferences

No cross-project preferences are defined here.

## Gotchas

- The agent panel returns a configuration message until `XAI_API_KEY` is added to the API server's Replit Secrets.
- Approval does not imply that any code was changed or tested.
- The agent rate limit is process-local and is not a substitute for authentication or provider-side spend limits.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
