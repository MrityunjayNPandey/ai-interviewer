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
    // The vendor chunk (React + MUI + React Query, ~220 kB gzipped) is expected to exceed the 500 kB default.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // One long-lived vendor chunk: it changes far less often than the app's own code. Splitting
        // vendors further (react / mui / query) made chunks import each other in a cycle, and the
        // react chunk then ran before React was defined, leaving a blank page.
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
