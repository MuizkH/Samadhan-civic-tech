import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { prisma } from "../../shared/lib/prisma.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate, optionalAuthenticate } from "../../shared/middleware/authenticate.js";
import { uuidParam } from "../../shared/schemas/common.js";
import { writeAuditLog } from "../../shared/lib/auditLog.js";
import { ForbiddenError } from "../../shared/errors/AppError.js";
import { isAdministrator } from "../../shared/middleware/rbac.js";
import { decompositionService } from "./decomposition.service.js";
import { categoriseService } from "./categorise.service.js";
import { hotspotsService } from "./hotspots.service.js";
import { visionService } from "./vision.service.js";
import { formAnalyzerService } from "./form-analyzer.service.js";
import { aiEnabled, visionEnabled, complete } from "./providers/index.js";
import {
  CIVIC_CHAT_VERSION,
  CIVIC_CHAT_SYSTEM,
  CIVIC_CHAT_JSON_SCHEMA,
  civicChatSchema,
} from "./prompts/index.js";

export const aiRouter = Router();

/**
 * Multer memory-storage for form image uploads.
 * Files are held in RAM only for the duration of the Gemini call — nothing is
 * written to disk or persisted anywhere.
 * 10 MB limit matches the frontend validation.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP, or PDF files are accepted"));
    }
  },
});

/** Lets the UI hide AI affordances instead of showing dead controls. */
aiRouter.get("/status", async (_req, res) => {
  res.json({ enabled: aiEnabled(), vision: visionEnabled() });
});

// ── Coordination plans ─────────────────────────────────────────────────────

/** The rationale behind an issue's routing. Read by the admin panel. */
aiRouter.get(
  "/issues/:id/coordination-plan",
  optionalAuthenticate,
  validate(uuidParam("id"), "params"),
  async (req, res, next) => {
    try {
      res.json({ items: await decompositionService.forIssue(req.params.id as string) });
    } catch (err) {
      next(err);
    }
  }
);

const overrideSchema = z.object({
  action: z.enum(["apply", "reject"]),
  note: z.string().max(1000).optional(),
});

