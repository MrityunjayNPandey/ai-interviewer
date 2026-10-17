import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { createHash, randomBytes } from "node:crypto";
import { conflict, HttpError } from "../http/errors";
import { InterviewModel } from "../interview/model";
import type { AccountStatus } from "./schemas";
import { CandidateModel, CHALLENGE_TTL_MS, ChallengeModel, type CandidateDoc, type ChallengePurpose } from "./model";

/** Who the passkeys belong to: the site's hostname, and the exact origin the browser reports. */
export type RelyingParty = { id: string; origin: string };

const RP_NAME = "AI Interviewer";

const passkeyFailed = () =>
  new HttpError(400, "INVALID_REQUEST", "That passkey couldn't be verified. Please try again.");

// Recovery codes: 20 characters from an alphabet without look-alikes (no 0/O, 1/I/L), 100 bits.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 20;

function newRecoveryCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  // 256 isn't a multiple of 31, so this is very slightly biased; at 100 bits that doesn't matter.
  const chars = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  return chars.match(/.{4}/g)!.join("-");
}

/** Accepts the code however it was typed: any case, with or without dashes and spaces. */
const hashRecoveryCode = (code: string) =>
  createHash("sha256").update(code.toUpperCase().replace(/[^0-9A-Z]/g, "")).digest("hex");

const isSaved = (doc: CandidateDoc | null) => !!doc && (doc.passkeys.length > 0 || doc.recoveryCodeHash !== null);

export function createAccountService({ now = () => new Date() }: { now?: () => Date } = {}) {
  const find = (candidateId: string) => CandidateModel.findById(candidateId).lean<CandidateDoc>();

  async function storeChallenge(challenge: string, purpose: ChallengePurpose, candidateId: string | null = null) {
    await ChallengeModel.create({ challenge, purpose, candidateId, expiresAt: new Date(now().getTime() + CHALLENGE_TTL_MS) });
  }

  /** Uses up a challenge we issued for this purpose (and candidate); false if unknown, used or expired. */
  async function consumeChallenge(challenge: string, purpose: ChallengePurpose, candidateId: string | null = null) {
    const found = await ChallengeModel.findOneAndDelete({ challenge, purpose, candidateId, expiresAt: { $gt: now() } });
    return found !== null;
  }

  /**
   * Restoring into a browser: its unsaved interviews move into the restored history, so nothing done
   * before restoring is lost. A browser whose history is itself saved keeps its interviews.
   */
  async function adopt(fromId: string, toId: string) {
    if (fromId === toId || isSaved(await find(fromId))) return;
    await InterviewModel.updateMany({ candidateId: fromId }, { $set: { candidateId: toId } });
  }

  async function status(candidateId: string): Promise<AccountStatus> {
    const doc = await find(candidateId);
    return { passkeys: doc?.passkeys.length ?? 0, hasRecoveryCode: !!doc?.recoveryCodeHash };
  }

  return {
    status,

    async passkeyRegistrationOptions(candidateId: string, rp: RelyingParty) {
      const doc = await find(candidateId);
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rp.id,
        userName: "AI Interviewer candidate",
        userDisplayName: "AI Interviewer candidate",
        userID: new TextEncoder().encode(candidateId),
        attestationType: "none",
        // Discoverable, so restoring needs no username: the passkey itself says whose history it is.
        authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
        excludeCredentials: (doc?.passkeys ?? []).map((passkey) => ({ id: passkey.credentialId, transports: passkey.transports })),
      });
      await storeChallenge(options.challenge, "register", candidateId);
      return options;
    },

    async registerPasskey(candidateId: string, response: RegistrationResponseJSON, rp: RelyingParty) {
      const result = await verifyRegistrationResponse({
        response,
        expectedChallenge: (challenge) => consumeChallenge(challenge, "register", candidateId),
        expectedOrigin: rp.origin,
        expectedRPID: rp.id,
        requireUserVerification: false,
      }).catch(() => null);
      if (!result?.verified) throw passkeyFailed();

      const { credential } = result.registrationInfo;
      await CandidateModel.updateOne(
        { _id: candidateId },
        {
          $push: {
            passkeys: {
              credentialId: credential.id,
              publicKey: Buffer.from(credential.publicKey),
              counter: credential.counter,
              transports: credential.transports ?? [],
              createdAt: now(),
            },
          },
        },
        { upsert: true }
      );
      return status(candidateId);
    },

    async signInOptions(rp: RelyingParty) {
      const options = await generateAuthenticationOptions({ rpID: rp.id, userVerification: "preferred" });
      await storeChallenge(options.challenge, "sign-in");
      return options;
    },

    /** Verifies a passkey and returns the candidate id it restores. */
    async signIn(currentId: string, response: AuthenticationResponseJSON, rp: RelyingParty): Promise<string> {
      const doc = await CandidateModel.findOne({ "passkeys.credentialId": response.id }).lean<CandidateDoc>();
      const passkey = doc?.passkeys.find((candidate) => candidate.credentialId === response.id);
      if (!doc || !passkey) {
        throw new HttpError(404, "NOT_FOUND", "That passkey isn't linked to any saved history.");
      }

      const result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: (challenge) => consumeChallenge(challenge, "sign-in"),
        expectedOrigin: rp.origin,
        expectedRPID: rp.id,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports,
        },
        requireUserVerification: false,
      }).catch(() => null);
      if (!result?.verified) throw passkeyFailed();

      await CandidateModel.updateOne(
        { _id: doc._id, "passkeys.credentialId": passkey.credentialId },
        { $set: { "passkeys.$.counter": result.authenticationInfo.newCounter } }
      );
      await adopt(currentId, doc._id);
      return doc._id;
    },

    /** Creates (or replaces) the recovery code; the plain code is returned only this once. */
    async createRecoveryCode(candidateId: string): Promise<string> {
      const code = newRecoveryCode();
      await CandidateModel.updateOne({ _id: candidateId }, { $set: { recoveryCodeHash: hashRecoveryCode(code) } }, { upsert: true });
      return code;
    },

    /** Returns the candidate id the code restores. */
    async recover(currentId: string, code: string): Promise<string> {
      const doc = await CandidateModel.findOne({ recoveryCodeHash: hashRecoveryCode(code) }).lean<CandidateDoc>();
      if (!doc) throw new HttpError(404, "NOT_FOUND", "That recovery code doesn't match any saved history. Check it and try again.");
      await adopt(currentId, doc._id);
      return doc._id;
    },

    /** Leaving a browser is only allowed once its history is saved; otherwise it would be lost. */
    async assertSaved(candidateId: string) {
      if (!isSaved(await find(candidateId))) {
        throw conflict("Save your history with a passkey or recovery code first, or it will be lost.");
      }
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
