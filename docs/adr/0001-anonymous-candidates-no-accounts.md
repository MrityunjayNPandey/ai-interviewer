# Anonymous candidates, no accounts

Candidates never sign in. The browser generates a random UUID on first visit, keeps it in `localStorage`, and sends it as `X-Candidate-Id`; every interview is scoped to it. We chose this over email (the original design, which let anyone read another person's interviews by typing their address) and over Google sign-in or magic links, because a practice tool should have zero friction and the UUID is unguessable.

## Consequences

- Clearing site data, or switching browser or device, loses access to past interviews.
- The id is a bearer token: anyone with access to the browser can see its interviews.
- Abuse can't be tied to a person, so quotas are protected by a bot check and usage budgets instead ([ADR 0007](0007-usage-budgets-and-bot-check-instead-of-sign-in.md)). Requiring sign-in is the next step if those prove insufficient.
