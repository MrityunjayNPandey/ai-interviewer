# Usage budgets and a bot check instead of sign-in

The app runs on free provider quotas shared by every user, so the main risk is someone using them up. Rather than requiring sign-in ([ADR 0001](0001-anonymous-candidates-no-accounts.md)), we protect them in layers: a Cloudflare Turnstile token to start new work (Analyse, Start interview, Practise again); AI tokens counted per candidate and per IP each day, and AI calls per minute; and global daily caps on AI tokens and web searches set below the providers' free quotas. Each AI call checks the budget right before it's made and records the tokens the provider reports once it finishes, so the last call of the day can overshoot by one call's worth.

## Consequences

- Total usage can never exceed the global caps, so abuse can't cost money or exhaust quotas. The worst case is that the app shows "out of free capacity" until the next day.
- Someone with many IPs who keeps solving bot checks can still trigger that worst case. If that happens, requiring sign-in is the next step.
- All budgets are environment variables, and `MAINTENANCE_MODE` pauses new work without a code change. Details and the release checklist are in [docs/security.md](../security.md).