/** A human accepting or rejecting a suggested plan. Always audited. */
aiRouter.post(
  "/coordination-plans/:id/override",
  authenticate,
  validate(uuidParam("id"), "params"),
  validate(overrideSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const updated = await decompositionService.override(id, req.body, req.auth!);
      await writeAuditLog(req, {
        action: `ai.coordination_plan.${req.body.action}`,
        entityType: "coordination_plan",
        entityId: id,
        after: { action: req.body.action, note: req.body.note ?? null },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ── Category suggestion ────────────────────────────────────────────────────

const suggestSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(5000),
  imageUrl: z.string().url().optional(),
});

/**
 * Suggestion for the report form. Returns 200 with suggestion:null when AI is
 * unavailable, so the form never has to special-case an error.
 */
aiRouter.post("/suggest-category", authenticate, validate(suggestSchema), async (req, res, next) => {
  try {
    res.json({ suggestion: await categoriseService.suggest(req.body) });
  } catch (err) {
    next(err);
  }
});

// ── Metrics + review queues ────────────────────────────────────────────────

/** Suggestion-vs-citizen agreement, plus per-kind call stats for the demo. */
aiRouter.get("/metrics", authenticate, async (req, res, next) => {
  try {
    if (!isAdministrator(req.auth!.role)) {
      throw new ForbiddenError("Staff only.");
    }
    const [accuracy, calls] = await Promise.all([
      categoriseService.accuracy(),
      prisma.aiCall.groupBy({
        by: ["kind", "provider", "ok"],
        _count: { _all: true },
        _avg: { latencyMs: true },
        _sum: { promptTokens: true, outputTokens: true },
      }),
    ]);
    res.json({
      categorisation: accuracy,
      calls: calls.map((c) => ({
        kind: c.kind,
        provider: c.provider,
        ok: c.ok,
        count: c._count._all,
        avgLatencyMs: Math.round(c._avg.latencyMs ?? 0),
        promptTokens: c._sum.promptTokens ?? 0,
        outputTokens: c._sum.outputTokens ?? 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Closures the model thought were worth a second look. Advisory queue. */
aiRouter.get("/flagged-resolutions", authenticate, async (req, res, next) => {
  try {
    if (req.auth!.role !== "super_admin") throw new ForbiddenError("Super admin only.");
    res.json({ items: await visionService.flaggedResolutions() });
  } catch (err) {
    next(err);
  }
});

// ── Recurring hotspots (statistical) ───────────────────────────────────────

const hotspotQuery = z.object({
  // Default 2: a pattern needs at least two years to be a pattern. Lowerable
  // for a dataset that does not yet span multiple years.
  minYears: z.coerce.number().int().min(1).max(10).default(2),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

aiRouter.get("/hotspots/recurring", validate(hotspotQuery, "query"), async (req, res, next) => {
  try {
    const q = req.validatedQuery as z.infer<typeof hotspotQuery>;
    res.json(await hotspotsService.recurring(q));
  } catch (err) {
    next(err);
  }
});

// ── Government Form Analyzer ───────────────────────────────────────────────

/**
 * POST /ai/analyze-form
 *
 * Public endpoint — no auth required (same access level as the Form Analyzer
 * page itself, which is an unauthenticated public route).
 *
 * Accepts multipart/form-data:
 *   file     — the form image or PDF (max 10 MB; JPEG / PNG / WebP / PDF)
 *   userQuery — optional free-text question from the citizen about this form
 *
 * For PDFs the frontend rasterises page 1 to JPEG before uploading,
 * so the backend always receives an image (never a raw PDF blob).
 *
 * Returns FormAnalysisResult (see frontend aiService.ts for the TypeScript type).
 */
aiRouter.post("/analyze-form", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: { message: "No file uploaded." } });
      return;
    }

    const userQuery: string | undefined =
      typeof req.body?.userQuery === "string" && req.body.userQuery.trim()
        ? req.body.userQuery.trim()
        : undefined;

    const language: string | undefined =
      typeof req.body?.language === "string" && req.body.language.trim() ? req.body.language.trim() : "hi";

    const base64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype;

    const result = await formAnalyzerService.analyze({ base64, mimeType, userQuery, language });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── Text To Speech (TTS) ───────────────────────────────────────────────────

/**
 * POST /ai/tts
 * Generates natural Hindi or English speech audio (MP3).
 * Solves the missing Hindi voice problem on client operating systems by
 * streaming authentic, natural Hindi audio directly to the browser.
 */
aiRouter.post("/tts", async (req, res, next) => {
  try {
    const text: string = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const lang: string = typeof req.body?.lang === "string" && req.body.lang === "en" ? "en" : "hi";

    if (!text) {
      res.status(400).json({ error: { message: "Text is required." } });
      return;
    }

    // Split text into chunks of at most 180 chars on sentence/word boundaries
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= 180) {
        chunks.push(remaining);
        break;
      }
      let splitIdx = remaining.lastIndexOf("।", 180);
      if (splitIdx === -1) splitIdx = remaining.lastIndexOf(".", 180);
      if (splitIdx === -1) splitIdx = remaining.lastIndexOf(" ", 180);
      if (splitIdx === -1) splitIdx = 180;
      chunks.push(remaining.slice(0, splitIdx + 1).trim());
      remaining = remaining.slice(splitIdx + 1).trim();
    }

    const targetChunks = chunks.slice(0, 5);
    const audioPromises = targetChunks.map(async (chunk) => {
      if (!chunk) return null;
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
      try {
        const audioRes = await fetch(ttsUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        if (audioRes.ok) {
          return Buffer.from(await audioRes.arrayBuffer());
        }
      } catch {
        return null;
      }
      return null;
    });

    const results = await Promise.all(audioPromises);
    const audioBuffers: Buffer[] = [];
    for (const b of results) {
      if (b) audioBuffers.push(b);
    }

    if (audioBuffers.length === 0) {
      res.status(502).json({ error: { message: "Could not generate speech audio." } });
      return;
    }

    const fullAudio = Buffer.concat(audioBuffers);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", fullAudio.length);
    res.send(fullAudio);
  } catch (err) {
    next(err);
  }
});

// ── Civic AI Chat ─────────────────────────────────────────────────────────

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const chatSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
  language: z.string().optional(),
});

aiRouter.post("/chat", async (req, res, next) => {
  try {
    const { messages, language } = chatSchema.parse(req.body);
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const lang = language === "hi" ? "hi" : "en";

    if (aiEnabled()) {
      try {
        const historyText = messages
          .slice(-6)
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n");

        const result = await complete(
          {
            kind: "civic_chat",
            promptVersion: CIVIC_CHAT_VERSION,
            system: CIVIC_CHAT_SYSTEM,
            user: `Language preference: ${lang === "hi" ? "Hindi/Hinglish" : "English"}\n\nConversation history:\n${historyText}\n\nUser Question: ${lastUserMsg}`,
            jsonSchema: CIVIC_CHAT_JSON_SCHEMA,
          },
          civicChatSchema,
          { preferFast: true }
        );

        res.json({ reply: result.data.reply });
        return;
      } catch (_aiErr) {
        // Fallback to intelligent local response on provider outage
      }
    }

    // Smart Local Fallback Assistant
    let reply = "";
    const lower = lastUserMsg.toLowerCase();

    if (lower.includes("document") || lower.includes("दस्तावेज़") || lower.includes("कागज़")) {
      reply =
        lang === "hi"
          ? "📋 **सामान्य आवश्यक दस्तावेज़ (Required Documents):**\n1. आधार कार्ड (Aadhaar Card)\n2. निवास प्रमाण पत्र (Proof of Residence / Address Proof)\n3. आय प्रमाण पत्र (Income Certificate - यदि लागू हो)\n4. हाल की पासपोर्ट फोटो (Recent Passport Photo)\n5. बैंक पासबुक की प्रति (Bank Passbook Copy)"
          : "📋 **Standard Required Documents:**\n1. Aadhaar Card / Identity Proof\n2. Proof of Residence (Voter ID, Utility Bill, Electricity Bill)\n3. Income Certificate (if applying for means-tested schemes)\n4. Passport-sized Photographs\n5. Bank Passbook Copy (for direct benefit transfer)";
    } else if (lower.includes("mandatory") || lower.includes("जरूरी") || lower.includes("आवश्यक")) {
      reply =
        lang === "hi"
          ? "⚠️ **अनिवार्य फ़ील्ड (Mandatory Fields):**\n- आवेदक का पूरा नाम (Full Name)\n- आधार नंबर / पहचान संख्या (Aadhaar Number)\n- मोबाइल नंबर (Mobile Number)\n- स्थायी पता (Permanent Address)\n- बैंक खाता विवरण (Bank Details)"
          : "⚠️ **Mandatory Fields:**\n- Full Name of Applicant\n- Aadhaar Number / National ID\n- Active Mobile Number\n- Residential Address\n- Bank Account & IFSC Code";
    } else if (lower.includes("eligible") || lower.includes("पात्र") || lower.includes("योग्यता")) {
      reply =
        lang === "hi"
          ? "✅ **पात्रता मानदंड (Eligibility Criteria):**\n- आवेदक भारत का नागरिक होना चाहिए।\n- आयु और आय सीमा योजना के अनुसार (उदा. EWS के लिए ₹8 लाख/वर्ष से कम)।\n- सभी आवश्यक दस्तावेज़ सही और सत्यापित होने चाहिए।"
          : "✅ **General Eligibility Criteria:**\n- Must be an Indian citizen / resident of the respective state.\n- Meets age and annual income thresholds (e.g. < ₹8 Lakh/year for EWS).\n- Valid identity proof and verified bank account.";
    } else if (lower.includes("deadline") || lower.includes("अंतिम तिथि") || lower.includes("लास्ट डेट")) {
      reply =
        lang === "hi"
          ? "📅 **आवेदन की अंतिम तिथि (Submission Deadline):**\nसरकारी योजनाओं की अंतिम तिथि विभाग द्वारा तय की जाती है। यदि आप फॉर्म अपलोड करते हैं, तो Samadhan AI फॉर्म से सटीक अंतिम तिथि निकालकर बता देता है!"
          : "📅 **Submission Deadline:**\nDeadlines depend on the specific scheme or municipal order. You can also upload your application form in the Form Analyzer section, and Samadhan AI will automatically scan and display the deadline!";
    } else {
      reply =
        lang === "hi"
          ? `नमस्कार! समाधान AI नागरिक सहायक में आपका स्वागत है। आपने पूछा: "${lastUserMsg}".\n\nमैं आपकी सरकारी योजनाओं, आवश्यक दस्तावेज़ों, आवेदन प्रक्रियाओं तथा नगर निगम समस्याओं (सड़क, पानी, बिजली) में सहायता कर सकता हूँ। आप अपना फॉर्म ऊपर अपलोड करके भी संपूर्ण विवरण प्राप्त कर सकते हैं!`
          : `Hello! Welcome to Samadhan AI Civic Assistant. Regarding: "${lastUserMsg}".\n\nI can guide you through government schemes, document requirements, eligibility, and municipal issue tracking. You can also upload any government application form above for automated AI analysis!`;
    }

    res.json({ reply });
  } catch (err) {
    next(err);
  }
});
