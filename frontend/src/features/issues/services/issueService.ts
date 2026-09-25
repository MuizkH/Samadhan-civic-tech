import { issueRepository } from "../repositories/issueRepository";
import { Issue } from "@/shared/types/domain/Issue";
import { IssueResponse } from "@/shared/contracts/IssueResponse";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { CATEGORY_LABELS } from "@/shared/constants/categories";
import { STATUSES } from "@/shared/constants/statuses";

export const issueService = {
  mapResponseToDomain(raw: IssueResponse): Issue {
    // Standardize status strings to domain enum
    const status = (raw.status?.replace("-", "_").toLowerCase() || IssueStatus.REPORTED) as IssueStatus;

    return {
      id: raw.id,
      userId: raw.user_id,
      title: raw.title,
      description: raw.description || "",
      category: raw.category, // Map raw category directly, client translates if needed
      location: raw.location || "",
      status,
      imageUrls: raw.image_urls || [],
      supportsCount: raw.supports_count || 0,
      masterIssueId: raw.master_issue_id || null,
      latitude: raw.latitude,
      longitude: raw.longitude,
      createdAt: new Date(raw.created_at),
      updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
      priority: raw.priority,
    };
  },

  getCategoryLabel(id: string, language: "en" | "hi"): string {
    const key = id.toLowerCase() as keyof typeof CATEGORY_LABELS;
    const label = CATEGORY_LABELS[key];
    return label ? label[language] : id;
  },

  async reportNewIssue(
    userId: string,
    input: {
      title: string;
      description: string;
      category: string;
      location: string;
      latitude?: number | null;
      longitude?: number | null;
    },
    imageFile: File | null,
    activeLanguage: "en" | "hi",
    force = false
  ): Promise<Issue> {
    let imageUrls: string[] = [];

    if (imageFile) {
      const publicUrl = await issueRepository.uploadIssueImage(userId, imageFile);
      imageUrls = [publicUrl];
    }

    // Standardize category storage in DB. Use translated label for backward compatibility
    const dbCategoryName = this.getCategoryLabel(input.category, activeLanguage);

    const raw = await issueRepository.insertIssue(
      {
        user_id: userId,
        title: input.title,
        description: input.description,
        category: dbCategoryName,
        location: input.location,
        status: STATUSES.REPORTED,
        image_urls: imageUrls.length ? imageUrls : null,
        latitude: input.latitude || null,
        longitude: input.longitude || null,
      },
      force
    );

    return this.mapResponseToDomain(raw);
  },

  /** Citizen chose "same issue" after seeing a duplicate candidate. */
  async confirmDuplicateIssue(candidateId: string, description: string): Promise<Issue> {
    const raw = await issueRepository.confirmDuplicate(candidateId, description);
    return this.mapResponseToDomain(raw);
  },

  async toggleSupport(issueId: string, userId: string, currentlySupported: boolean): Promise<number> {
    if (currentlySupported) {
      await issueRepository.removeSupport(issueId, userId);
      return -1;
    } else {
      await issueRepository.addSupport(issueId, userId);
      return 1;
    }
  },

  async getIssueById(issueId: string): Promise<Issue> {
    const raw = await issueRepository.fetchIssueById(issueId);
    return this.mapResponseToDomain(raw);
  },

  async fetchAllIssuesForMap(): Promise<Issue[]> {
    const raw = await issueRepository.fetchAllIssuesForMap();
    return raw.map((r) => this.mapResponseToDomain(r));
  },
};
