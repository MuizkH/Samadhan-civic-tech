import { Router } from "express";
import { issuesService } from "../issues/issues.service.js";
import { verificationService } from "../issues/verification.service.js";
import { authenticate } from "../../shared/middleware/authenticate.js";

export const usersRouter = Router();

usersRouter.get("/me/supports", authenticate, async (req, res, next) => {
  try {
    res.json(await issuesService.listSupportedByUser(req.auth!.sub));
  } catch (err) {
    next(err);
  }
});

/** Real contribution counts backing the Community Hero widget. */
usersRouter.get("/me/stats", authenticate, async (req, res, next) => {
  try {
    res.json(await verificationService.getUserStats(req.auth!.sub));
  } catch (err) {
    next(err);
  }
});
