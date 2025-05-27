import bodyParser from "body-parser";
import express from "express";
import { z } from "zod";
import interviewModel from "./db/models/interviewModel";
import { connectToDatabase } from "./db/mongo-client";
import { getGPTContext, insertGptContexts } from "./services/dbServices";
import {
  getGptAnswerFeedback,
  getGptInterviewFeedback,
  getGptQuestion,
} from "./services/gpt-service";

const cors = require("cors"); // Import the cors middleware

const app = express();
app.use(bodyParser.json());
app.use(cors());

export type gptContext = {
  role: string;
  content: string;
};

const emailInputSchema = z.object({
  emailId: z.string().email(),
});

app.post("/startInterview", async (req, res) => {
  const { emailId } = emailInputSchema.parse(req.body);

  const { interview: dbInterview } = await getGPTContext(emailId);
  let createInterview = !dbInterview || dbInterview.status === "completed";

  let interview = dbInterview;

  if (createInterview) {
    let gptContext: gptContext[] = [
      {
        role: "system",
        content: `You are an Interviewer. You need to ask questions to interviewee based on the resume and JD. You have to ask questions only when the user says "generate a question". You'll have to give your honest feedback to the user after the interview, when the user says "give me the feedback of the interview", and that if he can be hired in or organization or not. As a reference, if 80% of questions are answered correctly, you can hire the interviewee. You'll have to give your feedback in 200 words.`,
      },
    ];
    interview = await interviewModel.create({
      emailId,
    });
    await insertGptContexts(gptContext, interview!._id);
  }

  res.json({ createInterview });
});

app.post(
  "/submitJdAndResume",
  async (req: express.Request, res: express.Response): Promise<void> => {
    const submitJdResumeSchema = z.object({
      emailId: z.string().email(),
      jd: z.string().min(1),
      resume: z.string().min(1),
    });

    const { emailId, jd, resume } = submitJdResumeSchema.parse(req.body);

    let { interview, gptContext } = await getGPTContext(emailId);

    if (!gptContext || gptContext.length !== 1) {
      throw new Error("Invalid operation");
    }

    await insertGptContexts(
      [
        {
          role: "user",
          content: `resume: ${resume}`,
        },
        {
          role: "user",
          content: `JD: ${jd}`,
        },
      ],
      interview!._id
    );

    res.json({ success: true });
  }
);

app.post("/getQuestion", async (req, res) => {
  const { emailId } = emailInputSchema.parse(req.body);
  let { interview, gptContext } = await getGPTContext(emailId);

  if (!gptContext?.length || gptContext.length < 3) {
    throw new Error("Invalid operation");
  }

  if (gptContext[gptContext.length - 1]?.role === "assistant") {
    res.json({ question: gptContext[gptContext.length - 1]?.content });
    return;
  }

  const question = await getGptQuestion(gptContext);

  await insertGptContexts(
    [
      {
        role: "assistant",
        content: question,
      },
    ],
    interview!._id
  );

  res.json({ question });
});

app.post("/submitAnswer", async (req, res) => {
  const emailAndAnswerInputSchema = z.object({
    emailId: z.string().email(),
    answer: z.string().min(1),
  });
  const { emailId, answer } = emailAndAnswerInputSchema.parse(req.body);
  let { interview, gptContext } = await getGPTContext(emailId);

  if (!gptContext?.length || gptContext.length < 4) {
    throw new Error("Invalid operation");
  }

  if (gptContext[gptContext.length - 1]?.role === "user") {
    throw new Error("Invalid operation");
  }

  await insertGptContexts(
    [
      {
        role: "user",
        content: answer,
      },
    ],
    interview!._id
  );

  gptContext.push({
    role: "user",
    content: answer,
  });

  const answerFeedback = await getGptAnswerFeedback(gptContext);

  res.json({ gptFeedback: answerFeedback });
});

app.post("/endInterview", async (req, res) => {
  const { emailId } = emailInputSchema.parse(req.body);

  let { interview, gptContext } = await getGPTContext(emailId);

  if (!gptContext?.length || gptContext.length < 5) {
    throw new Error("Invalid operation");
  }

  const feedback = await getGptInterviewFeedback(gptContext);

  await interviewModel.findOneAndUpdate(interview!._id, {
    status: "completed",
    feedback,
  });

  res.json({ feedback });
});

const PORT = process.env.PORT || 8080;
connectToDatabase().then(() => {
  app.listen(PORT, () => {});
});
