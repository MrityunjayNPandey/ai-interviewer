import { APIConnectionError, APIError, OpenAI } from "openai";
import type { ZodType } from "zod";
import type { ModelConfig, ModelRegistry, ProviderId } from "./models";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Receives the tokens (prompt + completion) each provider call used. */
export type OnTokens = (count: number) => Promise<void>;

/** The only seam between the app and AI providers; tests substitute a scripted fake. */
export interface AiClient {
  /** Streams a plain-text completion, yielding text deltas. Reports its tokens once the stream ends. */
  stream(model: ModelConfig, messages: ChatMessage[], onTokens?: OnTokens): AsyncIterable<string>;
  /** Returns a JSON completion validated against `schema`. Reports the tokens of each provider call. */
  json<T>(model: ModelConfig, messages: ChatMessage[], schema: ZodType<T>, onTokens?: OnTokens): Promise<T>;
}

/** The provider failed, rate-limited us, or returned unusable output. The candidate can retry or switch models. */
export class AiUnavailableError extends Error {
  constructor(
    readonly modelId: string,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}

function describeFailure(model: ModelConfig, error: unknown): AiUnavailableError {
  if (error instanceof AiUnavailableError) return error;
  let reason = "is unavailable right now";
  if (error instanceof APIError && error.status === 429) reason = "has hit its rate limit";
  else if (error instanceof APIConnectionError) reason = "could not be reached";
  return new AiUnavailableError(model.id, `${model.label} ${reason}. Try again, or switch to another model.`, {
    cause: error,
  });
}

/** Strips a ```json fence some models wrap around JSON even in JSON mode. */
function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

/** For providers that don't report usage: roughly four characters per token. */
export function estimateTokens(messages: ChatMessage[], output: string): number {
  const chars = messages.reduce((sum, message) => sum + message.content.length, 0) + output.length;
  return Math.ceil(chars / 4);
}

export function createAiClient(registry: ModelRegistry, env: NodeJS.ProcessEnv = process.env): AiClient {
  const clients = new Map<ProviderId, OpenAI>();

  const clientFor = (model: ModelConfig) => {
    let client = clients.get(model.provider);
    if (!client) {
      const provider = registry.provider(model.provider);
      client = new OpenAI({
        baseURL: provider.baseURL,
        apiKey: env[provider.apiKeyEnv],
        maxRetries: 1,
        timeout: 60_000,
      });
      clients.set(model.provider, client);
    }
    return client;
  };

  return {
    async *stream(model, messages, onTokens) {
      let text = "";
      let reported: number | undefined;
      try {
        const stream = await clientFor(model).chat.completions.create({
          ...model.params,
          model: model.model,
          messages,
          temperature: 0.7,
          stream: true,
          stream_options: { include_usage: true },
        });
        for await (const chunk of stream) {
          if (chunk.usage) reported = chunk.usage.total_tokens;
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            text += delta;
            yield delta;
          }
        }
      } catch (error) {
        throw describeFailure(model, error);
      }
      await onTokens?.(reported ?? estimateTokens(messages, text));
    },

    async json(model, messages, schema, onTokens) {
      let attempt: ChatMessage[] = messages;
      // One repair round: if the output doesn't validate, show the model its mistake.
      for (let round = 0; round < 2; round++) {
        let content: string;
        let reported: number | undefined;
        try {
          const response = await clientFor(model).chat.completions.create({
            ...model.params,
            model: model.model,
            messages: attempt,
            temperature: 0.2,
            response_format: { type: "json_object" },
          });
          content = response.choices[0]?.message?.content ?? "";
          reported = response.usage?.total_tokens;
        } catch (error) {
          throw describeFailure(model, error);
        }
        await onTokens?.(reported ?? estimateTokens(attempt, content));

        let problem: string;
        try {
          const parsed = schema.safeParse(extractJson(content));
          if (parsed.success) return parsed.data;
          problem = parsed.error.issues
            .slice(0, 5)
            .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
            .join("; ");
        } catch {
          problem = "the response was not valid JSON";
        }
        attempt = [
          ...messages,
          { role: "assistant", content },
          { role: "user", content: `That JSON was invalid (${problem}). Reply with corrected JSON only.` },
        ];
      }
      throw new AiUnavailableError(model.id, `${model.label} returned an unusable response. Try again, or switch to another model.`);
    },
  };
}
