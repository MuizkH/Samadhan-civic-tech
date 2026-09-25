import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./shared/lib/logger.js";
import { startScheduler, stopScheduler } from "./jobs/scheduler.js";

const app = createApp();

const server = app.listen(env.PORT, async () => {
  logger.info(`Samadhan backend listening on port ${env.PORT}`);
  try {
    await startScheduler();
  } catch (err) {
    // The API stays up even if the job runner cannot start; SLA sweeps
    // are degraded rather than the whole service being down.
    logger.error({ err }, "Failed to start background scheduler");
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await stopScheduler();
    server.close(() => process.exit(0));
  });
}
