import { useCallback, useEffect, useState } from "react";
import {
  analyticsApi,
  AnalyticsOverview,
  DepartmentPerformanceRow,
  Hotspot,
  TrendPoint,
} from "../services/analyticsApi";
import { logger } from "@/shared/services/logger";
import { getErrorMessage } from "@/shared/lib/errorMessage";
import { categoryCodeOf } from "@/shared/types/domain/categoryRef";
import { useAuth } from "@/features/auth";
import { adminService } from "@/features/admin/services/adminService";
import { UserRole } from "@/shared/types/domain/UserRole";
import { issueRepository } from "@/features/issues/repositories/issueRepository";
import { issueService } from "@/features/issues/services/issueService";

export interface AnalyticsBundle {
  overview: AnalyticsOverview | null;
  departments: DepartmentPerformanceRow[];
  hotspots: Hotspot[];
  trends: TrendPoint[];
  byPriority?: { nameEn: string; nameHi: string; count: number; color: string }[];
}

const EMPTY: AnalyticsBundle = { overview: null, departments: [], hotspots: [], trends: [], byPriority: [] };

function getCategoryCode(category: string): string {
  if (!category) return "";
  const normalized = category.toLowerCase().trim();
  if (normalized.includes("water")) return "water";
  if (normalized.includes("sanitation") || normalized.includes("garbage") || normalized.includes("trash"))
    return "sanitation";
  if (normalized.includes("electricity") || normalized.includes("electric") || normalized.includes("power"))
    return "electricity";
  if (normalized.includes("road")) return "roads";
  if (normalized.includes("park") || normalized.includes("garden")) return "parks";
  if (normalized.includes("building")) return "buildings";
  if (
    normalized.includes("metro") ||
    normalized.includes("station") ||
    normalized.includes("train") ||
    normalized.includes("transit")
  )
    return "metro";
  return normalized;
}

function doesCategoryBelongToDepartment(categoryCode: string, deptCode: string): boolean {
  const code = getCategoryCode(categoryCode);
  if (deptCode === "water_supply") return code === "water";
  return code === deptCode;
}

/**
 * One shared fetch per (months, user) pair, not one per component.
 *
 * The dashboard mounts this hook from several places at once. Each instance
 * used to run its own analytics requests, so a single load fired every
 * endpoint four times over. Concurrent callers now join the in-flight promise
 * and later mounts read the cache. Keyed by user as well as months because
 * the officer scoping below produces a different bundle per user.
 */
const cache = new Map<string, AnalyticsBundle>();
const inFlight = new Map<string, Promise<AnalyticsBundle>>();
const listeners = new Map<string, Set<() => void>>();

const keyFor = (months: number, userId?: string) => `${months}|${userId ?? "anon"}`;

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

