// Vercel serverless entry point: every /api/* request is rewritten here (see vercel.json).
import { createApp, toNodeHandler } from "../server/src/app";

export default toNodeHandler(createApp());
