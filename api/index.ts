// Vercel serverless entry point: every /api/* request is rewritten here (see vercel.json).
import { createApp } from "../server/src/app";

export default createApp();
