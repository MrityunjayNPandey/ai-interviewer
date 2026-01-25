import { OpenAI } from "openai";

const openai = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

export const getGptQuestion = async (context: any) => {
  const response = await openai.chat.completions.create({
    model: process.env.AI_MODEL ?? '',
    messages: [...context, { role: "user", content: "generate a question" }],
    temperature: 0.7,
  });
  return response.choices[0]?.message?.content || "";
};

export const getGptAnswerFeedback = async (context: any) => {
  const response = await openai.chat.completions.create({
    model: process.env.AI_MODEL ?? '',
    messages: [
      ...context,
      { role: "user", content: "give me the feedback about my previous answer in not more than 50 words" },
    ],
    temperature: 0.7,
  });
  return response.choices[0]?.message?.content || "";
};

export const getGptInterviewFeedback = async (context: any) => {
  const response = await openai.chat.completions.create({
    model: process.env.AI_MODEL ?? '',
    messages: [
      ...context,
      { role: "user", content: "give me the feedback of the interview" },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || "";
};
