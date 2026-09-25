import { prisma } from "../../shared/lib/prisma.js";
import { eventBus } from "../../shared/lib/eventBus.js";
import { issuesRepository, IssueRow } from "./issues.repository.js";
import { generatePublicRef } from "../../shared/lib/publicRef.js";
import { NotFoundError, ValidationError, ConflictError } from "../../shared/errors/AppError.js";
import { CreateIssueInput, ListIssuesQuery, ConfirmDuplicateInput } from "./issues.schemas.js";
import { cityFromLocation } from "../../shared/lib/cityFromLocation.js";
import { slaService } from "../sla/sla.service.js";
import { notificationsService } from "../notifications/notifications.service.js";
import { enqueueAi } from "../../jobs/scheduler.js";
import { complete, aiEnabled } from "../ai/providers/index.js";
import {
  DEDUPLICATION_JSON_SCHEMA,
  DEDUPLICATION_SYSTEM,
  DEDUPLICATION_VERSION,
  deduplicationSchema,
  deduplicationUser,
} from "../ai/prompts/index.js";
import { logger } from "../../shared/lib/logger.js";

function toApiIssue(row: IssueRow) {
  return {
    id: row.id,
    publicRef: row.public_ref,
    title: row.title,
    description: row.description,
    category: { code: row.category_code, nameEn: row.category_name_en },
    status: row.status,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    city: row.city,
    priority: row.priority,
    reportedBy: row.reported_by,
    supportsCount: row.supports_count,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    verifiedAt: row.verified_at,
    closedAt: row.closed_at,
  };
}

/**
 * Attaches media to a page of issues in one query. Cards, map popups and
 * the detail dialog all render the evidence photo, so the list endpoint has
 * to carry it — fetching per issue would be an N+1 on every feed load.
 */
async function withMedia(rows: IssueRow[]) {
  if (rows.length === 0) return [];
  const media = await prisma.issueMedia.findMany({
    where: { issueId: { in: rows.map((r) => r.id) } },
    orderBy: { createdAt: "asc" },
  });
  const byIssue = new Map<string, { id: string; kind: string; url: string }[]>();
  for (const m of media) {
    const list = byIssue.get(m.issueId) ?? [];
    list.push({ id: m.id, kind: m.kind, url: m.url });
    byIssue.set(m.issueId, list);
  }
  return rows.map((row) => ({ ...toApiIssue(row), media: byIssue.get(row.id) ?? [] }));
}

async function findAiDuplicateCandidate(input: CreateIssueInput, dedupRadiusM: number = 100) {
  const candidates = await issuesRepository.findNearbyUnresolved({
    latitude: input.latitude,
    longitude: input.longitude,
    radiusM: dedupRadiusM,
  });
  if (candidates.length === 0) return null;

  const media = await prisma.issueMedia.findMany({
    where: { issueId: { in: candidates.map((c) => c.id) }, kind: "evidence" },
    orderBy: { createdAt: "asc" },
  });
  const mediaByIssue = new Map<string, string[]>();
  for (const item of media) {
    const urls = mediaByIssue.get(item.issueId) ?? [];
    urls.push(item.url);
    mediaByIssue.set(item.issueId, urls);
  }

  for (const candidate of candidates) {
    const existingImageUrls = mediaByIssue.get(candidate.id) ?? [];
    const images = [
      ...(input.imageUrls ?? []).map((url) => ({ url })),
      ...existingImageUrls.map((url) => ({ url })),
    ];

    if (aiEnabled()) {
      try {
        const { data } = await complete(
          {
            kind: "deduplication",
            promptVersion: DEDUPLICATION_VERSION,
            system: DEDUPLICATION_SYSTEM,
            user: deduplicationUser({
              newComplaint: {
                title: input.title,
                description: input.description,
                category: input.categoryCode,
              },
              existingComplaint: {
                publicRef: candidate.public_ref,
                title: candidate.title,
                description: candidate.description,
                category: candidate.category_code,
                distanceM: Number(candidate.distance_m),
              },
              newImageCount: input.imageUrls?.length ?? 0,
              existingImageCount: existingImageUrls.length,
            }),
            images: images.length > 0 ? images : undefined,
            jsonSchema: DEDUPLICATION_JSON_SCHEMA,
            entityType: "issue",
            entityId: candidate.id,
          },
          deduplicationSchema
        );

        if (data.is_duplicate) {
          return {
            id: candidate.id,
            title: candidate.title,
            publicRef: candidate.public_ref,
            distanceM: Number(candidate.distance_m),
            message: "This looks similar to an already reported issue. Is this the same?",
            ai: data,
          };
        } else {
          // AI explicitly determined this candidate is NOT a duplicate. Skip heuristic fallback for this candidate.
          continue;
        }
      } catch (err) {
        logger.warn({ err, candidateId: candidate.id }, "AI deduplication comparison failed");
      }
    }

    // Heuristic fallback: if AI is disabled, fails, or evaluates false but proximity/category matches
    const distanceM = Number(candidate.distance_m);
    const categoryMatches = candidate.category_code.toLowerCase() === input.categoryCode.toLowerCase();

    const extractWords = (str: string) =>
      str
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3);

    const newWords = new Set([...extractWords(input.title), ...extractWords(input.description)]);
    const existingWords = new Set([...extractWords(candidate.title), ...extractWords(candidate.description)]);
    const commonWords = [...newWords].filter((w) => existingWords.has(w));

    if ((categoryMatches && distanceM <= dedupRadiusM) || distanceM <= 30 || commonWords.length >= 1) {
      return {
        id: candidate.id,
        title: candidate.title,
        publicRef: candidate.public_ref,
        distanceM,
        message: "A similar issue was already reported nearby. Is this the same issue?",
      };
    }
  }

  return null;
}

