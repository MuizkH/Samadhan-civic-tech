// Backed by the real Phase 2 backend (/issues, /uploads) instead of the
// local mock. Realtime subscription still uses the local pub-sub helper —
// the backend has no websocket/SSE channel yet (Phase 3).

import { apiRequest } from "@/shared/lib/apiClient";
import { subscribeToTable, mockTable, MockChangeEvent } from "@/shared/mock/mockLocalStore";
import { IssueResponse } from "@/shared/contracts/IssueResponse";
import { SupportResponse } from "@/shared/contracts/SupportResponse";
import { CATEGORY_LABELS } from "@/shared/constants/categories";
import { validateFileSignature } from "@/shared/validation/magicBytes";
import { APIError, ValidationError, DuplicateIssueError } from "@/shared/errors/errors";

interface ApiIssue {
  id: string;
  publicRef: string;
  title: string;
  description: string;
  category: { code: string; nameEn: string };
  status: string;
  latitude: number;
  longitude: number;
  address: string | null;
  reportedBy: string;
  supportsCount: number;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  media?: { id: string; kind: string; url: string }[];
  workOrders?: { id: string; departmentId: string; role: string; status: string }[];
  priority?: number | null;
}

// Reverse lookup: the frontend still stores/sends category as a translated
// display label (e.g. "Roads" / "सड़कें") — see issueService.reportNewIssue.
// The backend's category is an FK, addressed here by its stable code.
const LABEL_TO_CATEGORY_CODE: Record<string, string> = {};
for (const [code, labels] of Object.entries(CATEGORY_LABELS)) {
  LABEL_TO_CATEGORY_CODE[labels.en.toLowerCase()] = code;
  LABEL_TO_CATEGORY_CODE[labels.hi] = code;
}

function categoryLabelToCode(label: string): string {
  return LABEL_TO_CATEGORY_CODE[label.toLowerCase()] ?? LABEL_TO_CATEGORY_CODE[label] ?? label;
}

function toIssueResponse(issue: ApiIssue): IssueResponse {
  return {
    id: issue.id,
    user_id: issue.reportedBy,
    title: issue.title,
    description: issue.description,
    category: issue.category.nameEn,
    location: issue.address,
    latitude: issue.latitude,
    longitude: issue.longitude,
    status: issue.status,
    image_urls: issue.media?.map((m) => m.url) ?? null,
    supports_count: issue.supportsCount,
    master_issue_id: null,
    created_at: issue.createdAt,
    updated_at: issue.resolvedAt ?? issue.acknowledgedAt ?? issue.createdAt,
    priority: issue.priority ?? 3,
  };
}

const REALTIME_TABLE = "reported_issues"; // kept for the local pub-sub channel name only

