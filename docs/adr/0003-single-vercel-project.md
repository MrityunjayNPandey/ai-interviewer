# Host on one Vercel project, API under /api

The site and the API deploy as one Vercel project: the client builds to static files and `api/index.ts` serves the Express app for every `/api/*` request. Locally, Vite proxies `/api` to the server. Sharing one origin removes CORS entirely (other websites' pages can't call the API), removes the need for an API URL in the client, and keeps one deployment.

## Considered options

- **Cloudflare (Workers; Pages is now Workers):** Express runs there, but MongoDB isn't supported by Hyperdrive (Postgres/MySQL only), so every request opens a new connection (~300 ms); Mongoose 9 would be required; and PDF parsing likely exceeds the free plan's 10 ms CPU limit. Worth revisiting if we move to Postgres or pay for Workers ($5/month).
- **Render:** the most natural fit for a long-running Node server, but the free plan sleeps after 15 minutes idle and takes about a minute to wake, and Render advises against it for production. Worth revisiting on its paid plan (about $7/month).
