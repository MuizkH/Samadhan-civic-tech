import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/lib/prisma.js";
import { logger } from "../../shared/lib/logger.js";
import { complete, visionEnabled } from "./providers/index.js";
import {
  PHOTO_MATCH_SYSTEM,
  PHOTO_MATCH_JSON_SCHEMA,
  PHOTO_MATCH_VERSION,
  photoMatchUser,
  photoMatchSchema,
  RESOLUTION_PROOF_SYSTEM,
  RESOLUTION_PROOF_JSON_SCHEMA,
  RESOLUTION_PROOF_VERSION,
  resolutionProofUser,
  resolutionProofSchema,
} from "./prompts/index.js";

/**
 * Image checks. Both are advisory and neither can block a citizen or a
 * department: a wrong answer here must cost someone a second look, never a
 * rejected report or a blocked resolution.
 *
 * Vision means Gemini; Groq has none, so with only a Groq key configured
 * these silently no-op and the fields stay null.
 */

/** Below this a human should look, whichever way the model answered. */
const REVIEW_THRESHOLD = 0.55;

export const visionService = {
  /**
   * Does the evidence photo look like the category the citizen picked?
   *
   * Writes {match, confidence, detectedLabel, reason} to
   * issue_media.ai_verification. needsReview is derived rather than stored as
   * a verdict, so changing the threshold later re-reads cleanly.
   */
  async verifyEvidencePhoto(mediaId: string): Promise<void> {
    if (!visionEnabled()) return;

    const media = await prisma.issueMedia.findUnique({
      where: { id: mediaId },
      include: { issue: { select: { id: true, description: true, category: { select: { code: true } } } } },
    });
    if (!media || media.kind !== "evidence") return;

    try {
      const { data, provider, model } = await complete(
        {
          kind: "photo_match",
          promptVersion: PHOTO_MATCH_VERSION,
          system: PHOTO_MATCH_SYSTEM,
          user: photoMatchUser({
            category: media.issue.category.code,
            description: media.issue.description,
          }),
          images: [{ url: media.url }],
          jsonSchema: PHOTO_MATCH_JSON_SCHEMA,
          entityType: "issue_media",
          entityId: media.id,
        },
        photoMatchSchema
      );

      await prisma.issueMedia.update({
        where: { id: media.id },
        data: {
          aiVerification: {
            ...data,
            needsReview: !data.match || data.confidence < REVIEW_THRESHOLD,
            promptVersion: PHOTO_MATCH_VERSION,
            provider,
            model,
            checkedAt: new Date().toISOString(),
          },
        },
      });
    } catch (err) {
      logger.warn({ mediaId, err }, "Photo verification unavailable; leaving ai_verification null");
    }
  },

  /**
   * Does the resolution photo show the original problem fixed?
   *
   * Purely advisory: it runs after a resolution is already recorded and only
   * raises a flag for super_admin review. It never gates the transition.
   */
  async verifyResolutionProof(issueId: string): Promise<void> {
    if (!visionEnabled()) return;

    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        title: true,
        resolutionNote: true,
        media: {
          select: { id: true, kind: true, url: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!issue) return;

    const evidence = issue.media.find((m) => m.kind === "evidence");
    const proof = [...issue.media].reverse().find((m) => m.kind === "resolution_proof");
    if (!evidence || !proof) return;

    try {
      const { data, provider, model } = await complete(
        {
          kind: "resolution_proof",
          promptVersion: RESOLUTION_PROOF_VERSION,
          system: RESOLUTION_PROOF_SYSTEM,
          user: resolutionProofUser({
            title: issue.title,
            resolutionNote: issue.resolutionNote ?? "(no note given)",
          }),
          images: [{ url: evidence.url }, { url: proof.url }],
          jsonSchema: RESOLUTION_PROOF_JSON_SCHEMA,
          entityType: "issue",
          entityId: issue.id,
        },
        resolutionProofSchema
      );

      await prisma.issueMedia.update({
        where: { id: proof.id },
        data: {
          aiVerification: {
            ...data,
            needsReview: data.suspicious || !data.resolved || data.confidence < REVIEW_THRESHOLD,
            promptVersion: RESOLUTION_PROOF_VERSION,
            provider,
            model,
            checkedAt: new Date().toISOString(),
          },
        },
      });

      if (data.suspicious) {
        logger.warn({ issueId, reason: data.reason }, "Resolution proof flagged as suspicious");
      }
    } catch (err) {
      logger.warn({ issueId, err }, "Resolution-proof check unavailable");
    }
  },

  /** Closures a super_admin should look at. Advisory queue, not a blocker. */
  async flaggedResolutions(limit = 50) {
    const rows = await prisma.issueMedia.findMany({
      where: { kind: "resolution_proof", aiVerification: { not: Prisma.DbNull } },
      include: { issue: { select: { id: true, publicRef: true, title: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows
      .filter((r) => (r.aiVerification as { needsReview?: boolean } | null)?.needsReview)
      .slice(0, limit)
      .map((r) => ({
        mediaId: r.id,
        url: r.url,
        issue: r.issue,
        verification: r.aiVerification,
      }));
  },
};
