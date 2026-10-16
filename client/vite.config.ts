import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In dev the API runs separately; in production Vercel serves it from the same origin.
    proxy: {
      "/api": `http://localhost:${process.env.API_PORT ?? 8080}`,
    },
  },
});
