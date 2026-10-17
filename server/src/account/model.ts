import mongoose, { Schema } from "mongoose";

// A candidate's saved history: the passkeys and recovery code that restore their candidate id
// in another browser. Candidates who never save have no document here.
const passkeySchema = new Schema(
  {
    credentialId: { type: String, required: true },
    publicKey: { type: Buffer, required: true },
    counter: { type: Number, required: true },
    transports: { type: [String], default: [] },
    createdAt: { type: Date, required: true },
  },
  { _id: false }
);

const candidateSchema = new Schema(
  {
    _id: { type: String, required: true },
    passkeys: { type: [passkeySchema], default: [] },
    /** SHA-256 of the current recovery code; the code itself is shown once and never stored. */
    recoveryCodeHash: { type: String, default: null },
  },
  { timestamps: true, collection: "candidates" }
);
candidateSchema.index({ "passkeys.credentialId": 1 }, { unique: true, sparse: true });
candidateSchema.index({ recoveryCodeHash: 1 }, { unique: true, partialFilterExpression: { recoveryCodeHash: { $type: "string" } } });

export type PasskeyDoc = {
  credentialId: string;
  publicKey: Buffer;
  counter: number;
  transports: string[];
  createdAt: Date;
};

export type CandidateDoc = {
  _id: string;
  passkeys: PasskeyDoc[];
  recoveryCodeHash: string | null;
};

export const CandidateModel = mongoose.model("Candidate", candidateSchema);

export const CHALLENGE_TTL_MS = 5 * 60_000;

/** A WebAuthn challenge awaiting its response. Each is used once; Mongo removes expired ones. */
const challengeSchema = new Schema(
  {
    challenge: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ["register", "sign-in"], required: true },
    /** The candidate adding a passkey (registration only). */
    candidateId: { type: String, default: null },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { collection: "webauthn_challenges" }
);

export type ChallengePurpose = "register" | "sign-in";

export const ChallengeModel = mongoose.model("WebAuthnChallenge", challengeSchema);
