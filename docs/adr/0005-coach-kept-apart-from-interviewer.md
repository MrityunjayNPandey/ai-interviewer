# The coach is kept apart from the interviewer and from scoring

Feedback and the coach chat come from the "coach", a separate role played by the same model. The interviewer's prompts contain only questions and answers, never feedback or coach chat, and the report scores only answers. Otherwise coaching hints would leak into scoring, and the interviewer would start reacting to the coaching instead of to the candidate.

## Consequences

- In coach mode a candidate can ask the coach up to 5 questions per interview question and retry a question up to 2 times. Retried answers are answers, so they do count: the report scores the best attempt.
- Mock mode allows neither, and hides feedback until the report, to feel like a real interview.
