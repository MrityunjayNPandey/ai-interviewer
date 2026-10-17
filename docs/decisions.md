# Decisions

Every product and technical decision made while refining the app (October 2026), and why. The bigger,
harder-to-reverse ones also have a decision record in [`adr/`](adr/). Terms such as *candidate*, *turn*,
*attempt* and *role briefing* are defined in [`GLOSSARY.md`](../GLOSSARY.md).

## Product

| Decision | Choice | Why |
|---|---|---|
| Who it's for | A **candidate practising alone**; no employer or recruiter. | It began as a hiring take-home; a practice tool is the useful product. |
| End result | A structured **coaching report** (overall score, a score and note per question, strengths, improvements, what a strong answer would include) instead of a hire/no-hire verdict. | A verdict means nothing to someone practising; the report is what they act on. |
| Interview length | Chosen at setup, **3–12 questions, default 6**; the candidate can end early, and the report covers only the answered questions. | Gives a sense of progress and a clear end. |
| Modes | **Coach** (default): feedback after each answer. **Mock**: feedback only in the report. | Coach is for learning, Mock for realism. |
| Interview type and difficulty | **Behavioral / Technical / Mixed** (default Mixed) and **Junior / Mid / Senior** (default Mid). | Tailors the questions without extra effort from the candidate. |
| Resume input | **PDF upload or pasted text.** The PDF is discarded after its text is extracted. | Most resumes are PDFs; keeping only text means no file storage and less personal data. |
| Parsed information | The AI extracts an editable **candidate profile** and **role requirements**, which the candidate reviews and corrects before starting. | Shows the tailoring is real, and fixes parsing mistakes before they shape the interview. |
| Match summary | Strengths and gaps between profile and requirements, shown on the review step and refreshable after edits. | Helps the candidate know what to prepare for. |
| History | This browser's interviews are listed on the home page: open, resume, **practise again** with the same setup, or delete. | Practising again is what brings people back. |
| Resuming | A refresh or a return visit lands exactly where the candidate left off, including a half-typed answer. | Interviews take a while; losing progress is the worst failure. |
| Voice answers | **Deferred.** Typed answers for now; voice later via the browser's speech recognition. | Ship the core first. |
| Data retention | **Kept indefinitely**; candidates can delete their own interviews. | Product owner's choice. Revisit if privacy rules apply. |

## Interview flow and coaching

| Decision | Choice | Why |
|---|---|---|
| Streaming | Questions, feedback and coach replies **stream word by word**; the report appears in one go. | Feels responsive; the report is structured data. |
| Coach chat | In Coach mode, the candidate can **ask the coach about the feedback**: up to **5 messages per question**. Never seen by the interviewer, never scored. | Turns feedback into learning without leaking hints into scoring ([ADR 0005](adr/0005-coach-kept-apart-from-interviewer.md)). |
| Retries | In Coach mode, a question can be **answered again up to 2 times**; new feedback says whether it improved, and the report scores the **best attempt**. Ending while a retry is pending keeps the previous attempt. | Practising an answer until it's good is the point of the tool. |
| Mock mode | One shot per question: no coach chat, no retries. | It should feel like the real thing. |
| Model failures | A clear error with **Try again**, plus **switch to another model** when the model is the problem. The switch is recorded on the turn. | Free tiers rate-limit; silent switching would make the model choice meaningless. |

## Models and AI

| Decision | Choice | Why |
|---|---|---|
| Providers | **Groq, Mistral, Google Gemini and OpenRouter** free models, offered only when the provider's key is set. | Real choice, and a fallback when one provider's free quota runs out ([ADR 0004](adr/0004-free-models-from-several-providers.md)). |
| Default model | **Groq `gpt-oss-120b`.** | Best quality on the most generous free tier, and it doesn't train on inputs. |
| Model list | Groq `gpt-oss-120b`, `qwen3.8-27b`, `gpt-oss-20b`; Mistral Small; Gemini 3.5 Flash-Lite; OpenRouter Nemotron 3 Super and Gemma 4 31B. Kept in one config file. | Checked against providers' docs in October 2026; Llama 3.x on Groq and GitHub Models had been retired. |
| Training notice | Models whose provider's free tier **may train on inputs** (Mistral, Gemini, OpenRouter) show a notice when picked. | Resumes are personal data; candidates should know. |
| When the model is chosen | At setup, **fixed for the interview**, recorded on each turn and on the report. | Keeps the report consistent. |
| Parsing model | Always the fixed default (`PARSE_MODEL`), regardless of the candidate's choice. | Parsing happens before the choice and needs reliable JSON. |
| Prompts | All in one module, `server/src/interview/prompts.ts`. | Easy to tune in one place. |

