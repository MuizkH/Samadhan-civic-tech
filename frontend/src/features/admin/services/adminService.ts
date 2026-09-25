import { apiRequest } from "@/shared/lib/apiClient";
import { UserRole } from "@/shared/types/domain/UserRole";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";

/**
 * Admin-facing API client. Department scoping, filtering, sorting and
 * pagination are all enforced by the backend — this only forwards the
 * caller's intent as query parameters.
 */

export interface QueueIssue {
  id: string;
  publicRef: string;
  title: string;
  description: string;
  category: { code: string; nameEn: string };
  status: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  priority: number;
  reportedBy: string;
  reporterName: string | null;
  supportsCount: number;
  resolutionNote: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
}

export interface QueueItem {
  workOrderId: string;
  status: string;
  role: string;
  priority: number;
  assignee: { id: string; fullName: string | null } | null;
  createdAt: string;
  issue: QueueIssue;
}

export interface QueueFilters {
  departmentId: string;
  page?: number;
  pageSize?: number;
  status?: string;
  categoryCode?: string;
  /**
   * Only honoured for a super admin. A department admin's city comes from
   * their token, so sending it here cannot widen what they see — the backend
   * overrides this value with their own city.
   */
  city?: string;
  from?: string;
  to?: string;
  sort?: "created_desc" | "created_asc" | "priority" | "status";
}

// The backend role enum and the frontend UserRole enum don't share string
// values, so translate rather than cast.
const API_ROLE_TO_USER_ROLE: Record<string, UserRole> = {
  citizen: UserRole.USER,
  dept_admin: UserRole.DEPARTMENT_ADMIN,
  super_admin: UserRole.SUPER_ADMIN,
};

interface ApiMeUser {
  id: string;
  role: string;
  departmentId: string | null;
  city: string | null;
}

export const adminService = {
  async getUserRole(
    _userId: string
  ): Promise<{ role: UserRole | null; department: string | null; city: string | null }> {
    try {
      const me = await apiRequest<ApiMeUser>("/auth/me");
      return {
        role: API_ROLE_TO_USER_ROLE[me.role] ?? null,
        department: me.departmentId,
        city: me.city ?? null,
      };
    } catch {
      return { role: null, department: null, city: null };
    }
  },

  async checkIsAdmin(userId: string): Promise<boolean> {
    const { role } = await this.getUserRole(userId);
    return role === UserRole.DEPARTMENT_ADMIN || role === UserRole.SUPER_ADMIN;
  },

  async listDepartments() {
    const data = await apiRequest<{
      items: { id: string; code: string; nameEn: string; nameHi: string }[];
    }>("/departments");
    return data.items;
  },

  /**
   * Cities the caller may view. A super admin gets every serviced city; a
   * department admin gets only their own, so this doubles as the source of
   * truth for whether the city picker is worth rendering at all.
   */
  async listCities() {
    const data = await apiRequest<{ items: string[] }>("/departments/cities");
    return data.items;
  },

  async fetchQueue(filters: QueueFilters): Promise<{ items: QueueItem[]; total: number; page: number }> {
    const params = new URLSearchParams();
    if (filters.page) params.set("page", String(filters.page));
    if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
    if (filters.status) params.set("status", filters.status);
    if (filters.categoryCode) params.set("categoryCode", filters.categoryCode);
    if (filters.city) params.set("city", filters.city);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.sort) params.set("sort", filters.sort);

    return apiRequest<{ items: QueueItem[]; total: number; page: number }>(
      `/departments/${filters.departmentId}/queue?${params.toString()}`
    );
  },

  /** Lifecycle transition. The backend validates legality and evidence. */
  async updateIssueStatus(
    issueId: string,
    status: IssueStatus | string,
    options: { reason?: string; resolutionNote?: string; proofUrl?: string } = {}
  ) {
    return apiRequest(`/issues/${issueId}/status`, {
      method: "PATCH",
      body: { status, ...options },
    });
  },

  async fetchHistory(issueId: string) {
    const data = await apiRequest<{
      items: {
        id: string;
        fromStatus: string | null;
        toStatus: string;
        reason: string | null;
        actorRole: string;
        actor: { id: string; fullName: string } | null;
        createdAt: string;
      }[];
    }>(`/issues/${issueId}/history`, { auth: false });
    return data.items;
  },
};
