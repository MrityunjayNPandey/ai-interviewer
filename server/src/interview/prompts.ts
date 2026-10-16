import type { ChatMessage } from "../ai/client";
import type { CandidateProfile, Difficulty, InterviewType, RoleRequirements, Setup } from "./schemas";

/** A turn as the prompts see it: only fields that exist so far. */
export type PromptTurn = { question: string; answer?: string | null; feedback?: string | null };

const TYPE_GUIDANCE: Record<InterviewType, string> = {
  behavioral:
    "Ask behavioral questions about past situations (teamwork, conflict, ownership, failure, impact). Expect STAR-style answers.",
  technical:
    "Ask technical questions about the skills the role requires: concepts, design trade-offs, debugging, and practical scenarios.",
  mixed:
    "Mix behavioral and technical questions, roughly half each, and include at least one question about a specific item on the resume.",
};

const DIFFICULTY_GUIDANCE: Record<Difficulty, string> = {
  junior: "Pitch questions at a junior level: fundamentals and well-scoped problems.",
  mid: "Pitch questions at a mid level: independent ownership, trade-offs, and real-world constraints.",
  senior: "Pitch questions at a senior level: architecture, ambiguity, leadership, and cross-team impact.",
};

const json = (value: unknown) => JSON.stringify(value, null, 2);

function interviewBrief(setup: Setup): string {
  return [
    `Candidate profile:\n${json(setup.profile)}`,
    `Role requirements:\n${json(setup.requirements)}`,
    setup.match ? `Known strengths and gaps:\n${json(setup.match)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Appends a user message, merging into the previous one when it is also from the user (some providers reject two in a row). */
function withUserMessage(messages: ChatMessage[], content: string): ChatMessage[] {
  const last = messages.at(-1);
  if (last?.role === "user") {
    return [...messages.slice(0, -1), { role: "user", content: `${last.content}\n\n${content}` }];
  }
  return [...messages, { role: "user", content }];
}

function transcriptMessages(turns: PromptTurn[]): ChatMessage[] {
  return turns.flatMap((turn): ChatMessage[] => [
    { role: "assistant", content: turn.question },
    ...(turn.answer ? [{ role: "user" as const, content: turn.answer }] : []),
  ]);
}

export function questionMessages(setup: Setup, turns: PromptTurn[]): ChatMessage[] {
  const number = turns.length + 1;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        `You are a friendly but rigorous interviewer running a practice interview for the role of ${setup.requirements.title}.`,
        TYPE_GUIDANCE[setup.interviewType],
        DIFFICULTY_GUIDANCE[setup.difficulty],
        `The interview has ${setup.length} questions in total.`,
        "Tailor every question to this candidate and this role. Never repeat an earlier question.",
        "When an earlier answer was vague or incomplete, you may make the next question a follow-up that digs into it.",
        "Reply with the question only: one to three sentences of plain text, no preamble, no numbering, no markdown.",
        "",
        interviewBrief(setup),
      ].join("\n"),
    },
    ...transcriptMessages(turns),
  ];
  const instruction = number === setup.length ? `Ask question ${number} of ${setup.length}. It is the last one.` : `Ask question ${number} of ${setup.length}.`;
  return withUserMessage(messages, `(${instruction})`);
}

export function feedbackMessages(setup: Setup, turns: PromptTurn[], current: PromptTurn): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        `You are an interview coach. The candidate is practising for the role of ${setup.requirements.title} (${setup.difficulty} level).`,
        "Give feedback on the candidate's latest answer only: what worked, and the single most important way to improve it.",
        "Be specific to what they actually said. Be honest but encouraging.",
        "Reply in at most 60 words of plain text, no markdown, no headings.",
        "",
        interviewBrief(setup),
      ].join("\n"),
    },
    ...transcriptMessages(turns),
    { role: "assistant", content: current.question },
    { role: "user", content: current.answer ?? "" },
  ];
  return withUserMessage(messages, "(Give me feedback on that answer.)");
}

export function reportMessages(setup: Setup, turns: PromptTurn[]): ChatMessage[] {
  const transcript = turns.map((turn, index) => ({
    index,
    question: turn.question,
    answer: turn.answer,
  }));
  return [
    {
      role: "system",
      content: [
        `You are an interview coach writing the end-of-interview report for a candidate practising for the role of ${setup.requirements.title} (${setup.difficulty} level, ${setup.interviewType} interview).`,
        "Score fairly against what the role requires. 10 is an outstanding answer, 5 is adequate, 0 is no real answer.",
        "Reply with a JSON object of exactly this shape:",
        json({
          overallScore: "number 0-10 (may use one decimal)",
          summary: "string, 2-4 sentences addressed to the candidate as 'you'",
          strengths: ["1-4 short strings"],
          improvements: [{ area: "short label", suggestion: "one concrete, actionable sentence or two" }],
          questions: [
            {
              index: "number, the question's index from the transcript",
              score: "number 0-10",
              note: "1-2 sentences on this answer",
              strongAnswer: "1-3 sentences on what a strong answer would have included",
            },
          ],
        }),
        "Include exactly one entry in `questions` for every question in the transcript, in order. Give 1-4 improvements.",
        "",
        interviewBrief(setup),
      ].join("\n"),
    },
    { role: "user", content: `Transcript:\n${json(transcript)}` },
  ];
}

export function profileMessages(resumeText: string): ChatMessage[] {
  const shape: Record<keyof CandidateProfile, unknown> = {
    name: "string or null",
    headline: "current or most recent role, string or null",
    yearsOfExperience: "number or null",
    skills: ["up to 40 short strings"],
    experience: [{ title: "string", company: "string or null", period: "string or null", highlights: ["up to 5 strings"] }],
    projects: [{ name: "string", highlights: ["up to 4 strings"] }],
    education: ["up to 5 strings"],
  };
  return [
    {
      role: "system",
      content: [
        "Extract a structured profile from the resume below. Use only information in the resume; never invent anything.",
        "Use null or an empty array when something is missing. Keep highlights short and concrete.",
        `Reply with a JSON object of exactly this shape:\n${json(shape)}`,
      ].join("\n"),
    },
    { role: "user", content: resumeText },
  ];
}

export function requirementsMessages(jobDescription: string): ChatMessage[] {
  const shape: Record<keyof RoleRequirements, unknown> = {
    title: "the role's title, string",
    company: "string or null",
    seniority: "string or null",
    mustHave: ["up to 15 short strings: required skills and experience"],
    niceToHave: ["up to 10 short strings"],
    responsibilities: ["up to 10 short strings"],
  };
  return [
    {
      role: "system",
      content: [
        "Extract the requirements from the job description below. Use only information in it; never invent anything.",
        "Use null or an empty array when something is missing.",
        `Reply with a JSON object of exactly this shape:\n${json(shape)}`,
      ].join("\n"),
    },
    { role: "user", content: jobDescription },
  ];
}

export function matchMessages(profile: CandidateProfile, requirements: RoleRequirements): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "Compare the candidate profile with the role requirements.",
        "Reply with a JSON object of exactly this shape:",
        json({
          summary: "1-2 sentences addressed to the candidate as 'you'",
          strengths: ["up to 5: requirements the candidate clearly meets, with the evidence"],
          gaps: ["up to 5: requirements with weak or no evidence, phrased as what to prepare for"],
        }),
      ].join("\n"),
    },
    { role: "user", content: `Candidate profile:\n${json(profile)}\n\nRole requirements:\n${json(requirements)}` },
  ];
}
