import { z } from "zod";
import { prisma } from "../../../shared/lib/prisma.js";
import { logger } from "../../../shared/lib/logger.js";
import { env } from "../../../config/env.js";
import { geminiProvider } from "./gemini.provider.js";
import { groqProvider } from "./groq.provider.js";
import {
  AiProvider,
  CompletionRequest,
  CompletionResult,
  AllProvidersFailedError,
  parseStrict,
} from "./types.js";

export * from "./types.js";

/**
 * The only entry point for AI in this codebase.
 *
 * Ordering: Gemini first for anything with an image (Groq has no vision), and
 * for text the caller can ask to prefer Groq for latency. Whichever runs
 * first, the other is tried on failure — one code path, no per-feature
 * branching.
 *
 * Every attempt writes an ai_calls row, including failures, so the demo
 * metrics and any later audit see what actually happened rather than only
 * the successes.
 */

const RETRIES_PER_PROVIDER = 1;

function orderProviders(req: CompletionRequest, preferFast: boolean): AiProvider[] {
  const all: AiProvider[] = preferFast ? [groqProvider, geminiProvider] : [geminiProvider, groqProvider];
  const needsVision = (req.images?.length ?? 0) > 0;
  return all.filter((p) => p.isConfigured() && (!needsVision || p.supportsVision()));
}

async function recordCall(row: {
  kind: string;
  provider: string;
  model: string;
  promptVersion: string;
  entityType?: string;
  entityId?: string;
  latencyMs: number;
  promptTokens?: number;
  outputTokens?: number;
  ok: boolean;
  error?: string;
}) {
  try {
    await prisma.aiCall.create({
      data: {
        kind: row.kind,
        provider: row.provider,
        model: row.model,
        promptVersion: row.promptVersion,
        entityType: row.entityType ?? null,
        entityId: row.entityId ?? null,
        latencyMs: row.latencyMs,
        promptTokens: row.promptTokens ?? null,
        outputTokens: row.outputTokens ?? null,
        ok: row.ok,
        error: row.error?.slice(0, 500) ?? null,
      },
    });
  } catch (err) {
    // Telemetry must never be the reason a feature fails.
    logger.warn({ err }, "Failed to record ai_call");
  }
}

const backoff = (attempt: number) => new Promise((r) => setTimeout(r, 300 * 2 ** attempt));

/**
 * Runs a request through the provider chain and validates the result.
 *
 * Throws AllProvidersFailedError only when every configured provider failed;
 * callers treat that as "leave the AI fields null" rather than as an error
 * worth failing the surrounding operation over.
 */
export async function complete<T>(
  req: CompletionRequest,
  // ZodTypeAny-shaped so T binds to the schema OUTPUT; .default() makes
  // input and output differ and T would otherwise infer the input.
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  opts: { preferFast?: boolean } = {}
): Promise<CompletionResult<T>> {
  const providers = orderProviders(req, opts.preferFast ?? false);
  const attempts: { provider: string; error: string }[] = [];

  for (const provider of providers) {
    for (let attempt = 0; attempt <= RETRIES_PER_PROVIDER; attempt++) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

      try {
        const out = await provider.complete(req, controller.signal);
        const data = parseStrict(schema, out.raw);
        const latencyMs = Date.now() - started;

        await recordCall({
          kind: req.kind,
          provider: provider.name,
          model: provider.model,
          promptVersion: req.promptVersion,
          entityType: req.entityType,
          entityId: req.entityId,
          latencyMs,
          promptTokens: out.promptTokens,
          outputTokens: out.outputTokens,
          ok: true,
        });

        return {
          data,
          provider: provider.name,
          model: provider.model,
          latencyMs,
          promptTokens: out.promptTokens,
          outputTokens: out.outputTokens,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await recordCall({
          kind: req.kind,
          provider: provider.name,
          model: provider.model,
          promptVersion: req.promptVersion,
          entityType: req.entityType,
          entityId: req.entityId,
          latencyMs: Date.now() - started,
          ok: false,
          error: message,
        });
        attempts.push({ provider: provider.name, error: message });
        logger.warn({ provider: provider.name, kind: req.kind, attempt, err: message }, "AI attempt failed");

        if (attempt < RETRIES_PER_PROVIDER) await backoff(attempt);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  throw new AllProvidersFailedError(attempts);
}

/** True when at least one provider has a key. Used to skip work entirely. */
export function aiEnabled(): boolean {
  return geminiProvider.isConfigured() || groqProvider.isConfigured();
}

export function visionEnabled(): boolean {
  return geminiProvider.isConfigured();
}
