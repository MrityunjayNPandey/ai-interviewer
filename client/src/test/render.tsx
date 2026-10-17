import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { theme } from "../theme";

/**
 * Renders with the app's providers and a fresh query cache. Pass `route` (a path pattern) and `url`
 * to render `ui` as the page at that route, as the app does.
 */
export function renderWithProviders(ui: ReactNode, { route, url }: { route?: string; url?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url ?? "/"]}>
          {route ? (
            <Routes>
              <Route path={route} element={ui} />
            </Routes>
          ) : (
            ui
          )}
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

/** A Response whose body arrives in the given chunks (to exercise stream parsing across chunk boundaries). */
export function streamResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "application/x-ndjson" } });
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Route = (url: string, init: RequestInit) => Response | undefined;

/** Stubs fetch with a list of handlers; the first one returning a Response wins. */
export function mockFetch(...routes: Route[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    for (const route of routes) {
      const response = route(url, init);
      if (response) return response;
    }
    throw new Error(`Unexpected fetch: ${init.method ?? "GET"} ${url}`);
  });
}
