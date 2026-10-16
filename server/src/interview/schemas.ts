// Domain shapes shared with the client (type-only imports from client/src/api).
// Keep this file free of server-only imports so the client can compile against it.
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const list = (maxItems: number, maxLength = 200) => z.array(text(maxLength).min(1)).max(maxItems);

export const candidateProfileSchema = z.object({
  name: text(120).nullable(),
  headline: text(200).nullable(),
  yearsOfExperience: z.number().min(0).max(60).nullable(),
  skills: list(60, 80),
  experience: z
    .array(
      z.object({
        title: text(160),
        company: text(160).nullable(),
        period: text(80).nullable(),
        highlights: list(8, 400),
      })
    )
    .max(15),
  projects: z
    .array(
      z.object({
        name: text(160),
        highlights: list(6, 400),
      })
    )
    .max(15),
  education: list(8, 300),
});
export type CandidateProfile = z.infer<typeof candidateProfileSchema>;

export const roleRequirementsSchema = z.object({
  title: text(160),
  company: text(160).nullable(),
  seniority: text(80).nullable(),
  mustHave: list(30),
  niceToHave: list(30),
  responsibilities: list(30, 400),
});
export type RoleRequirements = z.infer<typeof roleRequirementsSchema>;

export const matchSchema = z.object({
  summary: text(600),
  strengths: list(8, 300),
  gaps: list(8, 300),
});
export type Match = z.infer<typeof matchSchema>;

export const INTERVIEW_TYPES = ["behavioral", "technical", "mixed"] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const DIFFICULTIES = ["junior", "mid", "senior"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const MODES = ["coach", "mock"] as const;
export type Mode = (typeof MODES)[number];

export const MIN_LENGTH = 3;
export const MAX_LENGTH = 12;
export const DEFAULT_LENGTH = 6;

export const MAX_RESUME_CHARS = 30_000;
export const MAX_JOB_DESCRIPTION_CHARS = 15_000;
export const MAX_ANSWER_CHARS = 6_000;

export const setupSchema = z.object({
  resumeText: z.string().trim().min(1).max(MAX_RESUME_CHARS),
  jobDescription: z.string().trim().min(1).max(MAX_JOB_DESCRIPTION_CHARS),
  profile: candidateProfileSchema,
  requirements: roleRequirementsSchema,
  match: matchSchema.nullable(),
  interviewType: z.enum(INTERVIEW_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  length: z.number().int().min(MIN_LENGTH).max(MAX_LENGTH),
  mode: z.enum(MODES),
  modelId: z.string().min(1),
});
export type Setup = z.infer<typeof setupSchema>;

export const reportSchema = z.object({
  overallScore: z.number().min(0).max(10),
  summary: text(1200),
  strengths: list(5, 400).min(1),
  improvements: z
    .array(z.object({ area: text(120), suggestion: text(500) }))
    .min(1)
    .max(5),
  questions: z.array(
    z.object({
      index: z.number().int().min(0),
      score: z.number().min(0).max(10),
      note: text(600),
      strongAnswer: text(800),
    })
  ),
});
export type Report = z.infer<typeof reportSchema>;

// ---- API views (what the client receives) ----

export type InterviewStatus = "in_progress" | "completed";

export type TurnView = {
  index: number;
  question: string;
  answer: string | null;
  /** Null while not yet generated, and always null in mock mode until the interview is completed. */
  feedback: string | null;
  modelId: string;
};

export type InterviewView = {
  id: string;
  status: InterviewStatus;
  createdAt: string;
  completedAt: string | null;
  setup: Setup;
  turns: TurnView[];
  report: (Report & { modelId: string }) | null;
};

export type InterviewSummary = {
  id: string;
  status: InterviewStatus;
  createdAt: string;
  roleTitle: string;
  company: string | null;
  interviewType: InterviewType;
  difficulty: Difficulty;
  length: number;
  answeredCount: number;
  overallScore: number | null;
};

export type ModelOption = {
  id: string;
  label: string;
  provider: string;
  note: string;
  /** The provider's free tier may use inputs to train models. */
  mayTrainOnInputs: boolean;
  isDefault: boolean;
};

/** Events in an NDJSON stream from the question and answer endpoints. */
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; interview: InterviewView }
  | { type: "error"; code: ApiErrorCode; message: string };

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DAILY_LIMIT"
  | "MODEL_UNAVAILABLE"
  | "UNSUPPORTED_FILE"
  | "INTERNAL";

export type ApiError = { code: ApiErrorCode; message: string };
