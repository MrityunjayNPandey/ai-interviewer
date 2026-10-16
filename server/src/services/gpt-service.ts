import { OpenAI } from "openai";
import type { gptContext } from "../app";

const DEFAULT_MODEL = "openai/gpt-oss-120b";

// Created on first use so a missing key fails the request, not the whole server at import time.
let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not set");
    }
    client = new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey });
  }
  return client;
}

async function complete(context: gptContext[], instruction: string) {
  const response = await getClient().chat.completions.create({
    model: process.env.AI_MODEL || DEFAULT_MODEL,
    messages: [...context, { role: "user", content: instruction }],
    temperature: 0.7,
  });
  return response.choices[0]?.message?.content || "";
}

export const getGptQuestion = (context: gptContext[]) =>
  complete(context, "generate a question");

export const getGptAnswerFeedback = (context: gptContext[]) =>
  complete(context, "give me the feedback about my previous answer in not more than 50 words");

export const getGptInterviewFeedback = (context: gptContext[]) =>
  complete(context, "give me the feedback of the interview");
