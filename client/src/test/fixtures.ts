import type { InterviewView, ModelOption, Setup, TurnView } from "../api/types";

export const setup: Setup = {
  resumeText: "Jane Doe, backend engineer.",
  jobDescription: "Senior Backend Engineer at Globex.",
  profile: {
    name: "Jane Doe",
    headline: "Backend Engineer",
    yearsOfExperience: 4,
    skills: ["Node.js"],
    experience: [],
    projects: [],
    education: [],
  },
  requirements: {
    title: "Senior Backend Engineer",
    company: "Globex",
    seniority: "Senior",
    mustHave: ["Node.js"],
    niceToHave: [],
    responsibilities: [],
  },
  match: null,
  interviewType: "mixed",
  difficulty: "mid",
  length: 3,
  mode: "coach",
  modelId: "groq:openai/gpt-oss-120b",
};

export const turn = (overrides: Partial<TurnView> = {}): TurnView => ({
  index: 0,
  question: "Tell me about a project you're proud of.",
  answer: null,
  feedback: null,
  previousAttempts: [],
  coachMessages: [],
  modelId: "groq:openai/gpt-oss-120b",
  ...overrides,
});

export const interview = (overrides: Partial<InterviewView> = {}): InterviewView => ({
  id: "6ad2b67267d71908ba4f6a9e",
  status: "in_progress",
  createdAt: "2026-10-17T10:00:00.000Z",
  completedAt: null,
  setup,
  turns: [],
  report: null,
  ...overrides,
});

export const models: ModelOption[] = [
  { id: "groq:openai/gpt-oss-120b", label: "GPT-OSS 120B", provider: "Groq", note: "Best quality", mayTrainOnInputs: false, isDefault: true },
  { id: "mistral:mistral-small-latest", label: "Mistral Small", provider: "Mistral", note: "Balanced", mayTrainOnInputs: true, isDefault: false },
];
