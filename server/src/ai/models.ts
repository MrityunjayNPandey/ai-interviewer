// The models a candidate can choose from. Free model line-ups change every few months:
// to swap a model, edit this file. A model is offered only when its provider's API key is set.

export type ProviderId = "groq" | "mistral" | "gemini" | "openrouter";

export type Provider = {
  id: ProviderId;
  label: string;
  baseURL: string;
  apiKeyEnv: string;
  /** The provider's free tier may use prompts to train or improve models. */
  mayTrainOnInputs: boolean;
};

export type ModelConfig = {
  /** Stable id stored on interviews: "<provider>:<provider model id>". */
  id: string;
  provider: ProviderId;
  /** The id the provider's API expects. */
  model: string;
  label: string;
  note: string;
  /** Provider-specific request parameters (e.g. reasoning effort). */
  params?: Record<string, unknown>;
  /**
   * Daily tokens this app may use on the model: set it a little under the provider's free daily quota,
   * so the model is refused here (and the candidate can switch) instead of failing at the provider.
   * Unset when the provider limits requests rather than tokens (Mistral, Gemini, OpenRouter).
   */
  dailyTokens?: number;
};

export const PROVIDERS: Record<ProviderId, Provider> = {
  groq: {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    mayTrainOnInputs: false,
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    apiKeyEnv: "MISTRAL_API_KEY",
    mayTrainOnInputs: true,
  },
  gemini: {
    // Google's free tier is not available for apps serving users in the EEA, UK or Switzerland.
    id: "gemini",
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKeyEnv: "GEMINI_API_KEY",
    mayTrainOnInputs: true,
  },
  openrouter: {
    // Free models share a small daily request cap across the whole app.
    id: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    mayTrainOnInputs: true,
  },
};

export const MODELS: ModelConfig[] = [
  {
    id: "groq:openai/gpt-oss-120b",
    provider: "groq",
    model: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    note: "Best quality",
    params: { reasoning_effort: "low" },
    dailyTokens: 190_000, // Groq free tier: 200K tokens a day per model
  },
  {
    id: "groq:qwen/qwen3.8-27b",
    provider: "groq",
    model: "qwen/qwen3.8-27b",
    label: "Qwen 3.8 27B",
    note: "Fast",
    params: { reasoning_effort: "none" },
    dailyTokens: 190_000, // Groq free tier: 200K tokens a day per model
  },
  {
    id: "groq:openai/gpt-oss-20b",
    provider: "groq",
    model: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    note: "Lightweight",
    params: { reasoning_effort: "low" },
    dailyTokens: 190_000, // Groq free tier: 200K tokens a day per model
  },
  {
    id: "mistral:mistral-small-latest",
    provider: "mistral",
    model: "mistral-small-latest",
    label: "Mistral Small",
    note: "Balanced",
  },
  {
    id: "gemini:gemini-3.5-flash-lite",
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    note: "Fast, long context",
  },
  {
    id: "openrouter:nvidia/nemotron-3-super-120b-a12b:free",
    provider: "openrouter",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super",
    note: "Strong reasoning, low daily limit",
  },
  {
    id: "openrouter:google/gemma-4-31b-it:free",
    provider: "openrouter",
    model: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B",
    note: "Long context, low daily limit",
  },
];

/** Default for new interviews, and the fixed model used to parse resumes and job descriptions. */
export const DEFAULT_MODEL_ID = "groq:openai/gpt-oss-120b";

export type ModelRegistry = {
  available(): ModelConfig[];
  /** Returns the model if it exists and its provider is configured. */
  find(id: string): ModelConfig | undefined;
  defaultModel(): ModelConfig | undefined;
  /** The model used for parsing: PARSE_MODEL if set, else the default. */
  parseModel(): ModelConfig | undefined;
  provider(id: ProviderId): Provider;
};

export function createModelRegistry(
  env: NodeJS.ProcessEnv = process.env,
  models: ModelConfig[] = MODELS
): ModelRegistry {
  const isConfigured = (model: ModelConfig) => Boolean(env[PROVIDERS[model.provider].apiKeyEnv]);
  const available = () => models.filter(isConfigured);
  const find = (id: string) => available().find((model) => model.id === id);
  const defaultModel = () => find(DEFAULT_MODEL_ID) ?? available()[0];

  return {
    available,
    find,
    defaultModel,
    parseModel: () => (env.PARSE_MODEL && find(env.PARSE_MODEL)) || defaultModel(),
    provider: (id) => PROVIDERS[id],
  };
}
