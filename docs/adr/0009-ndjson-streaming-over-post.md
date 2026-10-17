# Stream AI output as NDJSON over POST

Questions, feedback and coach replies stream to the browser as newline-delimited JSON events (`delta`, then `done` with the saved interview, or `error`), read with `fetch` and a stream reader. We chose this over Server-Sent Events because the streaming calls are POSTs with a body and custom headers, which `EventSource` doesn't support, and over WebSockets because they don't fit serverless functions.

## Consequences

- The stream starts lazily on the first event, so failures before any output still return an ordinary JSON error with the right HTTP status.
- If the candidate disconnects, generation carries on and is saved, so a refresh picks up the finished question.