## Role briefing (web research)

| Decision | Choice | Why |
|---|---|---|
| What it is | A briefing on the company and role from the web: about the company, interview process, commonly asked questions, topics to prepare, **every point linked to its source**; points can be removed. | Real reported questions make practice realistic ([ADR 0006](adr/0006-role-briefing-from-web-search.md)). |
| When it runs | **Automatically once** when the review step opens; **Update for your edits** after changing title, company or seniority. | Useful without an extra step, without searching on every keystroke. |
| How it's used | About **a third of the questions** draw on it, adapted to the candidate. | Realism without turning the interview into a quiz of web results. |
| No company | A **general briefing for the role**, labelled as such. | Still useful. |
| Search provider | **Tavily**, summarised by our parse model. | Free without a card and returns clean source links. Gemini grounding has display rules, may train on inputs and excludes EEA/UK users; Groq's search models were shut down. |
| Trust | Labelled "from public web sources, may be inaccurate"; web content treated as untrusted; links only from search results. | Forum content is hit-and-miss, and web pages can smuggle in instructions. |
| Seniority in searches | With a company, the level is added to the question and process searches (e.g. "Google Software Engineer L3 interview questions"), not the culture search. | Levels like L3 vs L5 change what's asked; culture doesn't vary by level. |
| Caching | **7 days per company + role + seniority, shared** across candidates. | Briefings hold nothing personal; saves search quota. |

## Security and abuse

| Decision | Choice | Why |
|---|---|---|
| Identity | **Anonymous browser id, no accounts** (kept after the security review), issued as an HttpOnly cookie. | Zero friction; abuse is handled by the layers below ([ADR 0001](adr/0001-anonymous-candidates-no-accounts.md)). |
| Keeping history | **Passkey or recovery code**, no email. Restoring moves the browser's unsaved interviews in; signing out needs a saved history. | Lets history follow the candidate without personal details ([ADR 0010](adr/0010-passkeys-and-recovery-codes-to-keep-history.md)). |
| Bot check | **Cloudflare Turnstile** on Analyse, Start interview and Practise again. | The most effective single protection; invisible to most people. |
| Budgets | Per AI call: **120/day per candidate, 200/day per IP, 20/minute**; **5 interviews/day** per candidate and per IP; global **800 AI calls and 30 web searches a day**. All configurable. | What costs money is AI calls; global caps keep the app under free quotas ([ADR 0007](adr/0007-usage-budgets-and-bot-check-instead-of-sign-in.md)). |
| Other hardening | No CORS (one origin), strict CSP and security headers, unspoofable client IP on Vercel, input validation, PDF size and page caps, a maintenance switch. | See [`security.md`](security.md). |

## Platform

| Decision | Choice | Why |
|---|---|---|
| Hosting | **One Vercel project**, API under `/api`. Cloudflare and Render were considered and rejected for now. | Free, already working, reuses database connections, no cold starts ([ADR 0003](adr/0003-single-vercel-project.md)). |
| Server framework | **Fastify** (replaced Express). Plugins scope hooks and parsers to where they apply: the PDF parser only on setup routes, the database connection only on routes that need it. | Product owner's choice. Fastify is faster and its encapsulated plugins fit the API's shape; request validation stays with zod, so the change was confined to the HTTP layer. |
| Database | **MongoDB Atlas (free tier)**, one document per interview; old data discarded. | Mongoose was already in use, and the document shape fits ([ADR 0002](adr/0002-one-document-per-interview.md)). |
| Repository | **pnpm workspace** (`client`, `server`) on **Node 22+**, with a committed lockfile. | One install and consistent versions everywhere. Node 20 reached end of life in April 2026. |
| UI | Kept **MUI**, with a themed design, light/dark mode and a mobile-friendly layout. | Already in use; polish beats a library switch. |
| Shared types | The client imports API types from the server's schemas. | One source of truth ([ADR 0008](adr/0008-client-types-come-from-server-schemas.md)). |
| Streaming format | **NDJSON over POST.** | Works with request bodies and serverless functions ([ADR 0009](adr/0009-ndjson-streaming-over-post.md)). |
| Tests | **Vitest** with a scripted fake AI and an in-memory MongoDB; no real AI calls in tests. | Fast, free and deterministic. |
| Workflow | Work on the `refine` branch in logical commits, **not pushed** until the product owner says so. | Reviewable history; nothing published by surprise. |

## Still open

- **First deploy to Vercel.** Everything is ready (see the README's deployment section and the release checklist in [`security.md`](security.md)); it needs the product owner's Vercel and Cloudflare accounts.
