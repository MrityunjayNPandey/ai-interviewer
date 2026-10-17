# Free models from several providers, offered only when configured

The interviewer can be any of several free models across Groq, Mistral, Google Gemini and OpenRouter, all called through the OpenAI-compatible SDK. The list lives in one file (`server/src/ai/models.ts`) because free line-ups change every few months, and a model is offered only when its provider's API key is set. Groq `gpt-oss-120b` is the default because its free tier is the most generous and it doesn't train on inputs; providers whose free tiers may train on inputs show a notice when picked.

## Consequences

- The candidate picks the model at setup and it stays fixed for that interview, so the report is consistent; it's recorded on each turn and on the report.
- Parsing (profile, requirements, match, role briefing) always uses one fixed model (`PARSE_MODEL`, default Groq `gpt-oss-120b`), because it must return reliable JSON before the candidate has picked anything.
- When a model fails, the candidate sees a clear error with Try again and a model switcher; the app never switches silently.
- JSON output uses `json_object` mode plus zod validation and one repair round, not provider-specific strict schemas, so it works the same across providers.
- OpenRouter's free models share a small daily cap across the whole app; they're included at the product owner's request and rely on the switch-model fallback.