/** Their officer-scoped aggregation, lifted out of the hook so it can be shared. */
async function fetchBundle(months: number, user: { id?: string } | null): Promise<AnalyticsBundle> {
  // 1. Fetch raw analytics data
  const [overview, departmentsData, hotspotsData, trendsData] = await Promise.all([
    analyticsApi.overview(),
    analyticsApi.departments(),
    analyticsApi.hotspots(),
    analyticsApi.trends(months),
  ]);

  const scopedOverview = { ...overview };
  let scopedDepartments = [...departmentsData.items];
  let scopedHotspots = [...hotspotsData.items];
  let scopedTrends = [...trendsData.items];
  let scopedPriority: { nameEn: string; nameHi: string; count: number; color: string }[] = [];

  // 2. Resolve admin scope
  if (user?.id) {
    try {
      const roleInfo = await adminService.getUserRole(user.id);
      if (roleInfo.role === UserRole.DEPARTMENT_ADMIN) {
        const deptsList = await adminService.listDepartments();
        const myDept = deptsList.find((d) => d.id === roleInfo.department);
        const myDeptCode = myDept?.code;

        if (myDeptCode) {
          // Get all issues to filter and recalculate precisely
          const issuesRaw = await issueRepository.fetchAllIssuesForMap();
          const issuesMapped = issuesRaw.map((item) => issueService.mapResponseToDomain(item));

          const myIssues = issuesMapped.filter((issue) => {
            if (
              roleInfo.city &&
              (!issue.location || !issue.location.toLowerCase().includes(roleInfo.city.toLowerCase()))
            ) {
              return false;
            }
            const issueCategoryCode = categoryCodeOf(issue.category);
            if (!doesCategoryBelongToDepartment(issueCategoryCode, myDeptCode)) {
              return false;
            }
            return true;
          });

          // Filter department list to only show the officer's own department
          scopedDepartments = scopedDepartments.filter((d) => d.departmentId === roleInfo.department);
          const myDeptRow = scopedDepartments[0];

          // Recompute totals
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const reportedThisWeek = myIssues.filter((i) => new Date(i.createdAt) >= sevenDaysAgo).length;
          const supports = myIssues.reduce((acc, curr) => acc + curr.supportsCount, 0);
          const geoTagged = myIssues.filter((i) => i.latitude !== null && i.longitude !== null).length;
          const reopened = myIssues.filter((i) => (i.status as string) === "reopened").length;
          const resolved = myIssues.filter(
            (i) =>
              (i.status as string) === "resolved" ||
              (i.status as string) === "closed" ||
              (i.status as string) === "verified"
          ).length;
          const open = myIssues.filter(
            (i) =>
              (i.status as string) !== "resolved" &&
              (i.status as string) !== "closed" &&
              (i.status as string) !== "verified" &&
              (i.status as string) !== "rejected"
          ).length;

          scopedOverview.totals = {
            issues: myIssues.length,
            geoTagged,
            reportedThisWeek,
            reopened,
            resolved,
            open,
            supports,
          };

          // Recompute resolution times from department row
          scopedOverview.resolutionTime = {
            avgHours: myDeptRow?.avgResolutionHours ?? null,
            p90Hours: myDeptRow?.p90ResolutionHours ?? null,
          };

          // Filter category breakdown
          scopedOverview.byCategory = scopedOverview.byCategory.filter((c) =>
            doesCategoryBelongToDepartment(c.code, myDeptCode)
          );

          // Filter hotspots
          scopedHotspots = scopedHotspots.filter((h) => {
            return myIssues.some(
              (i) =>
                i.latitude &&
                i.longitude &&
                Math.abs(i.latitude - h.latitude) < 0.05 &&
                Math.abs(i.longitude - h.longitude) < 0.05
            );
          });

          // Recompute trends
          const monthNames = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ];
          const last6Months: string[] = [];
          for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            last6Months.push(monthNames[d.getMonth()]);
          }

          scopedTrends = last6Months.map((mName) => {
            const monthIssues = myIssues.filter((i) => {
              const iDate = new Date(i.createdAt);
              return monthNames[iDate.getMonth()] === mName;
            });
            const reported = monthIssues.length;
            const resolvedCount = monthIssues.filter(
              (i) =>
                (i.status as string) === "resolved" ||
                (i.status as string) === "closed" ||
                (i.status as string) === "verified"
            ).length;
            return { month: mName, reported, resolved: resolvedCount };
          });

          // Recompute Priority distribution for single department admin
          const counts = {
            critical: myIssues.filter((i) => i.priority === 1).length,
            high: myIssues.filter((i) => i.priority === 2).length,
            medium: myIssues.filter(
              (i) => i.priority === 3 || i.priority === null || i.priority === undefined || !i.priority
            ).length,
            low: myIssues.filter((i) => i.priority === 4).length,
          };

          scopedPriority = [
            { nameEn: "Critical", nameHi: "गंभीर", count: counts.critical, color: "#ef4444" },
            { nameEn: "High", nameHi: "उच्च", count: counts.high, color: "#f97316" },
            { nameEn: "Medium", nameHi: "मध्यम", count: counts.medium, color: "#3b82f6" },
            { nameEn: "Low", nameHi: "निम्न", count: counts.low, color: "#64748b" },
          ];
        }
      }
    } catch (err) {
      logger.info("Could not scope useAnalytics data to officer:", err);
    }
  }

  return {
    overview: scopedOverview,
    departments: scopedDepartments,
    hotspots: scopedHotspots,
    trends: scopedTrends,
    byPriority: scopedPriority,
  };
}

function loadShared(
  key: string,
  months: number,
  user: { id?: string } | null,
  force = false
): Promise<AnalyticsBundle> {
  const existing = inFlight.get(key);
  if (existing && !force) return existing;

  const promise = fetchBundle(months, user)
    .then((bundle) => {
      cache.set(key, bundle);
      inFlight.delete(key);
      notify(key);
      return bundle;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Loads every analytics figure from the server. Nothing is aggregated or
 * predicted client-side beyond the department scoping above, so whatever
 * renders here is what the database actually contains.
 */
export function useAnalytics(months = 6) {
  const { user } = useAuth();
  const key = keyFor(months, user?.id);

  const [data, setData] = useState<AnalyticsBundle>(() => cache.get(key) ?? EMPTY);
  const [loading, setLoading] = useState(() => !cache.has(key));
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    (force: boolean) => {
      setLoading(true);
      return loadShared(key, months, user ?? null, force)
        .then((bundle) => {
          setData(bundle);
          setError(null);
        })
        .catch((err: unknown) => {
          logger.error("Failed to load analytics:", err);
          setError(getErrorMessage(err, "Could not load analytics."));
        })
        .finally(() => setLoading(false));
    },
    [key, months, user]
  );

  useEffect(() => {
    let active = true;

    const onChange = () => {
      if (active) setData(cache.get(key) ?? EMPTY);
    };
    const set = listeners.get(key) ?? new Set<() => void>();
    set.add(onChange);
    listeners.set(key, set);

    const cached = cache.get(key);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      void run(false);
    }

    return () => {
      active = false;
      set.delete(onChange);
    };
  }, [key, run]);

  const refetch = useCallback(() => run(true), [run]);

  return { ...data, loading, error, refetch };
}
