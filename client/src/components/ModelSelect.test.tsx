import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { models } from "../test/fixtures";
import { renderWithProviders } from "../test/render";
import ModelSelect from "./ModelSelect";

describe("ModelSelect", () => {
  it("warns when the chosen provider may train on inputs", () => {
    renderWithProviders(<ModelSelect models={models} value="mistral:mistral-small-latest" onChange={() => {}} />);
    expect(screen.getByText(/may use your inputs/)).toBeTruthy();
  });

  it("shows no warning for providers that don't", () => {
    renderWithProviders(<ModelSelect models={models} value="groq:openai/gpt-oss-120b" onChange={() => {}} />);
    expect(screen.queryByText(/may use your inputs/)).toBeNull();
  });
});
