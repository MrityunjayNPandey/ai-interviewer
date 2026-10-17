// Local development entry point. On Vercel, api/index.ts serves the app instead.
import { createApp } from "./app";
import { connectToDatabase } from "./db/mongo-client";

const PORT = Number(process.env.PORT) || 8080;

createApp()
  .listen({ port: PORT, host: "127.0.0.1" })
  .then(() => console.log(`Server is running on http://localhost:${PORT}`))
  .catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use, probably by another copy of the dev server.\n` +
          `Stop it (e.g. \`lsof -ti tcp:${PORT} | xargs kill\`), or set PORT (and API_PORT for Vite) to another port.`
      );
    } else {
      console.error(error);
    }
    process.exit(1);
  });

// Connect eagerly so a bad MONGODB_URI shows up at startup; requests still retry on their own.
connectToDatabase().then(
  () => console.log("Connected to MongoDB"),
  (error) => console.error("MongoDB connection failed:", error.message)
);
