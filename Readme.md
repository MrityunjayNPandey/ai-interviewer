# AI Interviewer

Practise a job interview with an AI interviewer tailored to your resume and the job you want, and get honest coaching on every answer.

## What it does

1. **Setup.** Upload your resume (PDF or text) and paste the job description. The AI extracts your **candidate profile** and the **role requirements**, which you review and edit, shows how you **match**, and researches the company and role on the web for a **role briefing** with sources. Pick the interview type, difficulty, length, mode and interviewer model.
2. **Interview.** Questions stream in, tailored to you, the role and your earlier answers; about a third draw on the role briefing.
   - **Coach mode:** feedback after each answer, and you can ask the coach about it or try the question again.
   - **Mock mode:** like the real thing, with feedback only in the report.
3. **Report.** An overall score, a score and note for each question, what a strong answer would have included, strengths, and what to work on next.
4. **History.** Reopen a report, resume an interview, practise again with the same setup, or delete. Save your history with a **passkey** or a **recovery code** to open it in another browser or after clearing your browsing data.

No sign-up and no email: each browser gets an anonymous id. Everything runs on free AI tiers (Groq by default, optionally Mistral, Gemini and OpenRouter), protected by a bot check and usage budgets.

## Architecture

```
client/   React 19 + Vite + MUI, React Query, React Router
server/   Fastify API (TypeScript), Mongoose (MongoDB Atlas), OpenAI-compatible SDK for every AI provider
api/      Vercel function entry point: hands /api/* to the Fastify app
```

- **One origin.** In production Vercel serves the static client and the API under `/api` from one project; locally Vite proxies `/api` to the server on port 8080. No CORS.
- **One document per interview** (setup, turns, report) in MongoDB, with atomic conditional updates guarding against double submits.
- **Streaming** as NDJSON over POST for questions, feedback and coach replies.
- **Types shared** by importing the server's zod schemas type-only from the client.

Key paths:

| Path | What's there |
|---|---|
| `server/src/interview/` | Domain schemas, prompts, the interview service, the Mongo model |
| `server/src/ai/` | Model registry (the one file to edit when free models change) and the AI client |
| `server/src/research/` | Web search (Tavily) and role briefings |
| `server/src/usage/meter.ts` | Usage budgets and caps |
| `server/src/http/` | Candidate id, bot check, security headers, errors, NDJSON streaming |
| `client/src/pages/` | Home and history, setup wizard, interview room, report |

## Getting started

Requires **Node 22+** and **pnpm 10**. With nvm: `nvm use` (reads `.nvmrc`), then `corepack enable` so `pnpm` is the pinned version. `pnpm` refuses to run on older Node (`engine-strict`); to make 22 your default, `nvm alias default 22`.

```sh
pnpm install
cp server/.env.example server/.env   # fill in MONGODB_URI and GROQ_API_KEY at minimum
cp client/.env.example client/.env   # optional: Turnstile site key
pnpm dev                             # http://localhost:5173 (API on :8080)
```

Optional keys in `server/.env` switch features on: `MISTRAL_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` (more models), `TAVILY_API_KEY` (role briefing), `TURNSTILE_SECRET_KEY` (bot check). `server/.env.example` documents every variable, including the usage budgets. Environment files are read at startup, so restart `pnpm dev` after editing them.

| Command | Does |
|---|---|
| `pnpm dev` | Client and server with reload |
| `pnpm test` | Server tests (fake AI, in-memory MongoDB) and client tests (jsdom) |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | Across both packages |

Tests never call real AI providers. The first server test run downloads a MongoDB binary for the in-memory database.

## Deploying to Vercel

1. **Import the repository** in Vercel with the **repo root** as the root directory. `vercel.json` sets the install and build commands, the output directory, the `/api` rewrite and the security headers; Node 22 comes from `engines`.
2. **Environment variables** (Settings → Environment Variables, Production):

   | Variable | Required | Notes |
   |---|---|---|
   | `MONGODB_URI` | yes | Atlas connection string |
   | `GROQ_API_KEY` | yes | Default and parsing model |
   | `TURNSTILE_SECRET_KEY` | recommended | Bot check |
   | `VITE_TURNSTILE_SITE_KEY` | recommended | Read at **build** time; redeploy after changing it |
   | `TAVILY_API_KEY` | optional | Role briefing |
   | `MISTRAL_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | optional | More models |
   | `DAILY_AI_CALLS`, `DAILY_SEARCHES`, ... | optional | Budgets; defaults in `server/.env.example` |

3. **Before inviting users**, work through the release checklist in [docs/security.md](docs/security.md): a least-privilege Atlas user, Atlas network access, Vercel spend limits, and budgets below your providers' free quotas.

## Documentation

- [Decisions](docs/decisions.md): every product and technical decision, and why
- [Decision records](docs/adr/): the bigger, harder-to-reverse choices in more depth
- [Security](docs/security.md): abuse protection, known limits, and the release checklist
- [Glossary](GLOSSARY.md): the domain vocabulary used in code and docs
- [AGENTS.md](AGENTS.md): conventions for AI coding agents working in this repo