export const issueRepository = {
  async fetchAllIssues(limitCount = 20): Promise<IssueResponse[]> {
    const data = await apiRequest<{ items: ApiIssue[] }>(`/issues?page=1&pageSize=${limitCount}`, {
      auth: true,
    });
    return data.items.map(toIssueResponse);
  },

  async fetchAllIssuesForMap(): Promise<IssueResponse[]> {
    const data = await apiRequest<{ items: ApiIssue[] }>(`/issues?page=1&pageSize=500`, { auth: true });
    return data.items.map(toIssueResponse);
  },

  async fetchIssueById(issueId: string): Promise<IssueResponse> {
    const issue = await apiRequest<ApiIssue>(`/issues/${issueId}`, { auth: true });
    return toIssueResponse(issue);
  },

  async fetchUserIssues(userId: string): Promise<IssueResponse[]> {
    const data = await apiRequest<{ items: ApiIssue[] }>(`/issues?reportedBy=${userId}&pageSize=100`, {
      auth: true,
    });
    return data.items.map(toIssueResponse);
  },

  /**
   * Submits a new report. If the backend finds a likely-duplicate nearby
   * report, it does NOT insert — instead this throws DuplicateIssueError
   * carrying the candidate, and the caller must ask the citizen to choose
   * "same issue" (confirmDuplicate) or "different issue" (retry with
   * force: true, which skips the dedup check server-side).
   */
  async insertIssue(
    issue: Omit<IssueResponse, "id" | "created_at" | "updated_at" | "supports_count">,
    force = false
  ): Promise<IssueResponse> {
    if (issue.latitude == null || issue.longitude == null) {
      throw new ValidationError("A location is required to report an issue.");
    }

    const body = {
      title: issue.title,
      description: issue.description,
      categoryCode: categoryLabelToCode(issue.category),
      latitude: issue.latitude,
      longitude: issue.longitude,
      address: issue.location ?? undefined,
      // Already uploaded to Cloudinary by uploadIssueImage; the backend
      // persists these as issue_media evidence rows.
      imageUrls: issue.image_urls ?? undefined,
      force,
    };

    const result = await apiRequest<{
      issue?: ApiIssue;
      duplicateCandidate?: { id: string; title: string; distanceM?: number };
    }>("/issues", { method: "POST", body });

    if (result.duplicateCandidate) {
      throw new DuplicateIssueError(result.duplicateCandidate);
    }

    const created = toIssueResponse(result.issue!);
    mockTable.insert(REALTIME_TABLE, created as unknown as Record<string, unknown>);
    return created;
  },

  /** Citizen confirmed a candidate is the same issue — corroborates it instead of creating a new one. */
  async confirmDuplicate(candidateId: string, description: string): Promise<IssueResponse> {
    const confirmed = await apiRequest<ApiIssue>(`/issues/${candidateId}/confirm-duplicate`, {
      method: "POST",
      body: { duplicateOfId: candidateId, description },
    });
    const mapped = toIssueResponse(confirmed);
    mockTable.insert(REALTIME_TABLE, mapped as unknown as Record<string, unknown>);
    return mapped;
  },

  /**
   * Photo evidence upload. Every rejection below names the specific problem
   * and what the citizen should do instead — a failed upload must never leave
   * them staring at a spinner or a raw status code.
   *
   * Validation runs locally first (size, MIME, magic bytes) so an obviously
   * bad file never costs a round trip, then the signed upload goes straight
   * to Cloudinary.
   */
  async uploadIssueImage(_userId: string, file: File): Promise<string> {
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      throw new ValidationError(
        `That photo is ${mb} MB, over the 5 MB limit. Choose a smaller photo, or retake it at a lower resolution.`
      );
    }
    if (file.size === 0) {
      throw new ValidationError("That file is empty. Choose a different photo.");
    }

    const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED_MIMES.includes(file.type)) {
      throw new ValidationError(
        `"${file.name}" isn't a supported image. Upload a JPG, PNG, WebP, or GIF photo.`
      );
    }

    // Extension and MIME can both be spoofed; the file header cannot.
    let isValidSignature: boolean;
    try {
      isValidSignature = await validateFileSignature(file, ALLOWED_MIMES);
    } catch {
      throw new ValidationError("We couldn't read that file. Choose a different photo and try again.");
    }
    if (!isValidSignature) {
      throw new ValidationError(
        `"${file.name}" doesn't look like a real image file, so it was rejected. Upload a photo taken with your camera.`
      );
    }

    let sig: { timestamp: number; folder: string; signature: string; apiKey: string; cloudName: string };
    try {
      sig = await apiRequest<typeof sig>("/uploads/signature", { method: "POST" });
    } catch (err) {
      // The signing endpoint is ours, so apiRequest has already produced a
      // usable message. Re-frame it so the user knows the photo is what failed
      // and that the rest of their report is intact.
      const detail = err instanceof APIError ? err.message : "The upload couldn't be authorised.";
      throw new APIError(
        `Couldn't start the photo upload. ${detail} Your report details are safe — try attaching the photo again.`,
        err instanceof APIError ? err.statusCode : 0
      );
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", sig.apiKey);
    formData.append("timestamp", String(sig.timestamp));
    formData.append("folder", sig.folder);
    formData.append("signature", sig.signature);

    // Uploads are much slower than API calls, so they get their own, longer
    // bound rather than the shared apiRequest timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    let resp: Response;
    try {
      resp = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
    } catch (err) {
      // Losing the connection part-way through is the common case on mobile
      // data — the old code let a raw TypeError escape to the UI.
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new APIError(
          "The photo upload timed out. Check your connection and try again, or submit the report without a photo.",
          0
        );
      }
      throw new APIError(
        navigator.onLine
          ? "The photo upload was interrupted. Check your connection and try again, or submit the report without a photo."
          : "You went offline during the upload. Reconnect and try again, or submit the report without a photo.",
        0
      );
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      const cloudinaryMessage: string | undefined = body?.error?.message;
      // 4xx means this file will never succeed; 5xx is worth retrying.
      const guidance =
        resp.status >= 500
          ? "The image service is having trouble. Try again in a moment, or submit the report without a photo."
          : "That photo was rejected by the image service. Try a different photo.";
      throw new APIError(
        cloudinaryMessage ? `${guidance} (${cloudinaryMessage})` : guidance,
        resp.status,
        body
      );
    }

    const data = await resp.json().catch(() => null);
    if (!data?.secure_url) {
      throw new APIError(
        "The photo uploaded but we didn't get a link back. Try attaching it again.",
        resp.status
      );
    }
    return data.secure_url as string;
  },

  async fetchUserSupports(userId: string): Promise<SupportResponse[]> {
    const data = await apiRequest<{ items: ApiIssue[] }>("/users/me/supports");
    return data.items.map((issue) => ({
      id: `${issue.id}-${userId}`,
      issue_id: issue.id,
      user_id: userId,
      created_at: issue.createdAt,
    }));
  },

  async fetchUserSupportedIssues(_userId: string): Promise<IssueResponse[]> {
    const data = await apiRequest<{ items: ApiIssue[] }>("/users/me/supports");
    return data.items.map(toIssueResponse);
  },

  async addSupport(issueId: string, userId: string): Promise<SupportResponse> {
    const _issue = await apiRequest<ApiIssue>(`/issues/${issueId}/support`, { method: "POST" });
    return {
      id: `${issueId}-${userId}`,
      issue_id: issueId,
      user_id: userId,
      created_at: new Date().toISOString(),
    };
  },

  async removeSupport(issueId: string, _userId: string): Promise<void> {
    await apiRequest<void>(`/issues/${issueId}/support`, { method: "DELETE" });
  },

  subscribeToIssuesChange(onChange: (payload: MockChangeEvent<IssueResponse>) => void): () => void {
    return subscribeToTable<IssueResponse>(REALTIME_TABLE, onChange);
  },
};
