import { OpenAI } from "openai";

const openai = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});

export const getGptQuestion = async (context: any) => {
  const response = await openai.chat.completions.create({
    model: "gemma2-9b-it",
    messages: [...context, { role: "user", content: "generate a question" }],
    temperature: 0.7,
  });
  return response.choices[0]?.message?.content || "";
};

export const getGptInterviewFeedback = async (context: any) => {
  const response = await openai.chat.completions.create({
    model: "gemma2-9b-it",
    messages: [
      ...context,
      { role: "user", content: "give me the feedback of the interview" },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || "";
};
