import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { credentialSchema, recoverSchema } from "../account/schemas";
import type { AccountService, RelyingParty } from "../account/service";
import { requireHuman, type VerifyHuman } from "../http/botcheck";
import { candidateId, clearCandidateCookie, header, setCandidateCookie } from "../http/candidate";
import { HttpError } from "../http/errors";

export type AccountRoutesOptions = {
  account: AccountService;
  verifyHuman: VerifyHuman | null;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Passkeys belong to the site's hostname; only local development may use plain http. */
function relyingParty(request: FastifyRequest): RelyingParty {
  const host = header(request, "host");
  if (!host) throw new HttpError(400, "INVALID_REQUEST", "Missing Host header");
  const hostname = new URL(`http://${host}`).hostname;
  const protocol = LOCAL_HOSTS.has(hostname) ? "http" : "https";
  return { id: hostname, origin: `${protocol}://${host}` };
}

export const accountRoutes: FastifyPluginAsync<AccountRoutesOptions> = async (app, { account, verifyHuman }) => {
  app.get("/", async (req) => account.status(candidateId(req)));

  app.post("/passkeys/options", async (req) => account.passkeyRegistrationOptions(candidateId(req), relyingParty(req)));

  app.post("/passkeys", async (req) => {
    const response = credentialSchema.parse(req.body) as unknown as RegistrationResponseJSON;
    return account.registerPasskey(candidateId(req), response, relyingParty(req));
  });

  app.post("/sign-in/options", async (req) => account.signInOptions(relyingParty(req)));

  app.post("/sign-in", async (req, reply) => {
    const response = credentialSchema.parse(req.body) as unknown as AuthenticationResponseJSON;
    const restored = await account.signIn(candidateId(req), response, relyingParty(req));
    setCandidateCookie(reply, restored);
    return account.status(restored);
  });

  app.post("/recovery-code", async (req) => ({ code: await account.createRecoveryCode(candidateId(req)) }));

  // Codes are unguessable, but the bot check keeps anyone from even trying at scale.
  app.post("/recover", { preHandler: requireHuman(verifyHuman) }, async (req, reply) => {
    const { code } = recoverSchema.parse(req.body);
    const restored = await account.recover(candidateId(req), code);
    setCandidateCookie(reply, restored);
    return account.status(restored);
  });

  app.post("/sign-out", async (req, reply) => {
    await account.assertSaved(candidateId(req));
    clearCandidateCookie(reply);
    return reply.code(204).send();
  });
};
