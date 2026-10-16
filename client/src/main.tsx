import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ApiError } from "./api/client";
import { theme } from "./theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry what will fail the same way again (e.g. a 404).
      retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline enableColorScheme />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
);
