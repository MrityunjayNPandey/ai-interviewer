import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createAccountService } from "./account/service";
import { createAiClient, type AiClient } from "./ai/client";
import { createModelRegistry, type ModelRegistry } from "./ai/models";
import { connectToDatabase } from "./db/mongo-client";
import { createTurnstileVerifier, type VerifyHuman } from "./http/botcheck";
import { errorHandler } from "./http/errors";
import { apiSecurityHeaders } from "./http/security";
import type { ModelOption } from "./interview/schemas";
import { createInterviewService } from "./interview/service";
import { accountRoutes } from "./routes/account";
import { interviewRoutes } from "./routes/interviews";
import { setupRoutes } from "./routes/setup";
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

export function createApp(options: AppOptions = {}): FastifyInstance {
  const registry = options.registry ?? createModelRegistry();
  const ai = options.ai ?? createAiClient(registry);
  const budget = options.budget ?? budgetFromEnv();
  const verifyHuman = options.verifyHuman === undefined ? createTurnstileVerifier() : options.verifyHuman;
  const search = options.search === undefined ? createTavilyClient() : options.search;
  const connect = options.connect ?? connectToDatabase;
  const service = createInterviewService({ ai, registry, now: options.now });
  const account = createAccountService({ now: options.now });

  // No CORS: the site and the API share one origin, so other sites' pages can't call the API.
  // trustProxy stays off: the client IP is read from Vercel's own header (see clientIp).
  const app = Fastify({ bodyLimit: 200 * 1024 });
  app.register(cookie);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ code: "NOT_FOUND", message: "Not found" });
  });
  app.addHook("onRequest", apiSecurityHeaders);

  app.register(
    async (api) => {
      api.get("/health", async () => ({ ok: true }));
      api.get("/models", async () => {
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
        return { models };
      });

      // Everything below needs the database.
      api.register(async (db) => {
        db.addHook("onRequest", async () => {
          await connect();
        });
        db.register(setupRoutes, { prefix: "/setup", ai, registry, budget, search, verifyHuman, now: options.now });
        db.register(interviewRoutes, { prefix: "/interviews", service, budget, verifyHuman, now: options.now });
        db.register(accountRoutes, { prefix: "/account", account, verifyHuman });
      });
    },
    { prefix: "/api" }
  );

  return app;
}

/** Adapts the app to a plain Node request handler (Vercel functions, tests). */
export function toNodeHandler(app: FastifyInstance) {
  const ready = app.ready();
  return async (request: IncomingMessage, response: ServerResponse) => {
    await ready;
    app.server.emit("request", request, response);
  };
}


