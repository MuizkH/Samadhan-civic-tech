/** Manual trigger for the SLA + notification workers, used when verifying. */
import "dotenv/config";
import { runSlaSweep } from "../src/jobs/slaMonitor.js";
import { runNotificationDispatch } from "../src/jobs/notificationWorker.js";
import { prisma } from "../src/shared/lib/prisma.js";

async function main() {
  const sweep = await runSlaSweep();
  console.log("SLA sweep:", JSON.stringify(sweep));

  const dispatch = await runNotificationDispatch();
  console.log("Notification dispatch:", JSON.stringify(dispatch));

  const escalations = await prisma.escalation.count();
  const notifications = await prisma.notification.count();
  const breached = await prisma.workOrder.count({ where: { breachedAt: { not: null } } });
  console.log(`escalations=${escalations} notifications=${notifications} breachedWorkOrders=${breached}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
