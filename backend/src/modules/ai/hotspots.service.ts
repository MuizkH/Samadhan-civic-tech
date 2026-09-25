import { prisma } from "../../shared/lib/prisma.js";

/**
 * Recurring-risk hotspots.
 *
 * This is NOT a model and makes no prediction in the machine-learning sense.
 * It is a historical count: group past issues by a coarse geographic grid
 * cell, category and calendar month, and report cells where the same kind of
 * problem has recurred in the same month across multiple years — monsoon
 * waterlogging being the obvious case.
 *
 * It is described that way in the API response and in the UI on purpose.
 * Calling a GROUP BY "AI prediction" would be a lie, and the honest version
 * is more useful to a department planning a pre-monsoon desilting round.
 */

/** ~1.1 km at these latitudes. Coarse enough to group, fine enough to act on. */
const GRID = 0.01;

export interface RecurringHotspot {
  latitude: number;
  longitude: number;
  categoryCode: string;
  categoryName: string;
  month: number;
  monthName: string;
  occurrences: number;
  distinctYears: number;
  /** occurrences per year observed — the "risk" signal, plainly derived. */
  averagePerYear: number;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const hotspotsService = {
  /**
   * Cells where a category has recurred in the same month in at least
   * `minYears` different years.
   */
  async recurring(opts: { minYears?: number; limit?: number } = {}): Promise<{
    method: string;
    note: string;
    items: RecurringHotspot[];
  }> {
    const minYears = opts.minYears ?? 2;
    const limit = opts.limit ?? 25;

    const rows = await prisma.$queryRaw<
      {
        cell_lat: number;
        cell_lng: number;
        category_code: string;
        category_name: string;
        month: number;
        occurrences: bigint;
        distinct_years: bigint;
      }[]
    >`
      SELECT
        FLOOR(ST_Y(i.location::geometry) / ${GRID}) * ${GRID} AS cell_lat,
        FLOOR(ST_X(i.location::geometry) / ${GRID}) * ${GRID} AS cell_lng,
        c.code  AS category_code,
        c.name_en AS category_name,
        EXTRACT(MONTH FROM i.created_at)::int AS month,
        COUNT(*) AS occurrences,
        COUNT(DISTINCT EXTRACT(YEAR FROM i.created_at)) AS distinct_years
      FROM issues i
      JOIN issue_categories c ON c.id = i.category_id
      GROUP BY 1, 2, 3, 4, 5
      HAVING COUNT(DISTINCT EXTRACT(YEAR FROM i.created_at)) >= ${minYears}
      ORDER BY COUNT(*) DESC
      LIMIT ${limit}
    `;

    return {
      method: "historical-aggregation",
      note: "Statistical recurrence over past reports grouped by ~1km grid cell, category and calendar month. Not a machine-learning prediction.",
      items: rows.map((r) => {
        const occurrences = Number(r.occurrences);
        const distinctYears = Number(r.distinct_years);
        return {
          latitude: Number(r.cell_lat) + GRID / 2,
          longitude: Number(r.cell_lng) + GRID / 2,
          categoryCode: r.category_code,
          categoryName: r.category_name,
          month: r.month,
          monthName: MONTHS[r.month - 1] ?? String(r.month),
          occurrences,
          distinctYears,
          averagePerYear: Math.round((occurrences / distinctYears) * 10) / 10,
        };
      }),
    };
  },
};
