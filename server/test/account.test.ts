import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCandidate, setupFixture, testApp, useDatabase, type TestApp } from "./helpers";

// Real passkeys need a real authenticator, so verification is faked: a response "signs" whatever
// challenge it carries, and the fake asks our expectedChallenge callback whether that challenge is valid.
const webauthn = vi.hoisted(() => ({ issued: 0, lastVerify: null as Record<string, unknown> | null }));

vi.mock("@simplewebauthn/server", () => {
  type Options = { response: { id: string; response: { challenge: string } }; expectedChallenge: (c: string) => Promise<boolean> };
  const check = async (options: Options) => {
    webauthn.lastVerify = options as unknown as Record<string, unknown>;
    if (!(await options.expectedChallenge(options.response.response.challenge))) throw new Error("Unexpected challenge");
  };
  return {
    generateRegistrationOptions: async () => ({ challenge: `challenge-${++webauthn.issued}` }),
    generateAuthenticationOptions: async () => ({ challenge: `challenge-${++webauthn.issued}` }),
    verifyRegistrationResponse: async (options: Options) => {
      await check(options);
      const id = options.response.id;
      return { verified: true, registrationInfo: { credential: { id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] } } };
    },
    verifyAuthenticationResponse: async (options: Options & { credential: { publicKey: Uint8Array } }) => {
      await check(options);
      // The key saved at registration must come back intact to verify the signature.
      if (Array.from(options.credential.publicKey).join() !== "1,2,3") throw new Error("Public key didn't round-trip");
      return { verified: true, authenticationInfo: { newCounter: 1 } };
    },
  };
});

useDatabase();

beforeEach(() => {
  webauthn.lastVerify = null;
});

const credential = (id: string, challenge: string) => ({ id, rawId: id, type: "public-key", response: { challenge } });

/** The candidate id a response's Set-Cookie header assigns, if any. */
function cookieId(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  return cookies.map((cookie) => /^candidate=([^;]*)/.exec(cookie)?.[1]).find((value) => value !== undefined);
}

async function startInterview(candidate: ReturnType<typeof asCandidate>) {
  return (await candidate.post("/api/interviews", setupFixture()).expect(201)).body.interview.id as string;
}

async function savePasskey(candidate: ReturnType<typeof asCandidate>, status: number, credentialId = "passkey-1") {
  const { challenge } = (await candidate.post("/api/account/passkeys/options").expect(200)).body;
  return candidate.post("/api/account/passkeys", credential(credentialId, challenge)).expect(status);
}

async function signInWithPasskey(browser: ReturnType<typeof asCandidate>, status: number, credentialId = "passkey-1") {
  const { challenge } = (await browser.post("/api/account/sign-in/options").expect(200)).body;
  return browser.post("/api/account/sign-in", credential(credentialId, challenge)).expect(status);
}

const interviewIds = async (candidate: ReturnType<typeof asCandidate>) =>
  ((await candidate.get("/api/interviews").expect(200)).body.interviews as { id: string }[]).map((i) => i.id).sort();

