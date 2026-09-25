import { z } from "zod";

/**
 * The single shape every AI call in the platform goes through.
 *
 * Callers describe *what* they want, never *who* answers it. That is what
 * lets Gemini fail over to Groq without a second code path, and what lets
 * the whole layer degrade to nulls when no key is configured.
 */

export interface ImageInput {
  /** Publicly reachable URL; the provider adapter fetches and inlines it. */
  url: string;
}

export interface CompletionRequest {
  /** Groups calls in the ai_calls table, e.g. "decompose", "photo_match". */
  kind: string;
  /** Versioned prompt id, e.g. "decompose@v1". */
  promptVersion: string;
  system: string;
  user: string;
  /** Present => the call needs vision, which restricts it to Gemini. */
  images?: ImageInput[];
  /** JSON Schema the provider is asked to conform to. */
  jsonSchema: Record<string, unknown>;
  /** For the ai_calls audit row. */
  entityType?: string;
  entityId?: string;
}

export interface CompletionResult<T> {
  data: T;
  provider: string;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  outputTokens?: number;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** False when the key is absent, so the router can skip it silently. */
  isConfigured(): boolean;
  supportsVision(): boolean;
  /** Must return parsed JSON or throw. Never returns partially-valid data. */
  complete(
    req: CompletionRequest,
    signal: AbortSignal
  ): Promise<{
    raw: unknown;
    promptTokens?: number;
    outputTokens?: number;
  }>;
}

/** Thrown when every configured provider failed. Callers degrade, not crash. */
export class AllProvidersFailedError extends Error {
  constructor(public readonly attempts: { provider: string; error: string }[]) {
    super(`All AI providers failed: ${attempts.map((a) => `${a.provider} (${a.error})`).join("; ")}`);
    this.name = "AllProvidersFailedError";
  }
}

/**
 * Parses a provider response against a Zod schema.
 *
 * Providers are asked for structured output, but "asked" is not "guaranteed" —
 * a model can still return a JSON string, or wrap the object in prose. We
 * accept a string by JSON.parse only; there is deliberately no regex
 * scraping, because a regex that half-matches produces confident nonsense.
 */
export function parseStrict<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return schema.parse(value);
}
