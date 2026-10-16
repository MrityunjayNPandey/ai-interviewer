import mongoose from "mongoose";

const DEFAULT_URI = "mongodb://127.0.0.1:27017/ai-interviewer";

// Cached across invocations so a warm serverless instance reuses one connection.
let connecting: Promise<typeof mongoose> | null = null;

export function connectToDatabase(): Promise<typeof mongoose> {
  if (!connecting) {
    connecting = mongoose
      .connect(process.env.MONGODB_URI || DEFAULT_URI, {
        serverSelectionTimeoutMS: 10_000,
      })
      .catch((error) => {
        // Let the next request retry instead of caching the failure forever.
        connecting = null;
        throw error;
      });
  }
  return connecting;
}
