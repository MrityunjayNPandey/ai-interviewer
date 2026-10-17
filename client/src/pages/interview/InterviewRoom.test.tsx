import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { InterviewView } from "../../api/types";
import { interview, models, turn } from "../../test/fixtures";
import { jsonResponse, mockFetch, renderWithProviders, streamResponse } from "../../test/render";
import InterviewPage from "./InterviewPage";

const event = (value: object) => `${JSON.stringify(value)}\n`;
const question = "Tell me about a project you're proud of.";

const models200 = (url: string) => (url.endsWith("/api/models") ? jsonResponse({ models }) : undefined);

/** Serves the interview page's initial load, as the server would. */
const loads = (initial: InterviewView) => (url: string, init: RequestInit) =>
  url.endsWith(`/api/interviews/${initial.id}`) && (init.method ?? "GET") === "GET" ? jsonResponse({ interview: initial }) : undefined;

const renderRoom = (initial: InterviewView) =>
  renderWithProviders(<InterviewPage />, { route: "/interviews/:id", url: `/interviews/${initial.id}` });

describe("InterviewRoom", () => {
  it("asks the first question, takes an answer, and streams the coach's feedback", async () => {
    const asked = interview({ turns: [turn()] });
    const answered = interview({ turns: [turn({ answer: "I built a billing API.", feedback: "Add a metric." })] });
    let answerBody: unknown;
    mockFetch(models200, loads(interview()), (url, init) => {
      if (url.endsWith("/questions")) {
        return streamResponse([event({ type: "delta", text: "Tell me about " }), event({ type: "delta", text: "a project you're proud of." }), event({ type: "done", interview: asked })]);
      }
      if (url.endsWith("/answers")) {
        answerBody = JSON.parse(String(init.body));
        return streamResponse([event({ type: "delta", text: "Add a " }), event({ type: "delta", text: "metric." }), event({ type: "done", interview: answered })]);
      }
      return undefined;
    });

    renderRoom(interview());

    expect(await screen.findByText(question)).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Your answer"), "I built a billing API.");
    await userEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(answerBody).toEqual({ answer: "I built a billing API." });
    expect(await screen.findByText("Add a metric.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /next question/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /try answering again \(2 left\)/i })).toBeTruthy();
  });

  it("shows a busy model with a way to switch and continue", async () => {
    mockFetch(models200, loads(interview()), (url) =>
      url.endsWith("/questions")
        ? jsonResponse({ code: "MODEL_UNAVAILABLE", message: "GPT-OSS 120B has hit its rate limit." }, 503)
        : undefined
    );

    renderRoom(interview());

    expect(await screen.findByText("The model is busy")).toBeTruthy();
    expect(screen.getByText(/hit its rate limit/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /switch and continue/i })).toBeTruthy();
  });

  it("in mock mode, hides feedback and moves straight on to the next question", async () => {
    const mock = (turns: InterviewView["turns"]) => interview({ setup: { ...interview().setup, mode: "mock" }, turns });
    const secondQuestion = "How do you handle a production incident?";
    let questionsAsked = 0;
    mockFetch(models200, loads(mock([])), (url) => {
      if (url.endsWith("/questions")) {
        questionsAsked++;
        const turns =
          questionsAsked === 1
            ? [turn()]
            : [turn({ answer: "An answer." }), turn({ index: 1, question: secondQuestion })];
        return streamResponse([event({ type: "done", interview: mock(turns) })]);
      }
      if (url.endsWith("/answers")) {
        return streamResponse([event({ type: "done", interview: mock([turn({ answer: "An answer." })]) })]);
      }
      return undefined;
    });

    renderRoom(mock([]));
    await userEvent.type(await screen.findByLabelText("Your answer"), "An answer.");
    await userEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(await screen.findByText(secondQuestion)).toBeTruthy();
    await waitFor(() => expect(questionsAsked).toBe(2));
    expect(screen.queryByRole("button", { name: /try answering again/i })).toBeNull();
    expect(screen.queryByText(/ask the coach/i)).toBeNull();
  });
});
