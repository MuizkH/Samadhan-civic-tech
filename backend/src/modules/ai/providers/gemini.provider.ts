import { GoogleGenAI } from "@google/genai";
import { env } from "../../../config/env.js";
import { AiProvider, CompletionRequest } from "./types.js";

/**
 * Primary provider. A Gemini Flash model handles vision and text and accepts a
 * response schema, so structured output is enforced by the API rather than by
 * hoping the model complies.
 *
 * The exact id comes from GEMINI_MODEL. gemini-2.5-flash, which this project
 * originally targeted, is closed to new API keys, so the default tracks a
 * current Flash release instead.
 */

const MODEL = env.GEMINI_MODEL;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

/**
 * Resolves an image reference to an inline base64 part for the Gemini SDK.
 * Accepts either:
 *   - A remote URL  (e.g. Cloudinary CDN link)
 *   - A data: URI   (e.g. data:image/jpeg;base64,/9j/4AAQ…)
 */
async function fetchImagePart(url: string, signal: AbortSignal) {
  // Inline base64 path — no network call needed.
  if (url.startsWith("data:")) {
    const [header, data] = url.split(",", 2);
    const mimeType = header.replace("data:", "").replace(";base64", "");
    return { inlineData: { mimeType, data } };
  }

  // Remote URL path — fetch and convert.
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`image fetch ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  return { inlineData: { mimeType, data: buf.toString("base64") } };
}

export const geminiProvider: AiProvider = {
  name: "gemini",
  get model() {
    return MODEL;
  },

  isConfigured() {
    return env.GEMINI_API_KEY.length > 0;
  },

  supportsVision() {
    return true;
  },

  async complete(req: CompletionRequest, signal: AbortSignal) {
    const parts: unknown[] = [{ text: req.user }];
    for (const img of req.images ?? []) {
      parts.push(await fetchImagePart(img.url, signal));
    }

    const modelsToTry = [MODEL, "gemini-3.6-flash"].filter((m, idx, arr) => arr.indexOf(m) === idx);

    let lastErr: unknown;
    for (const modelName of modelsToTry) {
      try {
        const res = await getClient().models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts }] as never,
          config: {
            systemInstruction: req.system,
            responseMimeType: "application/json",
            responseSchema: req.jsonSchema as never,
            temperature: 0.1,
            abortSignal: signal,
          } as never,
        });

        const usage = (
          res as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
        ).usageMetadata;

        return {
          raw: res.text,
          promptTokens: usage?.promptTokenCount,
          outputTokens: usage?.candidatesTokenCount,
        };
      } catch (err: unknown) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        // If 503 (high demand) or 429 (rate limit), try next fallback model
        if (
          msg.includes("503") ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("429") ||
          msg.includes("high demand")
        ) {
          continue;
        }
        throw err;
      }
    }

    throw lastErr;
  },
};
