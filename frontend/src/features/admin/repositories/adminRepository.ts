// Backed by the real Phase 2 backend instead of the local mock.
//
// Gaps vs. the old contract, honestly noted:
//  - There is no bulk "list every issue across every department" endpoint
//    for a scoped dept_admin — only GET /departments/:id/queue (their own
//    department) and the public GET /issues (used here for super_admin).
//  - There is no DELETE /issues/:id — the new schema is audit-trail-first
//    and deliberately doesn't support deleting citizen reports.
//  - Status updates go through the work order that actually owns the
//    transition, and the backend enforces a strict forward-only state
//    machine — an admin jumping straight from "reported" to "resolved"
//    will now get a real validation error instead of silently succeeding.

import { apiRequest } from "@/shared/lib/apiClient";
import { UserRole } from "@/shared/types/domain/UserRole";
import { IssueResponse } from "@/shared/contracts/IssueResponse";
import { APIError } from "@/shared/errors/errors";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";

interface ApiMeUser {
  id: string;
  role: string;
  departmentId: string | null;
}

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
  workOrders?: { id: string; departmentId: string; role: string; status: string }[];
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
    image_urls: null,
    supports_count: issue.supportsCount,
    master_issue_id: null,
    created_at: issue.createdAt,
    updated_at: issue.resolvedAt ?? issue.acknowledgedAt ?? issue.createdAt,
  };
}

const ISSUE_STATUS_TO_WORK_ORDER_STATUS: Record<string, string> = {
  [IssueStatus.REPORTED]: "pending",
  [IssueStatus.IN_PROGRESS]: "in_progress",
  [IssueStatus.RESOLVED]: "done",
  [IssueStatus.REJECTED]: "rejected",
};

// The backend's role enum ("citizen" | "dept_admin" | "super_admin") doesn't
// share string values with the frontend's UserRole domain type, which is
// off-limits to change. Map explicitly rather than casting.
const API_ROLE_TO_USER_ROLE: Record<string, UserRole> = {
  citizen: UserRole.USER,
  dept_admin: UserRole.DEPARTMENT_ADMIN,
  super_admin: UserRole.SUPER_ADMIN,
};

async function fetchMe(): Promise<ApiMeUser | null> {
  try {
    return await apiRequest<ApiMeUser>("/auth/me");
  } catch {
    return null;
  }
}

export const adminRepository = {
  async checkIsAdmin(_userId: string): Promise<boolean> {
    const me = await fetchMe();
    return me?.role === "dept_admin" || me?.role === "super_admin";
  },

  async getUserRole(_userId: string): Promise<{ role: UserRole | null; department: string | null }> {
    const me = await fetchMe();
    return {
      role: me ? (API_ROLE_TO_USER_ROLE[me.role] ?? null) : null,
      department: me?.departmentId ?? null,
    };
  },

  async fetchAllIssuesAdmin(): Promise<IssueResponse[]> {
    const me = await fetchMe();
    if (!me) return [];

    if (me.role === "dept_admin" && me.departmentId) {
      const data = await apiRequest<{ items: { issue: ApiIssue }[] }>(
        `/departments/${me.departmentId}/queue?pageSize=100`
      );
      return data.items.map((item) => toIssueResponse(item.issue as ApiIssue));
    }

    const data = await apiRequest<{ items: ApiIssue[] }>("/issues?pageSize=100", { auth: false });
    return data.items.map(toIssueResponse);
  },

  async updateIssueStatusAdmin(id: string, status: IssueStatus): Promise<void> {
    const issue = await apiRequest<ApiIssue>(`/issues/${id}`, { auth: false });
    const primaryWorkOrder = issue.workOrders?.find((wo) => wo.role === "primary");
    if (!primaryWorkOrder) throw new APIError("No work order found for this issue", 404);

    const targetStatus = ISSUE_STATUS_TO_WORK_ORDER_STATUS[status];
    await apiRequest(`/work-orders/${primaryWorkOrder.id}/status`, {
      method: "PATCH",
      body: { status: targetStatus },
    });
  },

  async deleteIssueAdmin(_id: string): Promise<void> {
    throw new APIError(
      "Deleting reports isn't supported by the backend — its audit trail is append-only by design.",
      501
    );
  },
};
