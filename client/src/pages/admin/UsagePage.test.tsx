import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsageReport } from "../../api/types";
import { jsonResponse, mockFetch, renderWithProviders } from "../../test/render";
import UsagePage from "./UsagePage";

const report: UsageReport = {
  day: "2026-10-17",
  today: "2026-10-17",
  yesterday: "2026-10-16",
  tokens: { used: 1_400_000, limit: 1_500_000, remaining: 100_000 },
  searches: { used: 3, limit: 30, remaining: 27 },
  interviewsStarted: 4,
  models: [
    { id: "groq:openai/gpt-oss-120b", label: "GPT-OSS 120B", provider: "Groq", used: 190_000, limit: 190_000, remaining: 0 },
    { id: "mistral:mistral-small-latest", label: "Mistral Small", provider: "Mistral", used: 1_200, limit: null, remaining: null },
  ],
  candidates: [{ id: "0b6c7c4e-1111-4222-8333-944445555666", tokens: 9_000, interviews: 2, saved: true }],
  networks: [{ network: "2001:db8:1:2::/64", tokens: 9_000, interviews: 2, searches: 3 }],
  limits: { tokensPerCandidate: 150_000, tokensPerIp: 300_000, interviewsPerCandidate: 5, interviewsPerIp: 5, searchesPerIp: 9 },
};

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const enterToken = (token: string) => {
  fireEvent.change(screen.getByLabelText("Admin token"), { target: { value: token } });
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
};

describe("UsagePage", () => {
  it("asks for the admin token, sends it, and shows what's left of each cap", async () => {
    const fetch = mockFetch((url) => (url.startsWith("/api/admin/usage") ? jsonResponse(report) : undefined));
    renderWithProviders(<UsagePage />);
    enterToken("secret-token");

    expect(await screen.findByText("GPT-OSS 120B")).toBeTruthy();
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get("Authorization")).toBe("Bearer secret-token");
    expect(screen.getByText("100,000")).toBeTruthy(); // AI tokens left
    expect(screen.getByText(/Mistral limits requests/)).toBeTruthy();
    // The used-up model and the nearly used-up global cap say so in words, not just color.
    expect(screen.getAllByText("Used up").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Running low").length).toBeGreaterThan(0);
    expect(screen.getByText("0b6c7c4e")).toBeTruthy();
    expect(screen.getByText("2001:db8:1:2::/64")).toBeTruthy();
  });

  it("forgets a token the server refuses", async () => {
    mockFetch((url) => (url.startsWith("/api/admin/usage") ? jsonResponse({ code: "NOT_FOUND", message: "Not found" }, 404) : undefined));
    renderWithProviders(<UsagePage />);
    enterToken("wrong");

    expect(await screen.findByText(/wasn't accepted/)).toBeTruthy();
    expect(sessionStorage.getItem("ai-interviewer.adminToken")).toBeNull();
  });
});
