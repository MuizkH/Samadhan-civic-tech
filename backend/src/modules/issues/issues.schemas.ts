import { z } from "zod";

export const createIssueSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(1).max(5000),
  categoryCode: z.string().min(1),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  address: z.string().max(500).optional(),
  /** Cloudinary URLs of evidence photos already uploaded by the client. */
  imageUrls: z.array(z.string().url()).max(5).optional(),
  // Set once the citizen has already seen a duplicateCandidate and
  // explicitly said "this is a different issue" — skips the dedup check.
  force: z.boolean().optional().default(false),
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const listIssuesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // The civic map plots every geotagged issue in one pass, so the ceiling
  // has to clear a whole city's backlog — 100 silently truncated it to an
  // empty map once the dataset grew past a page.
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  categoryCode: z.string().optional(),
  status: z
    .enum([
      "reported",
      "acknowledged",
      "in_progress",
      "resolved",
      "verified",
      "rejected",
      "reopened",
      "closed",
    ])
    .optional(),
  departmentId: z.string().uuid().optional(),
  /**
   * Municipal jurisdiction filter. Callers may narrow to a city; for a
   * dept_admin the controller overrides whatever is passed here with the city
   * on their token, so it can only ever narrow, never widen.
   */
  city: z.string().max(120).optional(),
  reportedBy: z.string().uuid().optional(),
  supportedBy: z.string().uuid().optional(),
  // bbox = minLng,minLat,maxLng,maxLat
  bbox: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map(Number) : undefined))
    .refine(
      (v) => !v || (v.length === 4 && v.every((n) => Number.isFinite(n))),
      "bbox must be minLng,minLat,maxLng,maxLat"
    ),
});
export type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>;

export const confirmDuplicateSchema = z.object({
  duplicateOfId: z.string().uuid(),
  description: z.string().min(1).max(5000),
});
export type ConfirmDuplicateInput = z.infer<typeof confirmDuplicateSchema>;

export const ISSUE_STATUSES = [
  "reported",
  "acknowledged",
  "in_progress",
  "resolved",
  "verified",
  "rejected",
  "reopened",
  "closed",
] as const;

export const transitionStatusSchema = z.object({
  status: z.enum(ISSUE_STATUSES),
  reason: z.string().max(1000).optional(),
  resolutionNote: z.string().max(5000).optional(),
  proofUrl: z.string().url().optional(),
  proofPublicId: z.string().max(300).optional(),
});

export const reopenSchema = z.object({
  reason: z.string().min(1, "Please say why this issue should be reopened.").max(1000),
});

export const verifyIssueSchema = z.object({
  /** true = confirms the issue is real, false = disputes it */
  vote: z.boolean(),
});

/**
 * Bulk verification lookup. Accepts a comma-separated id list and caps it at
 * the largest page the UI ever renders, so the endpoint cannot be used to
 * pull the whole table in one request.
 */
export const bulkVerificationQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((raw) =>
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid()).min(1).max(100)),
});
