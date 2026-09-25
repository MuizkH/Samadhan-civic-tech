import { z } from "zod";

export const updateWorkOrderStatusSchema = z.object({
  status: z.enum(["pending", "acknowledged", "in_progress", "done", "rejected"]),
  reason: z.string().max(1000).optional(),
});
