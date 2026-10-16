import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { z, ZodError } from "zod";
import interviewModel from "./db/models/interviewModel";
import { connectToDatabase } from "./db/mongo-client";
import { getGPTContext, insertGptContexts } from "./services/dbServices";
import {
  getGptAnswerFeedback,
  getGptInterviewFeedback,
  getGptQuestion,
} from "./services/gpt-service";

export type gptContext = {
  role: "system" | "user" | "assistant";
  content: string;
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const emailInputSchema = z.object({
  emailId: z.string().email(),
});

const SYSTEM_PROMPT = `You are an Interviewer. You need to ask questions to interviewee based on the resume and JD. You have to ask questions only when the user says "generate a question". You'll have to give your honest feedback to the user after the interview, when the user says "give me the feedback of the interview", and that if he can be hired in or organization or not. As a reference, if 80% of questions are answered correctly, you can hire the interviewee. You'll have to give your feedback in 200 words.`;

function createApiRouter() {
  const router = express.Router();

  router.use(async (_req, _res, next) => {
    await connectToDatabase();
    next();
  });

  router.post("/startInterview", async (req, res) => {
    const { emailId } = emailInputSchema.parse(req.body);

    const { interview: dbInterview, gptContext } = await getGPTContext(emailId);

    if (!dbInterview) {
      const interview = await interviewModel.create({ emailId });
      await insertGptContexts([{ role: "system", content: SYSTEM_PROMPT }], interview._id);
    }

    res.json({ createInterview: gptContext.length < 3 });
  });

  router.post("/submitJdAndResume", async (req, res) => {
    const { emailId, jd, resume } = z
      .object({
        emailId: z.string().email(),
        jd: z.string().min(1),
        resume: z.string().min(1),
      })
      .parse(req.body);

    const { interview, gptContext } = await getGPTContext(emailId);

    if (!interview || gptContext.length !== 1) {
      throw new HttpError(409, "Resume and job description were already submitted");
    }

    await insertGptContexts(
      [
        { role: "user", content: `resume: ${resume}` },
        { role: "user", content: `JD: ${jd}` },
      ],
      interview._id
    );

    res.json({ success: true });
  });

  router.post("/getQuestion", async (req, res) => {
    const { emailId } = emailInputSchema.parse(req.body);
    const { interview, gptContext } = await getGPTContext(emailId);

    if (!interview || gptContext.length < 3) {
      throw new HttpError(409, "No interview in progress");
    }

    const last = gptContext[gptContext.length - 1];
    if (last?.role === "assistant") {
      res.json({ question: last.content });
      return;
    }

    const question = await getGptQuestion(gptContext);
    await insertGptContexts([{ role: "assistant", content: question }], interview._id);

    res.json({ question });
  });

  router.post("/submitAnswer", async (req, res) => {
    const { emailId, answer } = z
      .object({
        emailId: z.string().email(),
        answer: z.string().min(1),
      })
      .parse(req.body);
    const { interview, gptContext } = await getGPTContext(emailId);

    if (!interview || gptContext.length < 4 || gptContext.at(-1)?.role !== "assistant") {
      throw new HttpError(409, "There is no question waiting for an answer");
    }

    const answerMessage: gptContext = { role: "user", content: answer };
    await insertGptContexts([answerMessage], interview._id);

    const answerFeedback = await getGptAnswerFeedback([...gptContext, answerMessage]);

    res.json({ gptFeedback: answerFeedback });
  });

  router.post("/endInterview", async (req, res) => {
    const { emailId } = emailInputSchema.parse(req.body);

    const { interview, gptContext } = await getGPTContext(emailId);

    if (!interview || gptContext.length < 5) {
      throw new HttpError(409, "Answer at least one question before ending the interview");
    }

    const feedback = await getGptInterviewFeedback(gptContext);

    await interviewModel.updateOne({ _id: interview._id }, { status: "completed", feedback });

    res.json({ feedback });
  });

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return router;
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Invalid request", issues: error.issues });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ message: "Something went wrong. Please try again." });
};

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createApiRouter());
  app.use(errorHandler);
  return app;
}
