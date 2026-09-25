import { IssueStatus, UserRole } from "@prisma/client";

/**
 * The civic issue lifecycle (PS #5).
 *
 *   reported ─▶ acknowledged ─▶ in_progress ─▶ resolved ─▶ verified ─▶ closed
 *       │             │              │             │
 *       └─────────────┴──────────────┴──▶ rejected │
 *                                          │       │
 *                                  reopened ◀──────┘
 *
 * Anything not listed here is an illegal transition and is rejected with 422.
 */
export const ALLOWED_ISSUE_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  reported: ["acknowledged", "rejected"],
  acknowledged: ["in_progress", "rejected"],
  in_progress: ["resolved", "rejected"],
  // The citizen decides whether a resolution actually holds.
  resolved: ["verified", "reopened", "closed"],
  verified: ["closed"],
  // A rejected report can be disputed by the citizen who filed it.
  rejected: ["reopened"],
  reopened: ["acknowledged", "in_progress", "rejected"],
  closed: [],
};

/** Transitions only a department admin / super admin may perform. */
const STAFF_ONLY: IssueStatus[] = ["acknowledged", "in_progress", "resolved", "rejected", "closed"];

/** Transitions only the citizen who reported the issue may perform. */
const REPORTER_ONLY: IssueStatus[] = ["verified", "reopened"];

export function isTransitionAllowed(from: IssueStatus, to: IssueStatus): boolean {
  return ALLOWED_ISSUE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function actorMayTransition(
  to: IssueStatus,
  actorRole: UserRole,
  isReporter: boolean
): { allowed: true } | { allowed: false; reason: string } {
  if (STAFF_ONLY.includes(to)) {
    if (actorRole === "dept_admin" || actorRole === "super_admin") return { allowed: true };
    return { allowed: false, reason: `Only department staff can move an issue to "${to}".` };
  }

  if (REPORTER_ONLY.includes(to)) {
    // Super admins can close the loop on a citizen's behalf (e.g. no response).
    if (actorRole === "super_admin") return { allowed: true };
    if (isReporter) return { allowed: true };
    return { allowed: false, reason: `Only the citizen who reported this issue can mark it "${to}".` };
  }

  return { allowed: false, reason: `Unsupported target status "${to}".` };
}

/** Timestamp columns stamped when an issue enters a given state. */
export function timestampFieldFor(status: IssueStatus): string | null {
  switch (status) {
    case "acknowledged":
      return "acknowledgedAt";
    case "resolved":
      return "resolvedAt";
    case "verified":
      return "verifiedAt";
    case "closed":
      return "closedAt";
    default:
      return null;
  }
}
