import { describe, expect, it } from "vitest";
import type { RoleBriefing } from "../../api/types";
import { setup } from "../../test/fixtures";
import { briefingSubjectKey, cleanProfile, cleanRequirements, pruneBriefing } from "./draft";

describe("cleaning edited setup data", () => {
  it("drops blank items and entries, and turns blank optional fields into null", () => {
    const profile = cleanProfile({
      ...setup.profile,
      name: "  ",
      skills: ["Node.js", " ", " Go "],
      experience: [
        { title: "", company: "Ghost", period: null, highlights: [] },
        { title: " Engineer ", company: " ", period: "2021", highlights: ["Shipped", ""] },
      ],
    });

    expect(profile.name).toBeNull();
    expect(profile.skills).toEqual(["Node.js", "Go"]);
    expect(profile.experience).toEqual([{ title: "Engineer", company: null, period: "2021", highlights: ["Shipped"] }]);
  });

  it("tidies role requirements the same way", () => {
    const requirements = cleanRequirements({ ...setup.requirements, company: "", mustHave: ["Node.js", ""] });
    expect(requirements).toMatchObject({ company: null, mustHave: ["Node.js"] });
  });
});

describe("role briefings", () => {
  it("are keyed by title, company and seniority, ignoring case and spacing", () => {
    expect(briefingSubjectKey({ ...setup.requirements, title: " Senior Backend Engineer " })).toBe(
      briefingSubjectKey({ ...setup.requirements, title: "senior backend engineer", company: "GLOBEX" })
    );
  });

  it("drop sources that no remaining point cites", () => {
    const briefing: RoleBriefing = {
      scope: "company",
      about: [],
      process: [],
      questions: [{ text: "Design a rate limiter", sourceIds: [2] }],
      topics: [],
      sources: [
        { id: 1, title: "Removed point's source", url: "https://example.com/1" },
        { id: 2, title: "Kept", url: "https://example.com/2" },
      ],
      generatedAt: "2026-10-17T00:00:00.000Z",
    };
    expect(pruneBriefing(briefing).sources.map((source) => source.id)).toEqual([2]);
  });
});
