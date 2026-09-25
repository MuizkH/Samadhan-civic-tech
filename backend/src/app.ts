import express from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./shared/lib/logger.js";
import { auditContext } from "./shared/middleware/auditContext.js";
import { errorHandler } from "./shared/middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.controller.js";
import { issuesRouter } from "./modules/issues/issues.controller.js";
import { departmentsRouter } from "./modules/departments/departments.controller.js";
import { workOrdersRouter } from "./modules/workOrders/workOrders.controller.js";
import { uploadsRouter } from "./modules/uploads/uploads.controller.js";
import { usersRouter } from "./modules/users/users.controller.js";
import { analyticsRouter } from "./modules/analytics/analytics.controller.js";
import { notificationsRouter } from "./modules/notifications/notifications.controller.js";
import { publicRouter } from "./modules/publicTransparency/publicTransparency.controller.js";
import { aiRouter } from "./modules/ai/ai.controller.js";

export function createApp() {
  const app = express();

  // Strict exact-match CORS allowlist — never reflect arbitrary Origin headers.
  // env.CORS_ORIGIN is a string[] parsed and validated at startup (see env.ts).
  const allowedOrigins = new Set(env.CORS_ORIGIN);
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin / non-browser requests (no Origin header).
        if (origin === undefined || allowedOrigins.has(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin "${origin}" is not allowed by CORS policy`));
        }
      },
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(pinoHttp({ logger }));
  app.use(auditContext);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/auth", authRouter);
  app.use("/issues", issuesRouter);
  app.use("/departments", departmentsRouter);
  app.use("/work-orders", workOrdersRouter);
  app.use("/uploads", uploadsRouter);
  app.use("/users", usersRouter);
  app.use("/analytics", analyticsRouter);
  app.use("/notifications", notificationsRouter);
  // Open, unauthenticated transparency scorecard.
  app.use("/public", publicRouter);
  app.use("/ai", aiRouter);

  app.use(errorHandler);

  return app;
}
