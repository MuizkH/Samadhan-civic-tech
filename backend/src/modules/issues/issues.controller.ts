import { Router } from "express";
import { issuesService } from "./issues.service.js";
import { lifecycleService } from "./lifecycle.service.js";
import { verificationService } from "./verification.service.js";
import {
  createIssueSchema,
  listIssuesQuerySchema,
  confirmDuplicateSchema,
  transitionStatusSchema,
  reopenSchema,
  verifyIssueSchema,
  bulkVerificationQuerySchema,
  ListIssuesQuery,
} from "./issues.schemas.js";
import { validate } from "../../shared/middleware/validate.js";
import { assertCityAccess, resolveCityScope } from "../../shared/middleware/rbac.js";
import { authenticate, authenticateSse, optionalAuthenticate } from "../../shared/middleware/authenticate.js";
import { uuidParam } from "../../shared/schemas/common.js";
import { writeAuditLog } from "../../shared/lib/auditLog.js";
import { openSseStream } from "../../shared/lib/sse.js";
import { workOrdersService } from "../workOrders/workOrders.service.js";
import { eventBus } from "../../shared/lib/eventBus.js";

export const issuesRouter = Router();

/**
 * Public issue feed — backs the citizen dashboard and the civic map, so it
 * stays readable without a token and unscoped for citizens.
 *
 * `optionalAuthenticate` is present only to recognise staff: a dept_admin
 * reading this endpoint gets their own city forced onto the filter. Without it
 * this route was a way around `requireDepartmentAccess` on the department
 * queue — `?departmentId=<uuid>&pageSize=500` returned any department's entire
 * backlog across every city.
 */
