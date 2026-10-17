import express from "express";
import { createAiClient, type AiClient } from "./ai/client";
import { createModelRegistry, type ModelRegistry } from "./ai/models";
import { connectToDatabase } from "./db/mongo-client";
import { createTurnstileVerifier, type VerifyHuman } from "./http/botcheck";
import { errorHandler, HttpError } from "./http/errors";
import { apiSecurityHeaders } from "./http/security";
import type { ModelOption } from "./interview/schemas";
import { createInterviewService } from "./interview/service";
import { interviewsRouter } from "./routes/interviews";
import { setupRouter } from "./routes/setup";
import { createTavilyClient, type SearchClient } from "./research/search";
import { budgetFromEnv, type Budget } from "./usage/meter";

export type AppOptions = {
  registry?: ModelRegistry;
  ai?: AiClient;
  /** Web search for role briefings; null disables research. */
  search?: SearchClient | null;
  budget?: Budget;
  /** Bot check for starting new work; null disables it. Defaults to Turnstile when configured. */
  verifyHuman?: VerifyHuman | null;
  now?: () => Date;
  /** Skips connecting on each request (tests manage their own connection). */
  connect?: () => Promise<unknown>;
};

export function createApp(options: AppOptions = {}) {
  const registry = options.registry ?? createModelRegistry();
  const ai = options.ai ?? createAiClient(registry);
  const budget = options.budget ?? budgetFromEnv();
  const verifyHuman = options.verifyHuman === undefined ? createTurnstileVerifier() : options.verifyHuman;
  const search = options.search === undefined ? createTavilyClient() : options.search;
  const connect = options.connect ?? connectToDatabase;
  const service = createInterviewService({ ai, registry, now: options.now });

  const app = express();
  app.disable("x-powered-by");
  // No CORS: the site and the API share one origin, so other sites' pages can't call the API.
  app.use(apiSecurityHeaders);
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
  api.use("/setup", setupRouter({ ai, registry, budget, search, verifyHuman, now: options.now }));
  api.use("/interviews", interviewsRouter({ service, budget, verifyHuman, now: options.now }));
  api.use(() => {
    throw new HttpError(404, "NOT_FOUND", "Not found");
  });

  app.use("/api", api);
  app.use(errorHandler);
  return app;
}
