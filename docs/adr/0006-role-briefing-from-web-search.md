# Role briefing from web search, treated as untrusted

On the review step the app searches the web for the company and role (Tavily), and the parse model summarises the results into a role briefing whose every point cites a numbered source. About a third of the interview questions draw on it. We chose Tavily plus our own model over Gemini's built-in Google Search grounding, which requires showing Google's Search Suggestions widget, may use free-tier inputs, and isn't available to EEA/UK/Swiss users; Groq's own web-search models were shut down in September 2026.

## Consequences

- Web pages are untrusted input: they're fenced as data in the prompt with an instruction to ignore anything inside them, points citing unknown sources are dropped, links come only from the search results (never from the model), and the interviewer sees the points but not the links.
- Briefings are cached for 7 days per company + role + seniority and shared across all candidates, since they contain nothing personal; only cache misses use search quota.
- Without a company, a general briefing for the role is produced. Without `TAVILY_API_KEY`, the feature is off and interviews work as before.
