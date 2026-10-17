# The client imports its API types from the server's schemas

The client has no API type definitions of its own: `client/src/api/types.ts` re-exports types from `server/src/interview/schemas.ts` with type-only imports, so nothing from the server is bundled. This keeps the two sides in lockstep with no shared package or code generation. A separate workspace package was rejected because Vercel's Node builder would have to transpile TypeScript from a linked package, an extra moving part for no benefit at this size.

## Consequences

- `schemas.ts` must stay free of server-only imports (only `zod`), because the client's TypeScript build compiles it.
- A few constants (limits such as `MAX_RETRIES`) are mirrored in the client by hand; keep them in sync.