export const issuesService = {
  async list(filters: ListIssuesQuery) {
    const { rows, total } = await issuesRepository.list(filters);
    return {
      items: await withMedia(rows),
      page: filters.page,
      pageSize: filters.pageSize,
      total,
    };
  },

  async getById(id: string) {
    const row = await issuesRepository.findById(id);
    if (!row) throw new NotFoundError("Issue not found");
    const [media, workOrders] = await Promise.all([
      prisma.issueMedia.findMany({ where: { issueId: id } }),
      prisma.workOrder.findMany({ where: { issueId: id } }),
    ]);
    return {
      ...toApiIssue(row),
      media: media.map((m) => ({ id: m.id, kind: m.kind, url: m.url })),
      workOrders: workOrders.map((wo) => ({
        id: wo.id,
        departmentId: wo.departmentId,
        role: wo.role,
        status: wo.status,
      })),
    };
  },

  /**
   * The core reporting pipeline:
   *  1. resolve category (FK lookup by code)
   *  2. PostGIS fetch of unresolved complaints within category dedupRadiusM (default 100 meters)
   *  3. AI / spatial heuristic compares nearby complaints; duplicate candidate returns a
   *     confirmation warning — no insert
   *  4. otherwise, create the issue + primary report + work orders + initial status_history entry
   */
  async create(input: CreateIssueInput, reporterId: string) {
    const category = await prisma.issueCategory.findUnique({ where: { code: input.categoryCode } });
    if (!category || !category.active) throw new ValidationError(`Unknown category: ${input.categoryCode}`);

    if (!input.force) {
      const dedupCandidate = await findAiDuplicateCandidate(input, category.dedupRadiusM ?? 100);

      if (dedupCandidate) {
        return { duplicateCandidate: dedupCandidate };
      }
    }

    const rules = await prisma.categoryDepartmentRule.findMany({
      where: { categoryId: category.id },
      orderBy: { priority: "asc" },
    });
    if (rules.length === 0) {
      throw new ValidationError(`No routing rules configured for category: ${input.categoryCode}`);
    }

    // Derived from the coordinates, never taken from the request body — city
    // is what scopes staff access, so the reporter must not be able to choose
    // which department's jurisdiction their report lands in.
    const city = cityFromLocation(input.latitude, input.longitude);

    const issue = await prisma.$transaction(async (tx) => {
      const inserted = await issuesRepository.insertIssue(tx, {
        publicRef: generatePublicRef(),
        title: input.title,
        description: input.description,
        categoryId: category.id,
        priority: category.defaultPriority,
        reportedBy: reporterId,
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address ?? null,
        city,
      });

      await tx.issueReport.create({
        data: { issueId: inserted.id, reporterId, description: input.description, isPrimary: true },
      });

      // Evidence photos the client already pushed to Cloudinary. Without
      // this the upload succeeded but the URL was dropped on the floor.
      if (input.imageUrls?.length) {
        await tx.issueMedia.createMany({
          data: input.imageUrls.map((url) => ({
            issueId: inserted.id,
            kind: "evidence" as const,
            url,
            publicId: url.split("/").pop() ?? url,
            uploadedBy: reporterId,
          })),
        });
      }

      // Data-driven routing: one work order per matching rule — the primary
      // department plus every supporting/notify department the category
      // declares. Each carries its own SLA clock.
      const createdAt = inserted.createdAt ?? new Date();
      const workOrderRows = await Promise.all(
        rules.map(async (rule, idx) => {
          const sla = await slaService.computeDueDates({
            categoryId: category.id,
            departmentId: rule.departmentId,
            priority: rule.priority,
            from: createdAt,
          });
          return {
            issueId: inserted.id,
            departmentId: rule.departmentId,
            role: rule.role,
            priority: rule.priority,
            sequence: idx,
            slaPolicyId: sla.slaPolicyId,
            ackDueAt: sla.ackDueAt,
            dueAt: sla.dueAt,
          };
        })
      );
      await tx.workOrder.createMany({ data: workOrderRows });

      await tx.issueStatusHistory.create({
        data: {
          issueId: inserted.id,
          fromStatus: null,
          toStatus: "reported",
          actorId: reporterId,
          actorRole: "citizen",
          reason: "Issue reported",
        },
      });

      return inserted;
    });

    const row = await issuesRepository.findById(issue.id);
    const [apiIssue] = await withMedia([row!]);

    eventBus.emitIssueEvent({
      type: "issue.created",
      issueId: issue.id,
      departmentIds: rules.map((r) => r.departmentId),
      city,
      payload: { issue: apiIssue },
      at: new Date().toISOString(),
    });

    // AI runs off the request path. The report is already saved and routed;
    // anything below only adds fields to it.
    void enqueueAi({ type: "issue.created", issueId: issue.id });
    for (const m of apiIssue.media ?? []) {
      if (m.kind === "evidence") void enqueueAi({ type: "media.evidence", mediaId: m.id });
    }

    return { issue: apiIssue };
  },

  /** Citizen confirms an existing issue matches theirs — adds a corroborating report, no new issue. */
  async confirmDuplicate(input: ConfirmDuplicateInput, reporterId: string) {
    const existing = await issuesRepository.findById(input.duplicateOfId);
    if (!existing) throw new NotFoundError("Issue not found");

    await prisma.$transaction([
      prisma.issueReport.create({
        data: { issueId: existing.id, reporterId, description: input.description, isPrimary: false },
      }),
      prisma.issue.update({ where: { id: existing.id }, data: { supportsCount: { increment: 1 } } }),
    ]);

    const row = await issuesRepository.findById(existing.id);

    if (existing.reported_by !== reporterId) {
      await notificationsService.enqueue({
        recipientId: existing.reported_by,
        template: "issue.duplicate_linked",
        payload: { issueId: existing.id, publicRef: existing.public_ref, supportsCount: row!.supports_count },
      });
    }

    return toApiIssue(row!);
  },

  async support(issueId: string, userId: string) {
    const issue = await prisma.issue.findUnique({ where: { id: issueId } });
    if (!issue) throw new NotFoundError("Issue not found");

    const existing = await prisma.issueSupport.findUnique({
      where: { issueId_userId: { issueId, userId } },
    });
    if (existing) throw new ConflictError("Already supported");

    await prisma.$transaction([
      prisma.issueSupport.create({ data: { issueId, userId } }),
      prisma.issue.update({ where: { id: issueId }, data: { supportsCount: { increment: 1 } } }),
    ]);

    const row = await issuesRepository.findById(issueId);
    return toApiIssue(row!);
  },

  async unsupport(issueId: string, userId: string): Promise<void> {
    const existing = await prisma.issueSupport.findUnique({
      where: { issueId_userId: { issueId, userId } },
    });
    if (!existing) throw new NotFoundError("Support not found");

    await prisma.$transaction([
      prisma.issueSupport.delete({ where: { id: existing.id } }),
      prisma.issue.update({ where: { id: issueId }, data: { supportsCount: { decrement: 1 } } }),
    ]);
  },

  async listSupportedByUser(userId: string) {
    return this.list({ page: 1, pageSize: 100, supportedBy: userId });
  },
};
