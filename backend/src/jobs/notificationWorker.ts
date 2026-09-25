import { Resend } from "resend";
import { prisma } from "../shared/lib/prisma.js";
import { logger } from "../shared/lib/logger.js";
import { env } from "../config/env.js";
import { renderTemplate, NotificationTemplate } from "../modules/notifications/notifications.service.js";

/**
 * Delivers queued notifications.
 *
 * in_app rows are "delivered" the moment they exist — the feed reads them
 * straight from the table — so they are just marked sent. Email goes out
 * through Resend, and a failure is recorded on the row rather than thrown
 * away, so the queue is auditable.
 */

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function runNotificationDispatch(batchSize = 50): Promise<{ sent: number; failed: number }> {
  const pending = await prisma.notification.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: batchSize,
    include: { recipient: { select: { email: true, fullName: true } } },
  });

  let sent = 0;
  let failed = 0;
  const now = new Date();

  for (const n of pending) {
    if (n.channel === "in_app") {
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "sent", sentAt: now },
      });
      sent++;
      continue;
    }

    // Email. Without a configured key we mark it failed with a clear
    // reason rather than pretending it went out.
    if (!resend) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "failed", error: "RESEND_API_KEY is not configured" },
      });
      failed++;
      continue;
    }

    const copy = renderTemplate(
      n.template as NotificationTemplate,
      (n.payload ?? {}) as Record<string, unknown>
    );
    let to = n.recipient.email;
    if (env.NODE_ENV !== "production" && env.DEV_EMAIL_OVERRIDE) {
      logger.info(
        {
          intendedRecipient: n.recipient.email,
          overrideRecipient: env.DEV_EMAIL_OVERRIDE,
          notificationId: n.id,
        },
        "DEV_EMAIL_OVERRIDE active — redirecting outbound email"
      );
      to = env.DEV_EMAIL_OVERRIDE;
    }
    try {
      await resend.emails.send({
        from: env.NOTIFICATION_FROM_EMAIL,
        to,
        subject: `Samadhan — ${copy.title}`,
        text: `${copy.body}\n\n— Samadhan Civic Platform`,
      });
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "sent", sentAt: new Date() },
      });
      sent++;
    } catch (err: unknown) {
      logger.error({ err, notificationId: n.id }, "Email delivery failed");
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 500) },
      });
      failed++;
    }
  }

  if (sent || failed) logger.info({ sent, failed }, "Notification dispatch complete");
  return { sent, failed };
}