issuesRouter.get(
  "/",
  optionalAuthenticate,
  validate(listIssuesQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const filters = req.validatedQuery as ListIssuesQuery;
      const cityScope = req.auth ? resolveCityScope(req.auth) : null;
      res.json(await issuesService.list(cityScope === null ? filters : { ...filters, city: cityScope }));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Bulk verification state. Must stay above `GET /:id`, or Express matches
 * "verifications" as an issue id and the uuid validator rejects it.
 */
issuesRouter.get(
  "/verifications",
  optionalAuthenticate,
  validate(bulkVerificationQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const { ids } = req.validatedQuery as { ids: string[] };
      res.json({ states: await verificationService.getStates(ids, req.auth?.sub) });
    } catch (err) {
      next(err);
    }
  }
);

issuesRouter.get(
  "/:id",
  optionalAuthenticate,
  validate(uuidParam("id"), "params"),
  async (req, res, next) => {
    try {
      const issue = await issuesService.getById(req.params.id as string);
      // Detail reads are scoped too, otherwise an out-of-city issue stays
      // reachable by id even though it never appears in any list.
      if (req.auth) assertCityAccess(req.auth, issue.city);
      res.json(issue);
    } catch (err) {
      next(err);
    }
  }
);

issuesRouter.post("/", authenticate, validate(createIssueSchema), async (req, res, next) => {
  try {
    const result = await issuesService.create(req.body, req.auth!.sub);
    if ("duplicateCandidate" in result) {
      res.status(200).json(result);
      return;
    }
    await writeAuditLog(req, {
      action: "issue.create",
      entityType: "issue",
      entityId: result.issue.id,
      after: result.issue,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

issuesRouter.post(
  "/:id/confirm-duplicate",
  authenticate,
  validate(uuidParam("id"), "params"),
  validate(confirmDuplicateSchema),
  async (req, res, next) => {
    try {
      const issue = await issuesService.confirmDuplicate(req.body, req.auth!.sub);
      await writeAuditLog(req, {
        action: "issue.confirm_duplicate",
        entityType: "issue",
        entityId: issue.id,
      });
      res.status(200).json(issue);
    } catch (err) {
      next(err);
    }
  }
);

issuesRouter.post(
  "/:id/support",
  authenticate,
  validate(uuidParam("id"), "params"),
  async (req, res, next) => {
    try {
      const issue = await issuesService.support(req.params.id as string, req.auth!.sub);
      res.status(200).json(issue);
    } catch (err) {
      next(err);
    }
  }
);

issuesRouter.delete(
  "/:id/support",
  authenticate,
  validate(uuidParam("id"), "params"),
  async (req, res, next) => {
    try {
      await issuesService.unsupport(req.params.id as string, req.auth!.sub);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// ── Lifecycle (PS #5) ──────────────────────────────────────────────────────

/** Canonical status transition. Illegal moves are rejected with 422. */
issuesRouter.patch(
  "/:id/status",
  authenticate,
  validate(uuidParam("id"), "params"),
  validate(transitionStatusSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const updated = await lifecycleService.transition(id, req.body, req.auth!);
      await writeAuditLog(req, {
        action: `issue.status.${req.body.status}`,
        entityType: "issue",
        entityId: id,
        after: { status: req.body.status, reason: req.body.reason ?? null },
      });
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  }
);

issuesRouter.get("/:id/history", validate(uuidParam("id"), "params"), async (req, res, next) => {
  try {
    res.json({ items: await lifecycleService.history(req.params.id as string) });
  } catch (err) {
    next(err);
  }
});

/** Citizen accepts the department's resolution -> verified. */
issuesRouter.post(
  "/:id/confirm-resolution",
  authenticate,
  validate(uuidParam("id"), "params"),
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const updated = await lifecycleService.transition(
        id,
        { status: "verified", reason: req.body?.reason ?? "Citizen confirmed the resolution" },
        req.auth!
      );
      await writeAuditLog(req, { action: "issue.confirm_resolution", entityType: "issue", entityId: id });
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/** Citizen disputes a resolution or rejection -> reopened. */
issuesRouter.post(
  "/:id/reopen",
  authenticate,
  validate(uuidParam("id"), "params"),
  validate(reopenSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const updated = await lifecycleService.transition(
        id,
        { status: "reopened", reason: req.body.reason },
        req.auth!
      );
      await writeAuditLog(req, { action: "issue.reopen", entityType: "issue", entityId: id });
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ── Community verification (PS Challenge) ──────────────────────────────────

issuesRouter.get(
  "/:id/verification",
  optionalAuthenticate,
  validate(uuidParam("id"), "params"),
  async (req, res, next) => {
    try {
      res.json(await verificationService.getState(req.params.id as string, req.auth?.sub));
    } catch (err) {
      next(err);
    }
  }
);

issuesRouter.post(
  "/:id/verify",
  authenticate,
  validate(uuidParam("id"), "params"),
  validate(verifyIssueSchema),
  async (req, res, next) => {
    try {
      res.json(await verificationService.vote(req.params.id as string, req.auth!.sub, req.body.vote));
    } catch (err) {
      next(err);
    }
  }
);

// ── Coordination ───────────────────────────────────────────────────────────

/**
 * All work orders on this issue, with dependency + blocker state.
 *
 * `optionalAuthenticate` keeps the citizen issue-detail view working without a
 * token while still applying the city gate to staff — this route exposes
 * assignee names and full SLA state, so an authenticated dept_admin must not
 * read it for another jurisdiction.
 */
issuesRouter.get(
  "/:id/work-orders",
  optionalAuthenticate,
  validate(uuidParam("id"), "params"),
  async (req, res, next) => {
    try {
      res.json({ items: await workOrdersService.listForIssue(req.params.id as string, req.auth) });
    } catch (err) {
      next(err);
    }
  }
);

// ── Real-time (PS #5) ──────────────────────────────────────────────────────

/** SSE stream of events for a single issue. Token may come via ?token=. */
issuesRouter.get("/:id/stream", authenticateSse, validate(uuidParam("id"), "params"), (req, res) => {
  const issueId = req.params.id as string;
  openSseStream(req, res, (push) => eventBus.onIssue(issueId, push));
});
