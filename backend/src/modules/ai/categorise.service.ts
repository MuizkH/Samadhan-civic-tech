import { prisma } from "../../shared/lib/prisma.js";
import { logger } from "../../shared/lib/logger.js";
import { complete, aiEnabled } from "./providers/index.js";
import {
  CATEGORISE_SYSTEM,
  CATEGORISE_JSON_SCHEMA,
  CATEGORISE_VERSION,
  categoriseUser,
  categoriseSchema,
  CategoriseResult,
} from "./prompts/index.js";

/**
 * Category + priority suggestion.
 *
 * The citizen always chooses. This exists to save them a dropdown, and to
 * give us an honest accuracy number: both the suggestion and the citizen's
 * final choice are stored, so agreement can be measured rather than claimed.
 */

export const categoriseService = {
  /** Synchronous suggestion for the report form. Returns null when AI is off. */
  async suggest(input: {
    title: string;
    description: string;
    imageUrl?: string;
  }): Promise<CategoriseResult | null> {
    if (!aiEnabled()) return null;
    try {
      const { data } = await complete(
        {
          kind: "categorise",
          promptVersion: CATEGORISE_VERSION,
          system: CATEGORISE_SYSTEM,
          user: categoriseUser(input),
          images: input.imageUrl ? [{ url: input.imageUrl }] : undefined,
          jsonSchema: CATEGORISE_JSON_SCHEMA,
        },
        categoriseSchema
      );
      return data;
    } catch (err) {
      logger.warn({ err }, "Categorisation unavailable");
      return null;
    }
  },

  /** Records what was suggested for an issue the citizen has already filed. */
  async recordSuggestion(issueId: string) {
    if (!aiEnabled()) return;
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        title: true,
        description: true,
        aiSuggestedCategory: true,
        media: { where: { kind: "evidence" }, select: { url: true }, take: 1 },
      },
    });
    if (!issue || issue.aiSuggestedCategory) return;

    const suggestion = await this.suggest({
      title: issue.title,
      description: issue.description,
      imageUrl: issue.media[0]?.url,
    });
    if (!suggestion) return;

    await prisma.issue.update({
      where: { id: issue.id },
      data: {
        aiSuggestedCategory: suggestion.category,
        aiSuggestedPriority: suggestion.priority,
        aiSuggestionConfidence: suggestion.confidence,
      },
    });
  },

  /**
   * Agreement between suggestion and the citizen's final choice.
   * Only counts issues where a suggestion actually exists.
   */
  async accuracy() {
    const rows = await prisma.issue.findMany({
      where: { aiSuggestedCategory: { not: null } },
      select: { aiSuggestedCategory: true, category: { select: { code: true } } },
    });
    const total = rows.length;
    const agreed = rows.filter((r) => r.aiSuggestedCategory === r.category.code).length;
    return {
      total,
      agreed,
      agreementRate: total === 0 ? null : Math.round((agreed / total) * 100),
    };
  },
};
