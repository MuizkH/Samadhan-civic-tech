import { apiRequest } from "@/shared/lib/apiClient";

export interface StatusHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  actorRole: string;
  actor: { id: string; fullName: string } | null;
  createdAt: string;
}

/**
 * Citizen-side lifecycle actions. The backend owns the state machine and
 * rejects anything illegal with 422, so no transition rules are duplicated
 * here.
 */
export const issueLifecycleService = {
  /** Reporter accepts the department's fix -> verified. */
  confirmResolution(issueId: string) {
    return apiRequest(`/issues/${issueId}/confirm-resolution`, { method: "POST", body: {} });
  },

  /** Reporter disputes a resolution or rejection -> reopened. */
  reopen(issueId: string, reason: string) {
    return apiRequest(`/issues/${issueId}/reopen`, { method: "POST", body: { reason } });
  },

  async history(issueId: string): Promise<StatusHistoryEntry[]> {
    const data = await apiRequest<{ items: StatusHistoryEntry[] }>(`/issues/${issueId}/history`, {
      auth: false,
    });
    return data.items;
  },
};
