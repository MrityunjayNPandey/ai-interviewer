import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LENGTH,
  type CandidateProfile,
  type Difficulty,
  type InterviewType,
  type Match,
  type Mode,
  type RoleBriefing,
  type RoleRequirements,
} from "../../api/types";

/** Everything the setup wizard has collected so far. */
export type Draft = {
  step: 0 | 1 | 2;
  resumeSource: "upload" | "paste";
  resumeFileName: string | null;
  resumeText: string;
  jobDescription: string;
  /** The inputs the current profile/requirements were parsed from, to tell when re-parsing is needed. */
  parsedFrom: { resumeText: string; jobDescription: string } | null;
  profile: CandidateProfile | null;
  requirements: RoleRequirements | null;
  match: Match | null;
  /** True once the profile or requirements were edited after the match was computed. */
  matchStale: boolean;
  briefing: RoleBriefing | null;
  /** The title/company/seniority the briefing was researched for (see `briefingSubjectKey`). */
  briefingFor: string | null;
  interviewType: InterviewType;
  difficulty: Difficulty;
  length: number;
  mode: Mode;
  modelId: string | null;
};

export const emptyDraft: Draft = {
  step: 0,
  resumeSource: "upload",
  resumeFileName: null,
  resumeText: "",
  jobDescription: "",
  parsedFrom: null,
  profile: null,
  requirements: null,
  match: null,
  matchStale: false,
  briefing: null,
  briefingFor: null,
  interviewType: "mixed",
  difficulty: "mid",
  length: DEFAULT_LENGTH,
  mode: "coach",
  modelId: null,
};

const STORAGE_KEY = "ai-interviewer.setupDraft";

function load(): Draft {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? { ...emptyDraft, ...(JSON.parse(saved) as Partial<Draft>) } : emptyDraft;
  } catch {
    return emptyDraft;
  }
}

/** Wizard state that survives a page refresh within the tab. */
export function useDraft() {
  const [draft, setDraft] = useState<Draft>(load);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Storage full or blocked: the draft just won't survive a refresh.
    }
  }, [draft]);

  const update = useCallback((changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes })), []);
  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setDraft(emptyDraft);
  }, []);

  return { draft, update, reset };
}

// ---- tidying edited data before it goes to the server ----

const items = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);
const orNull = (value: string | null) => value?.trim() || null;

export function cleanProfile(profile: CandidateProfile): CandidateProfile {
  return {
    name: orNull(profile.name),
    headline: orNull(profile.headline),
    yearsOfExperience: profile.yearsOfExperience,
    skills: items(profile.skills),
    experience: profile.experience
      .filter((entry) => entry.title.trim())
      .map((entry) => ({
        title: entry.title.trim(),
        company: orNull(entry.company),
        period: orNull(entry.period),
        highlights: items(entry.highlights),
      })),
    projects: profile.projects
      .filter((project) => project.name.trim())
      .map((project) => ({ name: project.name.trim(), highlights: items(project.highlights) })),
    education: items(profile.education),
  };
}

export function cleanRequirements(requirements: RoleRequirements): RoleRequirements {
  return {
    title: requirements.title.trim(),
    company: orNull(requirements.company),
    seniority: orNull(requirements.seniority),
    mustHave: items(requirements.mustHave),
    niceToHave: items(requirements.niceToHave),
    responsibilities: items(requirements.responsibilities),
  };
}

export const briefingSubjectKey = (requirements: RoleRequirements) =>
  [requirements.title, requirements.company, requirements.seniority].map((value) => (value ?? "").trim().toLowerCase()).join("|");

/** Drops sources no remaining point cites (after the candidate removed some points). */
export function pruneBriefing(briefing: RoleBriefing): RoleBriefing {
  const sections = [briefing.about, briefing.process, briefing.questions, briefing.topics];
  const cited = new Set(sections.flat().flatMap((item) => item.sourceIds));
  return { ...briefing, sources: briefing.sources.filter((source) => cited.has(source.id)) };
}
