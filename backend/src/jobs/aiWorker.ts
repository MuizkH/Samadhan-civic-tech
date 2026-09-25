import { logger } from "../shared/lib/logger.js";
import { decompositionService } from "../modules/ai/decomposition.service.js";
import { visionService } from "../modules/ai/vision.service.js";
import { categoriseService } from "../modules/ai/categorise.service.js";

/**
 * All AI work happens here, off the request path.
 *
 * Nothing in this file may throw into pg-boss in a way that matters: every
 * task already degrades internally, and a failed AI job must never retry
 * forever or mark a citizen's report as broken. The report is already saved
 * by the time any of this runs.
 */

export type AiJob =
  | { type: "issue.created"; issueId: string }
  | { type: "media.evidence"; mediaId: string }
  | { type: "issue.resolved"; issueId: string };

export async function runAiJob(job: AiJob): Promise<void> {
  const started = Date.now();
  try {
    switch (job.type) {
      case "issue.created":
        // Decomposition first: it is the one that changes routing, and the
        // sooner the second department has a work order the better.
        await decompositionService.planForIssue(job.issueId);
        await categoriseService.recordSuggestion(job.issueId);
        break;

      case "media.evidence":
        await visionService.verifyEvidencePhoto(job.mediaId);
        break;

      case "issue.resolved":
        await visionService.verifyResolutionProof(job.issueId);
        break;
    }
    logger.info({ job: job.type, ms: Date.now() - started }, "AI job complete");
  } catch (err) {
    // Swallow: AI is additive. Anything unhandled this far up is a bug in the
    // degradation path, worth a log but never worth failing the queue over.
    logger.error({ err, job }, "AI job failed");
  }
}
