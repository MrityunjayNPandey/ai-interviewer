// Local development entry point. On Vercel, api/index.ts serves the app instead.
import { createApp } from "./app";
import { connectToDatabase } from "./db/mongo-client";

const PORT = Number(process.env.PORT) || 8080;

createApp().listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Connect eagerly so a bad MONGODB_URI shows up at startup; requests still retry on their own.
connectToDatabase().then(
  () => console.log("Connected to MongoDB"),
  (error) => console.error("MongoDB connection failed:", error.message)
);
