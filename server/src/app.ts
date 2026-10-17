import cors from "cors";
import express from "express";
import { createAiClient, type AiClient } from "./ai/client";
import { createModelRegistry, type ModelRegistry } from "./ai/models";
import { connectToDatabase } from "./db/mongo-client";
import { errorHandler, HttpError } from "./http/errors";
import type { ModelOption } from "./interview/schemas";
import { createInterviewService } from "./interview/service";
import { interviewsRouter } from "./routes/interviews";
import { setupRouter } from "./routes/setup";
import { createTavilyClient, type SearchClient } from "./research/search";
import { DEFAULT_LIMITS, type Limits } from "./usage/limits";

export type AppOptions = {
  registry?: ModelRegistry;
  ai?: AiClient;
  /** Web search for role briefings; null disables research. */
  search?: SearchClient | null;
  limits?: Limits;
  now?: () => Date;
  /** Skips connecting on each request (tests manage their own connection). */
  connect?: () => Promise<unknown>;
};

export function createApp(options: AppOptions = {}) {
  const registry = options.registry ?? createModelRegistry();
  const ai = options.ai ?? createAiClient(registry);
  const limits = options.limits ?? DEFAULT_LIMITS;
  const search = options.search === undefined ? createTavilyClient() : options.search;
  const connect = options.connect ?? connectToDatabase;
  const service = createInterviewService({ ai, registry, now: options.now });

  const app = express();
  // On Vercel the client IP arrives in X-Forwarded-For; rate limits key on it.
  if (process.env.VERCEL) app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json({ limit: "200kb" }));

  const api = express.Router();
  api.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  api.get("/models", (_req, res) => {
    const defaultId = registry.defaultModel()?.id;
    const models: ModelOption[] = registry.available().map((model) => {
      const provider = registry.provider(model.provider);
      return {
        id: model.id,
        label: model.label,
        provider: provider.label,
        note: model.note,
        mayTrainOnInputs: provider.mayTrainOnInputs,
        isDefault: model.id === defaultId,
      };
    });
    res.json({ models });
  });

  api.use(async (_req, _res, next) => {
    await connect();
    next();
  });
  api.use("/setup", setupRouter({ ai, registry, limits, search }));
  api.use("/interviews", interviewsRouter({ service, limits }));
  api.use(() => {
    throw new HttpError(404, "NOT_FOUND", "Not found");
  });

  app.use("/api", api);
  app.use(errorHandler);
  return app;
}
