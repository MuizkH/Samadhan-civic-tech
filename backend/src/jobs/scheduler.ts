import { PgBoss } from "pg-boss";
import { env } from "../config/env.js";
import { logger } from "../shared/lib/logger.js";
import { runSlaSweep } from "./slaMonitor.js";
import { runNotificationDispatch } from "./notificationWorker.js";
import { runAiJob, AiJob } from "./aiWorker.js";

/**
 * pg-boss owns the schedule, using the same Postgres instance as the app —
 * no Redis, no separate broker. It creates its own `pgboss` schema.
 */

const SLA_QUEUE = "sla-sweep";
const NOTIFY_QUEUE = "notification-dispatch";
const AI_QUEUE = "ai-tasks";

let boss: PgBoss | null = null;

export async function startScheduler(): Promise<PgBoss | null> {
  if (env.NODE_ENV === "test" || env.DISABLE_JOBS) {
    logger.info("Background jobs disabled");
    return null;
  }

  let connectionString = env.DIRECT_URL && env.DIRECT_URL.length > 0 ? env.DIRECT_URL : env.DATABASE_URL;
  connectionString = connectionString.replace(/([?&])channel_binding=[^&]*&?/g, "$1").replace(/[?&]$/, "");

  boss = new PgBoss({
    connectionString,
    schema: "pgboss",
    ssl: { rejectUnauthorized: false },
  });

  boss.on("error", (err: unknown) => logger.error({ err }, "pg-boss error"));

  try {
    await boss.start();

    await boss.createQueue(SLA_QUEUE);
    await boss.createQueue(NOTIFY_QUEUE);
    await boss.createQueue(AI_QUEUE);

    await boss.work(SLA_QUEUE, async () => {
      await runSlaSweep();
    });
    await boss.work(NOTIFY_QUEUE, async () => {
      await runNotificationDispatch();
    });
    // On demand, not scheduled: enqueued by the request path so the caller
    // never waits on a model.
    await boss.work<AiJob>(AI_QUEUE, async ([job]) => {
      await runAiJob(job.data);
    });

    // Detect SLA breaches every 5 minutes; drain the notification queue every
    // minute so the bell feels responsive.
    await boss.schedule(SLA_QUEUE, "*/5 * * * *");
    await boss.schedule(NOTIFY_QUEUE, "* * * * *");

    // Don't make the first sweep wait for the first cron tick.
    await boss.send(SLA_QUEUE, {});
    await boss.send(NOTIFY_QUEUE, {});

    logger.info("Scheduler started: SLA sweep every 5m, notification dispatch every 1m");
    return boss;
  } catch (err) {
    logger.error({ err }, "Failed to start background scheduler");
    return null;
  }
}

/**
 * Queues an AI task. Deliberately fire-and-forget: if the queue is
 * unavailable the caller carries on and the issue simply has no AI fields.
 */
export async function enqueueAi(job: AiJob): Promise<void> {
  if (!boss) return;
  try {
    await boss.send(AI_QUEUE, job as unknown as object);
  } catch (err) {
    logger.warn({ err, job }, "Could not enqueue AI job");
  }
}

export async function stopScheduler(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true });
    boss = null;
  }
}
