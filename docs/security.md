# Security and abuse protection

The app is public and anonymous, and runs on free API quotas. The main risk is not data theft but
**someone using up the shared AI and search quotas** so the app stops working for everyone. These are
the layers that prevent that, and what to set up before releasing it.

## What protects the quotas

| Layer | What it does | Where |
|---|---|---|
| Bot check | Cloudflare Turnstile token required to **Analyse**, **Start interview** and **Practise again**. Single-use, verified server-side, fails closed. | `server/src/http/botcheck.ts`, `client/src/api/botCheck.ts` |
| Per-person daily budget | AI calls: 120 per candidate, 200 per IP. Interviews: 5 per candidate, 5 per IP. | `server/src/usage/meter.ts` |
| Burst limit | 20 AI calls per minute, per candidate and per IP. | same |
| Global daily caps | 800 AI calls and 30 uncached web searches a day across everyone, under Groq's and Tavily's free quotas. Users see "out of free capacity for today" instead of random failures. | same |
| Charged per AI call | Every AI call is counted right before it's made; re-showing a saved question costs nothing. | `server/src/interview/service.ts` |
| Hard caps per interview | At most 12 questions, 2 retries and 5 coach messages per question; answer and message length limits. | `server/src/interview/schemas.ts` |
| Shared research cache | Briefings are cached 7 days per company + role + seniority, for everyone. | `server/src/research/briefing.ts` |
| Maintenance switch | `MAINTENANCE_MODE=true` pauses new work without a deploy; interviews in progress finish. | `server/src/http/security.ts` |

All budgets are environment variables (see `server/.env.example`).

## Other protections

- **Secrets stay on the server.** AI, search and database keys are only read by the API; the browser
  only ever sees the public Turnstile site key. No secret has ever been committed (history checked).
- **Client IP can't be spoofed.** On Vercel the IP comes from `x-vercel-forwarded-for`, which Vercel
  sets itself; elsewhere client-supplied forwarding headers are ignored.
- **No CORS.** The site and API share one origin, so other websites can't call the API from a browser.
- **Security headers.** A strict Content Security Policy (own scripts plus Cloudflare's challenge only),
  HSTS, no framing, `nosniff` (`vercel.json`); the API adds `no-store` and hides the framework.
- **Input validation.** Every request body is validated (zod), ids are format-checked, PDFs are capped
  at 4 MB and 20 pages and discarded after text extraction.
- **Prompt injection.** Web pages are fenced as untrusted data, links in briefings only come from search
  results, and the AI has no tools. A candidate can only steer the AI within their own interview; the
  coach declines unrelated requests.
- **Data isolation.** Every interview is scoped to its browser's random candidate id (a 122-bit UUID).
- **Dependencies.** `pnpm audit` reports no known vulnerabilities.

## Known limits

- **Anonymous by design.** Someone determined, with many IPs and solved bot checks, can still use up
  the daily global caps. They can't exceed them, so the cost is bounded at zero, but the app would be
  unavailable for the rest of that day. If that happens, the next step is requiring sign-in.
- **Interviews are kept indefinitely**, including resume text. Candidates can delete their own.
- **The browser id is the only key** to a candidate's interviews: clearing site data loses access, and
  anyone with access to the browser can see them.

## Release checklist

1. **Turnstile:** create a widget in the Cloudflare dashboard for your production domain. Set
   `TURNSTILE_SECRET_KEY` (server) and `VITE_TURNSTILE_SITE_KEY` (client build) in Vercel.
2. **MongoDB Atlas:**
   - Create a database user with **readWrite on this database only**, and a long random password.
   - Network access: Vercel functions don't have fixed IPs, so allow `0.0.0.0/0` and rely on the
     credentials; never reuse this user elsewhere.
3. **Vercel:** set every server variable from `server/.env.example` for Production. Turn on
   **Spend Management** with a hard limit, so a traffic spike can never produce a bill.
4. **Provider keys:** use keys created only for this app, so they can be revoked without breaking
   anything else. Leave optional providers unset if you don't want them offered.
5. **Budgets:** check each provider's current free quota and set `DAILY_AI_CALLS` and `DAILY_SEARCHES`
   comfortably below them.
6. **After launch:** watch the Vercel logs and the `usage_counters` collection for unusual use. If
   needed, lower the budgets or set `MAINTENANCE_MODE=true` (both take effect on redeploy).
