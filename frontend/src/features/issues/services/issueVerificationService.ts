import { apiRequest } from "@/shared/lib/apiClient";
import { logger } from "@/shared/services/logger";
import { gamificationService } from "../../profile/services/gamificationService";

export interface VerificationState {
  confirmations: number;
  disagreements: number;
  confidence: number;
  isVerified: boolean;
  userVote: "confirm" | "disagree" | null;
}

interface ApiVerificationState {
  confirmations: number;
  disagreements: number;
  confidence: number;
  isVerified: boolean;
  userVote: boolean | null;
}

const EMPTY: VerificationState = {
  confirmations: 0,
  disagreements: 0,
  confidence: 0,
  isVerified: false,
  userVote: null,
};

function fromApi(state: ApiVerificationState): VerificationState {
  return {
    confirmations: state.confirmations,
    disagreements: state.disagreements,
    confidence: state.confidence,
    isVerified: state.isVerified,
    userVote: state.userVote === null ? null : state.userVote ? "confirm" : "disagree",
  };
}

/**
 * Community verification, backed by the citizen_verifications table.
 *
 * Several call sites (Leaflet popup HTML, dashboard summaries) need a
 * synchronous read, so states are cached in memory and served from there.
 * Call `prefetch()` with the visible issue ids first; anything not yet
 * loaded reports zeroes rather than inventing plausible-looking counts.
 */
class IssueVerificationService {
  private cache = new Map<string, VerificationState>();
  private inFlight = new Map<string, Promise<void>>();

  /** Bulk-loads verification state for the given issues into the cache. */
  async prefetch(issueIds: string[]): Promise<void> {
    const missing = issueIds.filter((id) => !this.cache.has(id) && !this.inFlight.has(id));
    if (missing.length === 0) return;

    // One bulk request for the whole page. Asking per issue meant 20 requests
    // plus 20 CORS preflights before the dashboard settled, which dominated
    // load time on a high-latency connection even though each payload is tiny.
    const load = async (ids: string[]) => {
      try {
        const res = await apiRequest<{ states: Record<string, ApiVerificationState> }>(
          `/issues/verifications?ids=${ids.join(",")}`
        );
        for (const id of ids) {
          const state = res.states?.[id];
          this.cache.set(id, state ? fromApi(state) : EMPTY);
        }
      } catch (err) {
        logger.error(`Failed to load verification state for ${ids.length} issues:`, err);
        for (const id of ids) this.cache.set(id, EMPTY);
      } finally {
        for (const id of ids) this.inFlight.delete(id);
      }
    };

    // The endpoint caps each request, so chunk to match rather than 400.
    const BATCH = 100;
    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));

    await Promise.all(
      batches.map((ids) => {
        const p = load(ids);
        for (const id of ids) this.inFlight.set(id, p);
        return p;
      })
    );
    this.notifyChanged();
  }

  /**
   * Synchronous cache read. Returns zeroes until `prefetch` has resolved —
   * deliberately, so the UI never shows a number the server didn't provide.
   */
  getComputedState(issueId: string): VerificationState {
    return this.cache.get(issueId) ?? EMPTY;
  }

  async refresh(issueId: string): Promise<VerificationState> {
    try {
      const state = await apiRequest<ApiVerificationState>(`/issues/${issueId}/verification`);
      const mapped = fromApi(state);
      this.cache.set(issueId, mapped);
      this.notifyChanged(issueId);
      return mapped;
    } catch (err) {
      logger.error(`Failed to refresh verification state for ${issueId}:`, err);
      return this.getComputedState(issueId);
    }
  }

  /** Casts (or changes) the signed-in citizen's vote. */
  async voteOnIssue(issueId: string, vote: "confirm" | "disagree"): Promise<VerificationState> {
    const state = await apiRequest<ApiVerificationState>(`/issues/${issueId}/verify`, {
      method: "POST",
      body: { vote: vote === "confirm" },
    });
    const mapped = fromApi(state);
    this.cache.set(issueId, mapped);
    this.notifyChanged(issueId);
    gamificationService.dispatchGamificationUpdate();
    return mapped;
  }

  /** Drops cached state — call on sign-out so votes don't leak between users. */
  clear(): void {
    this.cache.clear();
  }

  private notifyChanged(issueId?: string) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("issue_verifications_changed", { detail: { issueId } }));
  }
}

export const issueVerificationService = new IssueVerificationService();
