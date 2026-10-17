# Passkeys and recovery codes to keep history, with the candidate id in a cookie

Candidates stay anonymous ([ADR 0001](0001-anonymous-candidates-no-accounts.md)), but a history kept in one browser was lost when site data was cleared and couldn't be opened on another device. Candidates can now **save** their history with a **passkey** (WebAuthn; synced across devices by Apple, Google and password managers) or a one-time **recovery code**, and **restore** it in another browser. No email, phone or password is involved.

The server now issues the candidate id as an `HttpOnly; SameSite=Strict` cookie scoped to `/api`, so page scripts can no longer read it. A browser from before the cookie sends its `localStorage` id once as `X-Candidate-Id`; the server adopts it (only when there is no cookie), so existing histories carry over.

We considered and rejected:
- **Cloudflare Turnstile as an identifier.** Its tokens are single-use and carry no stable visitor id, by design.
- **Browser fingerprinting.** Unstable across updates, collides between identical devices (one candidate could see another's resume), and raises consent issues.
- **Email, phone or Google sign-in.** They would make abuse costlier, but the product wants no personal details.

## Consequences

- **Restoring merges.** A browser's unsaved interviews move into the restored history. A browser whose own history is saved keeps its interviews, so they can't be pulled away. On a shared computer, restoring also pulls in a previous person's unsaved interviews.
- **Signing out.** Allowed only once the history is saved; it clears the cookie, and the browser starts fresh.
- **Recovery codes.** 100 random bits, stored as a SHA-256 hash, shown once; a new code replaces the old one. Restoring with one needs the bot check.
- **Passkeys belong to the site's hostname.** A passkey made on a Vercel preview URL doesn't work on production. The server reads the hostname from the `Host` header, so the Vite dev proxy keeps the browser's `Host`.
- **Abuse protection is unchanged** ([ADR 0007](0007-usage-budgets-and-bot-check-instead-of-sign-in.md)). Identities are still free to create, so per-IP and global budgets remain the real limit.
