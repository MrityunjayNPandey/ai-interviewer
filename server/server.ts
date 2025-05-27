import bodyParser from "body-parser";
import express from "express";
import { z } from "zod";
import interviewContextModel from "./db/models/interviewContextModel";
import interviewModel from "./db/models/interviewModel";
import { connectToDatabase } from "./db/mongo-client";
import {
  getGptInterviewFeedback,
  getGptQuestion,
} from "./services/gpt-service";

const app = express();
app.use(bodyParser.json());

export type gptContext = {
  role: string;
  content: string;
};

type cache = {
  interview: any;
  gptContext: gptContext[];
};

const cacheMap = new Map<string, cache>();

const emailInputSchema = z.object({
  emailId: z.string().email(),
});

app.post("/startInterview", async (req, res) => {
  const { emailId } = emailInputSchema.parse(req.body);

  let interview = await interviewModel
    .findOne({ emailId })
    .sort({ createdAt: -1 });
  let createInterview = !interview || interview.status === "completed";

  let gptContext: gptContext[] = [
    {
      role: "system",
      content: `You are an Interviewer. You need to ask questions to interviewee based on the resume and JD. You have to ask questions only when the user says "generate a question". You'll have to give your honest feedback to the user after the interview, when the user says "give me the feedback of the interview", and that if he can be hired in or organization or not. As a reference, if 80% of questions are answered correctly, you can hire the interviewee. You'll have to give your feedback in 200 words.`,
    },
  ];

  if (createInterview) {
    interview = await interviewModel.create({
      emailId,
    });
  } else {
    const interviewContexts = await interviewContextModel
      .find({ interviewId: interview?._id })
      .sort({ sequenceId: 1 });
    interviewContexts.forEach((context) => {
      gptContext.push({
        role: context.role,
        content: context.content,
      });
    });
  }

  cacheMap.set(emailId, { interview, gptContext });

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

    let { interview, gptContext } = cacheMap.get(emailId) ?? {};

    if (!gptContext || gptContext.length !== 1) {
      throw new Error("Invalid operation");
    }

    gptContext.push({
      role: "user",
      content: `resume: ${resume}`,
    });

    gptContext.push({
      role: "user",
      content: `JD: ${jd}`,
    });

    await interviewContextModel.insertMany(
      gptContext.map((context, index) => {
        return {
          interviewId: interview?._id,
          content: context.content,
          sequenceId: index,
          role: context.role,
        };
      })
    );

    res.json({ success: true });
  }
);

app.post("/getQuestion", async (req, res) => {
  const { emailId } = emailInputSchema.parse(req.body);
  let { gptContext } = cacheMap.get(emailId) ?? {};
  console.log("🚀 ~ app.post ~ gptContext:", gptContext);

  if (!gptContext?.length || gptContext.length < 3) {
    throw new Error("Invalid operation");
  }

  const question = await getGptQuestion(gptContext);

  gptContext?.push({
    role: "assistant",
    content: question,
  });
  res.json({ question });
});

app.post("/submitAnswer", async (req, res) => {
  const emailAndAnswerInputSchema = z.object({
    emailId: z.string().email(),
    answer: z.string().min(1),
  });
  const { emailId, answer } = emailAndAnswerInputSchema.parse(req.body);
  let { interview, gptContext } = cacheMap.get(emailId) ?? {};
  console.log("🚀 ~ app.post ~ gptContext:", gptContext);

  if (!gptContext?.length || gptContext.length < 5) {
    throw new Error("Invalid operation");
  }

  gptContext?.push({
    role: "user",
    content: answer,
  });

  await interviewContextModel.insertMany([
    {
      interviewId: interview?._id,
      role: "user",
      content: answer,
      sequenceId: gptContext.length - 1,
    },
    {
      interviewId: interview?._id,
      role: "assistant",
      content: gptContext?.[gptContext.length - 2]?.content,
      sequenceId: gptContext.length - 2,
    },
  ]);

  res.json({ success: true });
});

app.post("/endInterview", async (req, res) => {
  const { emailId } = emailInputSchema.parse(req.body);

  let { interview, gptContext } = cacheMap.get(emailId) ?? {};

  if (!gptContext?.length || gptContext.length < 5) {
    throw new Error("Invalid operation");
  }

  const feedback = await getGptInterviewFeedback(gptContext);

  await interviewModel.findOneAndUpdate(interview._id, {
    status: "completed",
    feedback,
  });

  cacheMap.delete(emailId);

  res.json({ success: true });
});

const PORT = process.env.PORT || 8080;
connectToDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
