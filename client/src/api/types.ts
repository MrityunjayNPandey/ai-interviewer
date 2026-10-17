// API shapes come straight from the server's domain schemas (type-only, nothing is bundled).
export type {
  ApiError as ApiErrorBody,
  ApiErrorCode,
  AttemptView,
  BriefingItem,
  RoleBriefing,
  CoachMessageView,
  CandidateProfile,
  Difficulty,
  InterviewStatus,
  InterviewSummary,
  InterviewType,
  InterviewView,
  Match,
  Mode,
  ModelOption,
  Report,
  RoleRequirements,
  Setup,
  StreamEvent,
  TurnView,
  UsageReport,
} from "../../../server/src/interview/schemas";

export type { AccountStatus } from "../../../server/src/account/schemas";

import type { Difficulty, InterviewType, Mode } from "../../../server/src/interview/schemas";

// Mirrors of the server's limits, for form controls.
export const MIN_LENGTH = 3;
export const MAX_LENGTH = 12;
export const DEFAULT_LENGTH = 6;
export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export const MAX_ANSWER_CHARS = 6000;
export const MAX_RETRIES = 2;
export const MAX_COACH_MESSAGES = 5;
export const MAX_COACH_MESSAGE_CHARS = 1000;

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  mixed: "Mixed",
  behavioral: "Behavioral",
  technical: "Technical",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
};

export const MODE_LABELS: Record<Mode, { label: string; description: string }> = {
  coach: { label: "Coach", description: "Feedback right after each answer" },
  mock: { label: "Mock", description: "Like the real thing: feedback only in the final report" },
};
