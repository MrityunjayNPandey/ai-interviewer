import type { ChatMessage } from "../ai/client";
import type { CandidateProfile, Difficulty, InterviewType, RoleBriefing, RoleRequirements, Setup } from "./schemas";

/** A turn as the prompts see it: only fields that exist so far. */
export type PromptTurn = {
  question: string;
  answer?: string | null;
  feedback?: string | null;
  previousAttempts?: { answer: string; feedback: string | null }[];
};

export type PromptCoachMessage = { role: "candidate" | "coach"; content: string };

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

/** The briefing as plain points (no links), or null when there is nothing in it. */
function briefingText(briefing: RoleBriefing | null | undefined): string | null {
  if (!briefing) return null;
  const section = (title: string, items: { text: string }[]) =>
    items.length ? `${title}:\n${items.map((item) => `- ${item.text}`).join("\n")}` : null;
  const body = [
    section("About the company", briefing.about),
    section("Reported interview process", briefing.process),
    section("Commonly asked questions and themes", briefing.questions),
    section("Topics to prepare", briefing.topics),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!body) return null;
  const label = briefing.scope === "company" ? "Role briefing (from public web sources)" : "General briefing for this role (from public web sources)";
  return `${label}:\n${body}`;
}

function interviewBrief(setup: Setup): string {
  return [
    `Candidate profile:\n${json(setup.profile)}`,
    `Role requirements:\n${json(setup.requirements)}`,
    setup.match ? `Known strengths and gaps:\n${json(setup.match)}` : null,
    briefingText(setup.briefing),
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
        ...(briefingText(setup.briefing)
          ? [
              "About a third of your questions should draw on the commonly asked questions, themes and topics in the role briefing, adapted to this candidate rather than copied word for word. The rest should come from the resume and the role requirements.",
            ]
          : []),
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
  const earlier = current.previousAttempts ?? [];
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        `You are an interview coach. The candidate is practising for the role of ${setup.requirements.title} (${setup.difficulty} level).`,
        "Give feedback on the candidate's latest answer only: what worked, and the single most important way to improve it.",
        earlier.length
          ? `This is attempt ${earlier.length + 1} at this question. Say briefly whether it improved on the earlier attempt and how.`
          : null,
        "Be specific to what they actually said. Be honest but encouraging.",
        "Reply in at most 60 words of plain text, no markdown, no headings.",
        "",
        interviewBrief(setup),
      ]
        .filter((line) => line !== null)
        .join("\n"),
    },
    ...transcriptMessages(turns),
    { role: "assistant", content: current.question },
    ...earlier.flatMap((attempt): ChatMessage[] => [
      { role: "user", content: attempt.answer },
      { role: "assistant", content: `(Feedback on that attempt: ${attempt.feedback ?? "none"}) Try again.` },
    ]),
    { role: "user", content: current.answer ?? "" },
  ];
  return withUserMessage(messages, "(Give me feedback on that answer.)");
}

/** The coach answering the candidate's questions about one turn. Never shown to the interviewer. */
export function coachChatMessages(
  setup: Setup,
  turn: PromptTurn,
  chat: PromptCoachMessage[],
  message: string
): ChatMessage[] {
  const attempts = [...(turn.previousAttempts ?? []), { answer: turn.answer ?? "", feedback: turn.feedback ?? null }];
  const context = attempts
    .map((attempt, index) => `Attempt ${index + 1}:\n${attempt.answer}\n\nYour feedback:\n${attempt.feedback ?? "(none)"}`)
    .join("\n\n");
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        `You are an interview coach helping a candidate practise for the role of ${setup.requirements.title} (${setup.difficulty} level).`,
        "The candidate has questions about your feedback on their answer. Answer them directly and concretely:",
        "explain the reasoning, give examples, and when asked, show what a strong answer could sound like for this candidate.",
        "Stay on this interview question and how to answer it well. Reply in at most 150 words of plain text, no markdown headings.",
        "",
        `The interview question:\n${turn.question}`,
        "",
        context,
        "",
        interviewBrief(setup),
      ].join("\n"),
    },
    ...chat.map((entry): ChatMessage => ({ role: entry.role === "candidate" ? "user" : "assistant", content: entry.content })),
  ];
  return withUserMessage(messages, message);
}

export function reportMessages(setup: Setup, turns: PromptTurn[]): ChatMessage[] {
  const transcript = turns.map((turn, index) => ({
    index,
    question: turn.question,
    answer: turn.answer,
    ...(turn.previousAttempts?.length ? { earlierAttempts: turn.previousAttempts.map((attempt) => attempt.answer) } : {}),
  }));
  return [
    {
      role: "system",
      content: [
        `You are an interview coach writing the end-of-interview report for a candidate practising for the role of ${setup.requirements.title} (${setup.difficulty} level, ${setup.interviewType} interview).`,
        "Score fairly against what the role requires. 10 is an outstanding answer, 5 is adequate, 0 is no real answer.",
        "Some questions have earlierAttempts: the candidate retried after feedback. Score the best attempt, and mention the improvement in the note.",
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
