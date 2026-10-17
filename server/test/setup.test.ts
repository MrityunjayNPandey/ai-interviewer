import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createModelRegistry } from "../src/ai/models";
import { asCandidate, budget, fakeAi, match, profile, requirements, testApp, useDatabase } from "./helpers";

useDatabase();

/** A minimal one-page PDF containing `text`. */
function pdfWith(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

describe("GET /api/models", () => {
  it("lists only models whose provider has a key, marking the default", async () => {
    const app = createApp({
      registry: createModelRegistry({ GROQ_API_KEY: "k", MISTRAL_API_KEY: "k" }),
      ai: fakeAi(),
      connect: async () => {},
    });
    const res = await request(app).get("/api/models").expect(200);

    const providers = new Set(res.body.models.map((model: { provider: string }) => model.provider));
    expect(providers).toEqual(new Set(["Groq", "Mistral"]));
    expect(res.body.models.filter((model: { isDefault: boolean }) => model.isDefault)).toEqual([
      expect.objectContaining({ id: "groq:openai/gpt-oss-120b", mayTrainOnInputs: false }),
    ]);
    expect(res.body.models.find((model: { provider: string }) => model.provider === "Mistral").mayTrainOnInputs).toBe(true);
  });
});

describe("POST /api/setup/resume-text", () => {
  it("extracts the text of a PDF", async () => {
    const { app } = testApp();
    const sentence = "Jane Doe is a backend engineer with four years of Node.js and MongoDB experience.";
    const res = await asCandidate(app)
      .post("/api/setup/resume-text")
      .set("Content-Type", "application/pdf")
      .send(pdfWith(sentence))
      .expect(200);

    expect(res.body.text).toContain(sentence);
  });

  it("explains when the file isn't a readable PDF", async () => {
    const { app } = testApp();
    const res = await asCandidate(app)
      .post("/api/setup/resume-text")
      .set("Content-Type", "application/pdf")
      .send(Buffer.from("definitely not a pdf"))
      .expect(422);

    expect(res.body).toMatchObject({ code: "UNSUPPORTED_FILE" });
  });

  it("explains when a PDF has no text, like a scan", async () => {
    const { app } = testApp();
    const res = await asCandidate(app)
      .post("/api/setup/resume-text")
      .set("Content-Type", "application/pdf")
      .send(pdfWith(""))
      .expect(422);

    expect(res.body.message).toMatch(/scanned/);
  });
});

describe("POST /api/setup/parse and /match", () => {
  it("returns a candidate profile and role requirements, using the parse model", async () => {
    const { app, ai } = testApp();
    const res = await asCandidate(app)
      .post("/api/setup/parse", { resumeText: "Jane Doe resume", jobDescription: "A senior role" })
      .expect(200);

    expect(res.body).toEqual({ profile, requirements });
    expect(ai.calls.map((call) => call.model)).toEqual(["groq:openai/gpt-oss-120b", "groq:openai/gpt-oss-120b"]);
  });

  it("asks for both inputs", async () => {
    const { app } = testApp();
    const res = await asCandidate(app).post("/api/setup/parse", { resumeText: "", jobDescription: "x" }).expect(400);
    expect(res.body.message).toMatch(/resume/i);
  });

  it("computes a match from edited inputs", async () => {
    const { app } = testApp();
    const res = await asCandidate(app)
      .post("/api/setup/match", { profile: { ...profile, skills: ["Go"] }, requirements })
      .expect(200);

    expect(res.body).toEqual({ match });
  });

  it("is limited per day", async () => {
    const { app } = testApp({ budget: budget({ aiCallsPerCandidate: 1 }) });
    const candidate = asCandidate(app);
    await candidate.post("/api/setup/match", { profile, requirements }).expect(200);
    await candidate.post("/api/setup/match", { profile, requirements }).expect(429);
  });
});
