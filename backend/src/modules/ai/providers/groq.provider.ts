import Groq from "groq-sdk";
import { env } from "../../../config/env.js";
import { AiProvider, CompletionRequest } from "./types.js";

/**
 * Fallback provider, and the deliberate primary for decomposition — Groq
 * answers fast enough that the coordination plan appears while someone is
 * still looking at the screen.
 *
 * The exact id comes from GROQ_MODEL. Llama 4 Scout, originally targeted here,
 * is not served on this account, so the default is the current Llama
 * instruct model.
 *
 * Text only. The router will not hand it a request carrying images.
 */

const MODEL = env.GROQ_MODEL;

let client: Groq | null = null;
function getClient(): Groq {
  if (!client) client = new Groq({ apiKey: env.GROQ_API_KEY });
  return client;
}

export const groqProvider: AiProvider = {
  name: "groq",
  get model() {
    return MODEL;
  },

  isConfigured() {
    return env.GROQ_API_KEY.length > 0;
  },

  supportsVision() {
    return false;
  },

  async complete(req: CompletionRequest, signal: AbortSignal) {
    // Groq's json_object mode guarantees syntactically valid JSON but not the
    // shape, so the schema goes in the prompt and Zod enforces it after.
    const res = await getClient().chat.completions.create(
      {
        model: MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${req.system}\n\nRespond with JSON matching exactly this schema:\n${JSON.stringify(
              req.jsonSchema
            )}`,
          },
          { role: "user", content: req.user },
        ],
      },
      { signal }
    );

    return {
      raw: res.choices[0]?.message?.content ?? "",
      promptTokens: res.usage?.prompt_tokens,
      outputTokens: res.usage?.completion_tokens,
    };
  },
};
