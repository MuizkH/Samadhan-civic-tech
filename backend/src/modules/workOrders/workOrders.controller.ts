import { Router } from "express";
import { z } from "zod";
import { workOrdersService } from "./workOrders.service.js";
import { coordinationService } from "./coordination.service.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate, optionalAuthenticate } from "../../shared/middleware/authenticate.js";
import { requireRole } from "../../shared/middleware/rbac.js";
import { uuidParam } from "../../shared/schemas/common.js";
import { writeAuditLog } from "../../shared/lib/auditLog.js";

export const workOrdersRouter = Router();

const staff = requireRole("dept_admin", "super_admin");

// ── Work order status / assignment ────────────────────────────────────────

const updateStatusSchema = z.object({
  status: z.enum(["pending", "acknowledged", "in_progress", "done", "rejected"]),
  note: z.string().max(2000).optional(),
});

workOrdersRouter.patch(
  "/:id/status",
  authenticate,
  staff,
  validate(uuidParam("id"), "params"),
  validate(updateStatusSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const wo = await workOrdersService.updateStatus(id, req.body, req.auth!);
      await writeAuditLog(req, {
        action: `work_order.status.${req.body.status}`,
        entityType: "work_order",
        entityId: id,
        after: { status: req.body.status },
      });
      res.json(wo);
    } catch (err) {
      next(err);
    }
  }
);

const assignSchema = z.object({
  departmentId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

workOrdersRouter.patch(
  "/:id/assign",
  authenticate,
  staff,
  validate(uuidParam("id"), "params"),
  validate(assignSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const wo = await workOrdersService.assign(id, req.body, req.auth!);
      await writeAuditLog(req, {
        action: "work_order.assign",
        entityType: "work_order",
        entityId: id,
        after: req.body,
      });
      res.json(wo);
    } catch (err) {
      next(err);
    }
  }
);

workOrdersRouter.get("/:id", authenticate, validate(uuidParam("id"), "params"), async (req, res, next) => {
  try {
    res.json(await workOrdersService.getById(req.params.id as string, req.auth!));
  } catch (err) {
    next(err);
  }
});

// ── Dependencies ──────────────────────────────────────────────────────────

const dependencySchema = z.object({
  predecessorId: z.string().uuid(),
  type: z.enum(["finish_to_start", "start_to_start"]).default("finish_to_start"),
});

/** Declares that this work order is blocked by another. */
workOrdersRouter.post(
  "/:id/dependencies",
  authenticate,
  staff,
  validate(uuidParam("id"), "params"),
  validate(dependencySchema),
  async (req, res, next) => {
    try {
      const successorId = req.params.id as string;
      const dep = await coordinationService.addDependency(
        { predecessorId: req.body.predecessorId, successorId, type: req.body.type },
        req.auth!
      );
      await writeAuditLog(req, {
        action: "work_order.dependency.add",
        entityType: "work_order",
        entityId: successorId,
        after: dep,
      });
      res.status(201).json(dep);
    } catch (err) {
      next(err);
    }
  }
);

workOrdersRouter.delete(
  "/dependencies/:dependencyId",
  authenticate,
  staff,
  validate(uuidParam("dependencyId"), "params"),
  async (req, res, next) => {
    try {
      await coordinationService.removeDependency(req.params.dependencyId as string, req.auth!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// ── Notes ─────────────────────────────────────────────────────────────────

const noteSchema = z.object({
  body: z.string().min(1).max(4000),
  visibility: z.enum(["internal", "inter_dept", "citizen"]).default("internal"),
});

workOrdersRouter.get(
  "/:id/notes",
  optionalAuthenticate,
  validate(uuidParam("id"), "params"),
  async (req, res, next) => {
    try {
      res.json({ items: await coordinationService.listNotes(req.params.id as string, req.auth) });
    } catch (err) {
      next(err);
    }
  }
);

workOrdersRouter.post(
  "/:id/notes",
  authenticate,
  staff,
  validate(uuidParam("id"), "params"),
  validate(noteSchema),
  async (req, res, next) => {
    try {
      const note = await coordinationService.addNote(req.params.id as string, req.body, req.auth!);
      res.status(201).json(note);
    } catch (err) {
      next(err);
    }
  }
);

// ── Transfers ─────────────────────────────────────────────────────────────

const transferSchema = z.object({
  toDepartmentId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

workOrdersRouter.get(
  "/:id/transfers",
  authenticate,
  validate(uuidParam("id"), "params"),
  async (req, res, next) => {
    try {
      res.json({ items: await coordinationService.listTransfers(req.params.id as string, req.auth!) });
    } catch (err) {
      next(err);
    }
  }
);

workOrdersRouter.post(
  "/:id/transfers",
  authenticate,
  staff,
  validate(uuidParam("id"), "params"),
  validate(transferSchema),
  async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const transfer = await coordinationService.requestTransfer(id, req.body, req.auth!);
      await writeAuditLog(req, {
        action: "work_order.transfer.request",
        entityType: "work_order",
        entityId: id,
        after: transfer,
      });
      res.status(201).json(transfer);
    } catch (err) {
      next(err);
    }
  }
);

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  decisionNote: z.string().max(2000).optional(),
});

workOrdersRouter.patch(
  "/transfers/:transferId",
  authenticate,
  staff,
  validate(uuidParam("transferId"), "params"),
  validate(decisionSchema),
  async (req, res, next) => {
    try {
      const transferId = req.params.transferId as string;
      const result = await coordinationService.decideTransfer(transferId, req.body, req.auth!);
      await writeAuditLog(req, {
        action: `work_order.transfer.${req.body.decision}`,
        entityType: "work_order_transfer",
        entityId: transferId,
        after: result,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);