describe("the candidate cookie", () => {
  let app: TestApp;
  beforeEach(() => {
    app = testApp().app;
  });

  it("is issued to a new browser, HttpOnly and scoped to the API", async () => {
    const res = await request(app).get("/api/interviews").expect(200);
    const cookie = ([] as string[]).concat(res.headers["set-cookie"] ?? [])[0]!;
    expect(cookieId(res)).toMatch(/^[0-9a-f-]{36}$/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api/);
  });

  it("is not reissued once the browser has one", async () => {
    const res = await asCandidate(app).get("/api/interviews").expect(200);
    expect(cookieId(res)).toBeUndefined();
  });

  it("adopts the id an older browser kept in localStorage, so its history carries over", async () => {
    const legacy = asCandidate(app);
    const id = await startInterview(legacy);
    const res = await request(app).get("/api/interviews").set("X-Candidate-Id", legacy.id.toUpperCase()).expect(200);
    expect(cookieId(res)).toBe(legacy.id);
    expect(res.body.interviews.map((i: { id: string }) => i.id)).toEqual([id]);
  });

  it("wins over the legacy header", async () => {
    const owner = asCandidate(app);
    await startInterview(owner);
    const res = await asCandidate(app).get("/api/interviews").set("X-Candidate-Id", owner.id).expect(200);
    expect(res.body.interviews).toEqual([]);
  });

  it("is replaced when it isn't a valid id", async () => {
    const res = await request(app).get("/api/interviews").set("Cookie", "candidate=not-a-uuid").expect(200);
    expect(cookieId(res)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reaches a new browser even on a streamed reply", async () => {
    const owner = asCandidate(app);
    const id = await startInterview(owner);
    const res = await request(app).post(`/api/interviews/${id}/questions`).set("X-Candidate-Id", owner.id).expect(200);
    expect(cookieId(res)).toBe(owner.id);
  });
});

describe("saving and restoring with a recovery code", () => {
  it("restores the history in another browser", async () => {
    const { app } = testApp();
    const laptop = asCandidate(app);
    const id = await startInterview(laptop);
    const { code } = (await laptop.post("/api/account/recovery-code").expect(200)).body;
    expect(code).toMatch(/^([2-9A-Z]{4}-){4}[2-9A-Z]{4}$/);
    expect((await laptop.get("/api/account").expect(200)).body).toEqual({ passkeys: 0, hasRecoveryCode: true });

    const phone = asCandidate(app);
    const res = await phone.post("/api/account/recover", { code: code.toLowerCase().replaceAll("-", " ") }).expect(200);
    expect(cookieId(res)).toBe(laptop.id);
    expect(await interviewIds(asCandidate(app, laptop.id))).toEqual([id]);
  });

  it("moves the new browser's unsaved interviews into the restored history", async () => {
    const { app } = testApp();
    const laptop = asCandidate(app);
    const saved = await startInterview(laptop);
    const { code } = (await laptop.post("/api/account/recovery-code")).body;

    const phone = asCandidate(app);
    const unsaved = await startInterview(phone);
    await phone.post("/api/account/recover", { code }).expect(200);

    expect(await interviewIds(laptop)).toEqual([saved, unsaved].sort());
    expect(await interviewIds(phone)).toEqual([]);
  });

  it("leaves a saved browser's interviews where they are", async () => {
    const { app } = testApp();
    const laptop = asCandidate(app);
    const { code } = (await laptop.post("/api/account/recovery-code")).body;

    const other = asCandidate(app);
    const theirs = await startInterview(other);
    await other.post("/api/account/recovery-code").expect(200);
    await other.post("/api/account/recover", { code }).expect(200);

    expect(await interviewIds(laptop)).toEqual([]);
    expect(await interviewIds(other)).toEqual([theirs]);
  });

  it("rejects an unknown code, and an old code once replaced", async () => {
    const { app } = testApp();
    const laptop = asCandidate(app);
    const { code: first } = (await laptop.post("/api/account/recovery-code")).body;
    const { code: second } = (await laptop.post("/api/account/recovery-code")).body;

    const phone = asCandidate(app);
    await phone.post("/api/account/recover", { code: first }).expect(404);
    await phone.post("/api/account/recover", { code: "AAAA-BBBB-CCCC-DDDD-EEEE" }).expect(404);
    await phone.post("/api/account/recover", { code: second }).expect(200);
  });

  it("requires the bot check", async () => {
    const { app } = testApp({ verifyHuman: async (token) => token === "human" });
    const laptop = asCandidate(app);
    const { code } = (await laptop.post("/api/account/recovery-code")).body;

    const phone = asCandidate(app);
    await phone.post("/api/account/recover", { code }).expect(403);
    await phone.post("/api/account/recover", { code }).set("X-Turnstile-Token", "human").expect(200);
  });
});

describe("saving and restoring with a passkey", () => {
  it("saves a passkey for this site and restores the history with it", async () => {
    const { app } = testApp();
    const laptop = asCandidate(app);
    const id = await startInterview(laptop);
    expect((await savePasskey(laptop, 200)).body).toEqual({ passkeys: 1, hasRecoveryCode: false });
    expect(webauthn.lastVerify).toMatchObject({ expectedRPID: "127.0.0.1", expectedOrigin: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/) });

    const phone = asCandidate(app);
    const unsaved = await startInterview(phone);
    const res = await signInWithPasskey(phone, 200);
    expect(cookieId(res)).toBe(laptop.id);
    expect(await interviewIds(laptop)).toEqual([id, unsaved].sort());
  });

  it("rejects a challenge that was never issued, or is used twice", async () => {
    const { app } = testApp();
    const laptop = asCandidate(app);
    await laptop.post("/api/account/passkeys", credential("passkey-1", "made-up")).expect(400);

    const { challenge } = (await laptop.post("/api/account/passkeys/options")).body;
    await laptop.post("/api/account/passkeys", credential("passkey-1", challenge)).expect(200);
    await laptop.post("/api/account/passkeys", credential("passkey-2", challenge)).expect(400);
  });

  it("rejects another candidate's registration challenge", async () => {
    const { app } = testApp();
    const { challenge } = (await asCandidate(app).post("/api/account/passkeys/options")).body;
    await asCandidate(app).post("/api/account/passkeys", credential("passkey-1", challenge)).expect(400);
  });

  it("rejects an expired challenge", async () => {
    let time = new Date("2026-01-01T00:00:00Z");
    const { app } = testApp({ now: () => time });
    const laptop = asCandidate(app);
    await savePasskey(laptop, 200);

    const phone = asCandidate(app);
    const { challenge } = (await phone.post("/api/account/sign-in/options")).body;
    time = new Date(time.getTime() + 6 * 60_000);
    await phone.post("/api/account/sign-in", credential("passkey-1", challenge)).expect(400);
  });

  it("rejects a passkey that isn't saved here", async () => {
    const { app } = testApp();
    await signInWithPasskey(asCandidate(app), 404, "unknown");
  });
});

describe("signing out of a browser", () => {
  it("is refused while the history isn't saved", async () => {
    const { app } = testApp();
    await asCandidate(app).post("/api/account/sign-out").expect(409);
  });

  it("clears the cookie once the history is saved", async () => {
    const { app } = testApp();
    const laptop = asCandidate(app, randomUUID());
    await laptop.post("/api/account/recovery-code").expect(200);
    const res = await laptop.post("/api/account/sign-out").expect(204);
    expect(cookieId(res)).toBe("");
  });
});
