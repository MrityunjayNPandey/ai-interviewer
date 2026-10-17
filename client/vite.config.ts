import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In dev the API runs separately; in production Vercel serves it from the same origin.
    proxy: {
      // 127.0.0.1, not localhost: the server listens on IPv4, and some Node versions resolve localhost to ::1 first.
      "/api": `http://127.0.0.1:${process.env.API_PORT ?? 8080}`,
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: they change far less often than the app's own code.
        manualChunks: {
          react: ["react", "react-dom", "react-dom/client", "react-router-dom"],
          mui: ["@mui/material", "@emotion/react", "@emotion/styled"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
});
