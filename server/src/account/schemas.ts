import { z } from "zod";

/** Whether this browser's history is saved, and how. */
export type AccountStatus = { passkeys: number; hasRecoveryCode: boolean };

/** The browser's WebAuthn response, checked in full by the verifier; here only its shape and id. */
export const credentialSchema = z.object({ id: z.string().min(1).max(1024), response: z.object({}).passthrough() }).passthrough();

export const recoverSchema = z.object({ code: z.string().min(1).max(64) });
