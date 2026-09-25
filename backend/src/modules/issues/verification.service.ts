import { prisma } from "../../shared/lib/prisma.js";
import { eventBus } from "../../shared/lib/eventBus.js";
import { NotFoundError } from "../../shared/errors/AppError.js";

export interface VerificationState {
  confirmations: number;
  disagreements: number;
  /** 0-100, share of votes that confirm the issue is real. */
  confidence: number;
  /** Community-verified once there is meaningful agreement. */
  isVerified: boolean;
  userVote: boolean | null;
}

const VERIFIED_MIN_CONFIRMATIONS = 3;
const VERIFIED_MIN_CONFIDENCE = 60;

function summarise(
  confirmations: number,
  disagreements: number,
  userVote: boolean | null
): VerificationState {
  const total = confirmations + disagreements;
  const confidence = total === 0 ? 0 : Math.round((confirmations / total) * 100);
  return {
    confirmations,
    disagreements,
    confidence,
    isVerified: confirmations >= VERIFIED_MIN_CONFIRMATIONS && confidence >= VERIFIED_MIN_CONFIDENCE,
    userVote,
  };
}

export const verificationService = {
  async getState(issueId: string, userId?: string): Promise<VerificationState> {
    const [confirmations, disagreements, own] = await Promise.all([
      prisma.citizenVerification.count({ where: { issueId, vote: true } }),
      prisma.citizenVerification.count({ where: { issueId, vote: false } }),
      userId
        ? prisma.citizenVerification.findUnique({
            where: { issueId_userId: { issueId, userId } },
            select: { vote: true },
          })
        : Promise.resolve(null),
    ]);
    return summarise(confirmations, disagreements, own?.vote ?? null);
  },

  /**
   * Same shape as getState, for many issues in one round trip. The dashboard
   * renders 20 cards at a time and each needs its verification badge; asking
   * per issue cost 20 requests plus 20 CORS preflights on first paint.
   *
   * Two grouped queries regardless of how many ids come in, so this stays
   * flat as the page size grows.
   */
  async getStates(issueIds: string[], userId?: string): Promise<Record<string, VerificationState>> {
    const ids = [...new Set(issueIds.filter(Boolean))];
    if (ids.length === 0) return {};

    const [grouped, own] = await Promise.all([
      prisma.citizenVerification.groupBy({
        by: ["issueId", "vote"],
        where: { issueId: { in: ids } },
        _count: { _all: true },
      }),
      userId
        ? prisma.citizenVerification.findMany({
            where: { issueId: { in: ids }, userId },
            select: { issueId: true, vote: true },
          })
        : Promise.resolve([]),
    ]);

    const tally = new Map<string, { yes: number; no: number }>();
    for (const row of grouped) {
      const t = tally.get(row.issueId) ?? { yes: 0, no: 0 };
      if (row.vote) t.yes = row._count._all;
      else t.no = row._count._all;
      tally.set(row.issueId, t);
    }
    const ownVote = new Map(own.map((o) => [o.issueId, o.vote]));

    const out: Record<string, VerificationState> = {};
    for (const id of ids) {
      const t = tally.get(id) ?? { yes: 0, no: 0 };
      out[id] = summarise(t.yes, t.no, ownVote.get(id) ?? null);
    }
    return out;
  },

  /** Upserts the caller's vote — one per (issue, user), changeable. */
  async vote(issueId: string, userId: string, vote: boolean): Promise<VerificationState> {
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true, city: true, workOrders: { select: { departmentId: true } } },
    });
    if (!issue) throw new NotFoundError("Issue not found");

    await prisma.citizenVerification.upsert({
      where: { issueId_userId: { issueId, userId } },
      update: { vote, updatedAt: new Date() },
      create: { issueId, userId, vote },
    });

    const state = await this.getState(issueId, userId);

    eventBus.emitIssueEvent({
      type: "issue.verification_changed",
      issueId,
      departmentIds: issue.workOrders.map((wo) => wo.departmentId),
      city: issue.city,
      payload: {
        confirmations: state.confirmations,
        disagreements: state.disagreements,
        confidence: state.confidence,
      },
      at: new Date().toISOString(),
    });

    return state;
  },

  /** Bulk state for a list of issues — avoids N+1 on feed/map views. */
  async getStateForIssues(issueIds: string[], userId?: string) {
    if (issueIds.length === 0) return {} as Record<string, VerificationState>;

    const [grouped, own] = await Promise.all([
      prisma.citizenVerification.groupBy({
        by: ["issueId", "vote"],
        where: { issueId: { in: issueIds } },
        _count: { _all: true },
      }),
      userId
        ? prisma.citizenVerification.findMany({
            where: { issueId: { in: issueIds }, userId },
            select: { issueId: true, vote: true },
          })
        : Promise.resolve([]),
    ]);

    const ownByIssue = new Map(own.map((o) => [o.issueId, o.vote]));
    const tally = new Map<string, { yes: number; no: number }>();
    for (const row of grouped) {
      const entry = tally.get(row.issueId) ?? { yes: 0, no: 0 };
      if (row.vote) entry.yes = row._count._all;
      else entry.no = row._count._all;
      tally.set(row.issueId, entry);
    }

    const result: Record<string, VerificationState> = {};
    for (const id of issueIds) {
      const t = tally.get(id) ?? { yes: 0, no: 0 };
      result[id] = summarise(t.yes, t.no, ownByIssue.get(id) ?? null);
    }
    return result;
  },

  /** Real contribution counts for gamification — no localStorage guesswork. */
  async getUserStats(userId: string) {
    const [reportCount, supportCount, verificationCount, resolvedReportCount] = await Promise.all([
      prisma.issue.count({ where: { reportedBy: userId } }),
      prisma.issueSupport.count({ where: { userId } }),
      prisma.citizenVerification.count({ where: { userId } }),
      prisma.issue.count({
        where: { reportedBy: userId, status: { in: ["resolved", "verified", "closed"] } },
      }),
    ]);
    const reportDates = await prisma.issue.findMany({
      where: { reportedBy: userId },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return {
      reportCount,
      supportCount,
      verificationCount,
      resolvedReportCount,
      reportDates: reportDates.map((r) => r.createdAt),
    };
  },
};
