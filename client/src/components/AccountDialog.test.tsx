import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { jsonResponse, mockFetch, renderWithProviders } from "../test/render";
import AccountDialog from "./AccountDialog";

const unsaved = { passkeys: 0, hasRecoveryCode: false };

describe("AccountDialog", () => {
  it("saves the history with a recovery code, shown once", async () => {
    let status = unsaved;
    mockFetch((url, init) => {
      if (url === "/api/account/recovery-code" && init.method === "POST") {
        status = { passkeys: 0, hasRecoveryCode: true };
        return jsonResponse({ code: "ABCD-EFGH-JKMN-PQRS-TUVW" });
      }
      if (url === "/api/account") return jsonResponse(status);
    });
    renderWithProviders(<AccountDialog open onClose={() => {}} />);

    expect(await screen.findByText(/kept in this browser only/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Get a recovery code" }));

    expect(await screen.findByText("ABCD-EFGH-JKMN-PQRS-TUVW")).toBeTruthy();
    expect(await screen.findByText(/saved with a recovery code/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out of this browser" })).toBeTruthy();
  });

  it("restores the history with a recovery code", async () => {
    const fetch = mockFetch((url) => {
      if (url === "/api/account/recover") return jsonResponse({ passkeys: 1, hasRecoveryCode: true });
      if (url === "/api/account") return jsonResponse(unsaved);
    });
    renderWithProviders(<AccountDialog open onClose={() => {}} />);

    await userEvent.type(await screen.findByLabelText("Recovery code"), " abcd-efgh-jkmn-pqrs-tuvw ");
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("Your history is restored in this browser.")).toBeTruthy();
    const recover = fetch.mock.calls.find(([url]) => url === "/api/account/recover")!;
    expect(JSON.parse(recover[1]!.body as string)).toEqual({ code: "abcd-efgh-jkmn-pqrs-tuvw" });
  });

  it("shows the server's message when a code doesn't match", async () => {
    mockFetch((url) => {
      if (url === "/api/account/recover") return jsonResponse({ code: "NOT_FOUND", message: "That recovery code doesn't match" }, 404);
      if (url === "/api/account") return jsonResponse(unsaved);
    });
    renderWithProviders(<AccountDialog open onClose={() => {}} />);

    await userEvent.type(await screen.findByLabelText("Recovery code"), "WRONG");
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("That recovery code doesn't match")).toBeTruthy();
  });
});
