# AI Interviewer Platform

## Overview

A system that conducts AI-powered interviews by analyzing resumes and job descriptions, then generating relevant questions and feedback.

## Key Features

- Resume and job description analysis
- Context-aware question generation (adaptability based on previous answers)
- Interview session management
- Automated feedback generation
- Transcript storage in database

## Technical Architecture

- **Client**: React/Vite frontend
- **Server**: Node.js backend with MongoDB
- **AI Integration**: GPT-based question generation

## Documentation

- [Decisions](docs/decisions.md): every product and technical decision, and why
- [Decision records](docs/adr/): the bigger, harder-to-reverse choices in more depth
- [Security](docs/security.md): abuse protection, known limits, and the release checklist
- [Glossary](GLOSSARY.md): the domain vocabulary used in code and docs

## Getting Started

Requires Node 22+ (`nvm use`) and pnpm (`corepack enable`).

```
pnpm install
cp server/.env.example server/.env   # then fill in GROQ_API_KEY and MONGODB_URI
pnpm dev                             # client on http://localhost:5173, API proxied to :8080
```

`pnpm typecheck`, `pnpm lint` and `pnpm build` run across both packages.

## Deployment

One Vercel project from the repo root: the client builds to static files and `api/index.ts` serves the Express API under `/api/*` (see `vercel.json`). Set `MONGODB_URI` and at least `GROQ_API_KEY` in the Vercel project's environment variables (see `server/.env.example` for the optional providers).
