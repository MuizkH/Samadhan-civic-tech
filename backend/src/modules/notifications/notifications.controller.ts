import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../shared/lib/prisma.js";
import { notificationsService } from "./notifications.service.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { validate } from "../../shared/middleware/validate.js";

export const notificationsRouter = Router();

const listQuery = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

notificationsRouter.get("/", authenticate, validate(listQuery, "query"), async (req, res, next) => {
  try {
    const q = req.validatedQuery as z.infer<typeof listQuery>;
    const [items, unreadCount] = await Promise.all([
      notificationsService.listForUser(req.auth!.sub, q),
      notificationsService.unreadCount(req.auth!.sub),
    ]);
    res.json({ items, unreadCount });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.get("/unread-count", authenticate, async (req, res, next) => {
  try {
    res.json({ unreadCount: await notificationsService.unreadCount(req.auth!.sub) });
  } catch (err) {
    next(err);
  }
});

const markReadSchema = z.object({ ids: z.array(z.string().uuid()).optional() });

notificationsRouter.post("/read", authenticate, validate(markReadSchema), async (req, res, next) => {
  try {
    await notificationsService.markRead(req.auth!.sub, req.body.ids);
    res.json({ unreadCount: await notificationsService.unreadCount(req.auth!.sub) });
  } catch (err) {
    next(err);
  }
});

// ── Preferences ───────────────────────────────────────────────────────────

const prefsSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  statusChanges: z.boolean().optional(),
  assignments: z.boolean().optional(),
  slaAlerts: z.boolean().optional(),
});

notificationsRouter.get("/preferences", authenticate, async (req, res, next) => {
  try {
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: req.auth!.sub },
      update: {},
      create: { userId: req.auth!.sub },
    });
    res.json(prefs);
  } catch (err) {
    next(err);
  }
});

notificationsRouter.patch("/preferences", authenticate, validate(prefsSchema), async (req, res, next) => {
  try {
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: req.auth!.sub },
      update: req.body,
      create: { userId: req.auth!.sub, ...req.body },
    });
    res.json(prefs);
  } catch (err) {
    next(err);
  }
});
