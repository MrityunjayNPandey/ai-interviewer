import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../test/render";
import { turn } from "../../test/fixtures";
import { TurnTranscript } from "./Transcript";

describe("TurnTranscript", () => {
  const retried = turn({
    answer: "Second try",
    feedback: "Much better.",
    previousAttempts: [{ answer: "First try", feedback: "Add a metric." }],
    coachMessages: [
      { role: "candidate", content: "Which metric?", attempt: 0 },
      { role: "coach", content: "Latency at p95.", attempt: 0 },
    ],
  });

  it("numbers attempts and shows the coach chat after the attempt it was about", () => {
    renderWithProviders(<TurnTranscript turn={retried} showCoaching />);
    const text = document.body.textContent ?? "";

    expect(screen.getByText("You · Attempt 1")).toBeTruthy();
    expect(screen.getByText("You · Attempt 2")).toBeTruthy();
    const order = ["First try", "Add a metric.", "Which metric?", "Latency at p95.", "Second try", "Much better."];
    expect(order.map((part) => text.indexOf(part))).toEqual([...order.map((part) => text.indexOf(part))].sort((a, b) => a - b));
  });

  it("hides feedback and the coach chat when coaching isn't shown", () => {
    renderWithProviders(<TurnTranscript turn={retried} showCoaching={false} />);

    expect(screen.getByText("Second try")).toBeTruthy();
    expect(screen.queryByText("Much better.")).toBeNull();
    expect(screen.queryByText("Latency at p95.")).toBeNull();
  });
});
