# One MongoDB document per interview

Each interview is a single document in `practice_interviews` holding its setup (resume text, candidate profile, role requirements, match, role briefing, settings), its turns (question, attempts, feedback, coach chat) and its report. It replaces the original flat message log (`interviewcontexts`), which mixed resume text, prompts and answers in one stream of chat messages. An interview is always read and written as a whole, so embedding fits, and the old data was discarded rather than migrated.

## Consequences

- Concurrency is handled with atomic, conditional updates on the document instead of transactions: a question "slot" is reserved with `$push` only if `turns` still has the expected `$size`, and answers and coach messages are written only if the slot is still empty. This is what stops double clicks, refreshes and retries from creating duplicate turns.
- Guards on array element paths use `$type` (`"null"` / `"string"`) rather than `null` or `$ne: null`: on a path like `turns.3.answer`, Mongo also reads `3` as a field on every element, so plain null comparisons match or fail on those phantom values. Don't "simplify" these.
- Fields added later (`previousAttempts`, `coachMessages`, `setup.briefing`) are optional on read, because older documents don't have them.
