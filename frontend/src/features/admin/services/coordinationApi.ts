import { apiRequest } from "@/shared/lib/apiClient";

/** Client for the multi-department coordination endpoints. */

export interface CoordDepartment {
  id: string;
  code: string;
  nameEn: string;
  nameHi?: string;
}

export interface CoordDependency {
  id: string;
  type: "finish_to_start" | "start_to_start";
  satisfied: boolean;
  predecessor: { id: string; status: string; department: { code: string; nameEn: string } };
}

export interface CoordWorkOrder {
  id: string;
  role: "primary" | "supporting" | "notify";
  status: "pending" | "acknowledged" | "in_progress" | "done" | "rejected";
  priority: number;
  sequence: number;
  department: CoordDepartment;
  assignee: { id: string; fullName: string | null } | null;
  createdAt: string;
  acknowledgedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  ackDueAt: string | null;
  dueAt: string | null;
  breachedAt: string | null;
  escalationLevel: number;
  isOverdue: boolean;
  isBlocked: boolean;
  dependsOn: CoordDependency[];
}

export interface WorkOrderNote {
  id: string;
  body: string;
  visibility: "internal" | "inter_dept" | "citizen";
  author: { id: string; fullName: string; role: string };
  createdAt: string;
}

export interface WorkOrderTransfer {
  id: string;
  status: "requested" | "approved" | "rejected" | "cancelled";
  reason: string;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  fromDepartment: { id: string; nameEn: string };
  toDepartment: { id: string; nameEn: string };
  requestedBy: { id: string; fullName: string };
  approvedBy: { id: string; fullName: string } | null;
}

export interface CoordinationPlan {
  id: string;
  provider: string;
  model: string;
  promptVersion: string;
  plan: {
    isCompound: boolean;
    subtasks: { order: number; department: string; summary: string; dependsOn: number[] }[];
  };
  rationale: string;
  confidence: number;
  status: "applied" | "suggested" | "rejected";
  appliedAt: string | null;
  overriddenBy: { id: string; fullName: string } | null;
  overrideNote: string | null;
  createdAt: string;
}

export const coordinationApi = {
  coordinationPlans: (issueId: string) =>
    apiRequest<{ items: CoordinationPlan[] }>(`/ai/issues/${issueId}/coordination-plan`, {
      auth: false,
    }).then((r) => r.items),

  overridePlan: (planId: string, action: "apply" | "reject", note?: string) =>
    apiRequest(`/ai/coordination-plans/${planId}/override`, {
      method: "POST",
      body: { action, note },
    }),

  workOrdersForIssue: (issueId: string) =>
    apiRequest<{ items: CoordWorkOrder[] }>(`/issues/${issueId}/work-orders`, { auth: false }).then(
      (r) => r.items
    ),

  updateStatus: (workOrderId: string, status: string, note?: string) =>
    apiRequest(`/work-orders/${workOrderId}/status`, { method: "PATCH", body: { status, note } }),

  assign: (workOrderId: string, body: { departmentId?: string; assigneeId?: string | null }) =>
    apiRequest(`/work-orders/${workOrderId}/assign`, { method: "PATCH", body }),

  addDependency: (workOrderId: string, predecessorId: string, type = "finish_to_start") =>
    apiRequest(`/work-orders/${workOrderId}/dependencies`, {
      method: "POST",
      body: { predecessorId, type },
    }),

  removeDependency: (dependencyId: string) =>
    apiRequest(`/work-orders/dependencies/${dependencyId}`, { method: "DELETE" }),

  notes: (workOrderId: string) =>
    apiRequest<{ items: WorkOrderNote[] }>(`/work-orders/${workOrderId}/notes`).then((r) => r.items),

  addNote: (workOrderId: string, body: string, visibility: WorkOrderNote["visibility"]) =>
    apiRequest<WorkOrderNote>(`/work-orders/${workOrderId}/notes`, {
      method: "POST",
      body: { body, visibility },
    }),

  transfers: (workOrderId: string) =>
    apiRequest<{ items: WorkOrderTransfer[] }>(`/work-orders/${workOrderId}/transfers`).then((r) => r.items),

  requestTransfer: (workOrderId: string, toDepartmentId: string, reason: string) =>
    apiRequest<WorkOrderTransfer>(`/work-orders/${workOrderId}/transfers`, {
      method: "POST",
      body: { toDepartmentId, reason },
    }),

  decideTransfer: (transferId: string, decision: "approved" | "rejected", decisionNote?: string) =>
    apiRequest(`/work-orders/transfers/${transferId}`, {
      method: "PATCH",
      body: { decision, decisionNote },
    }),
};
