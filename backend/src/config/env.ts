import "dotenv/config";
import { z } from "zod";

// ---------------------------------------------------------------------------
// CORS_ORIGIN validation
// Accepts a comma-separated list of exact-match origins.
// In production the variable MUST be set and non-empty; the server refuses to
// start otherwise (fail CLOSED — never reflect arbitrary Origin headers).
// ---------------------------------------------------------------------------
const corsOriginSchema = z
  .string()
  .optional()
  .superRefine((val, ctx) => {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction && (!val || val.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "CORS_ORIGIN must be set in production. " +
          "Refusing to start with a permissive CORS configuration.",
      });
    }
  })
  .transform((val) => {
    if (!val || val.trim() === "") {
      // Development/test fallback — local only, never wildcards.
      return ["http://localhost:8080"];
    }
    return val
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional().default(""),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: corsOriginSchema,
  // Email delivery. Absent key => email notifications are marked failed
  // with a stated reason rather than silently dropped.
  RESEND_API_KEY: z.string().optional().default(""),
  NOTIFICATION_FROM_EMAIL: z.string().default("Samadhan <onboarding@resend.dev>"),
  // Seeded/dev users live on @samadhan.gov.in, a domain we don't own — Resend
  // will reject sends to it. In non-production, set this to a real address
  // you've verified with Resend and every outbound email redirects there.
  DEV_EMAIL_OVERRIDE: z.string().optional().default(""),
  // A deadline passing by seconds is not worth paging anyone over — the
  // sweep ignores work orders until they are this far past due.
  SLA_GRACE_MINUTES: z.coerce.number().int().min(0).default(15),
  // Above this many alerts for one recipient in a single sweep, send one
  // digest instead of flooding their bell with near-identical rows.
  SLA_DIGEST_THRESHOLD: z.coerce.number().int().min(1).default(3),
  // AI layer. Both optional: with neither key set every AI field stays null
  // and the platform behaves exactly as it did before Phase 5.
  GEMINI_API_KEY: z.string().optional().default(""),
  GROQ_API_KEY: z.string().optional().default(""),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20000),
  // Model ids are env-overridable: providers retire model names on their own
  // schedule and that should not require a code change.
  GEMINI_MODEL: z.string().default("gemini-3.7-flash"),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  /// Below this, a coordination plan is suggested rather than auto-applied.
  AI_PLAN_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  // Escape hatch for running the API without background workers.
  DISABLE_JOBS: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
