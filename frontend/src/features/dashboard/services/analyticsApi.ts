import { apiRequest } from "@/shared/lib/apiClient";

/**
 * Thin client over the server-side analytics endpoints. All aggregation
 * happens in SQL — the frontend only renders what it is given, so no
 * numbers are invented or recomputed here.
 */

export interface AnalyticsOverview {
  totals: {
    issues: number;
    geoTagged: number;
    reportedThisWeek: number;
    reopened: number;
    resolved: number;
    open: number;
    supports: number;
  };
  byStatus: { status: string; count: number }[];
  byCategory: { code: string; nameEn: string; count: number }[];
  resolutionTime: { avgHours: number | null; p90Hours: number | null };
}

export interface DepartmentPerformanceRow {
  departmentId: string;
  code: string;
  nameEn: string;
  totalIssues: number;
  openIssues: number;
  resolvedIssues: number;
  resolutionRate: number;
  avgResolutionHours: number | null;
  p90ResolutionHours: number | null;
}

export interface Hotspot {
  latitude: number;
  longitude: number;
  count: number;
  openCount: number;
  topCategory: string | null;
}

export interface TrendPoint {
  month: string;
  reported: number;
  resolved: number;
}

export const analyticsApi = {
  overview: () => apiRequest<AnalyticsOverview>("/analytics/overview", { auth: true }),
  departments: () =>
    apiRequest<{ items: DepartmentPerformanceRow[] }>("/analytics/departments", { auth: true }),
  hotspots: () => apiRequest<{ precision: number; items: Hotspot[] }>("/analytics/hotspots", { auth: true }),
  trends: (months = 6) =>
    apiRequest<{ items: TrendPoint[] }>(`/analytics/trends?months=${months}`, { auth: true }),
};
