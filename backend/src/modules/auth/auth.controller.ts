import { Router } from "express";
import { authService } from "./auth.service.js";
import { registerSchema, loginSchema, refreshSchema } from "./auth.schemas.js";
import { validate } from "../../shared/middleware/validate.js";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { rateLimit } from "../../shared/middleware/rateLimit.js";

export const authRouter = Router();

const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

authRouter.post("/register", authRateLimit, validate(registerSchema), async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", authRateLimit, validate(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", validate(refreshSchema), async (req, res, next) => {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await authService.me(req.auth!.sub);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
});
