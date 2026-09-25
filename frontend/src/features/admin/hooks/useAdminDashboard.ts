/**
 * useAdminDashboard.ts
 * --------------------
 * Department work queue, served and scoped entirely by the backend.
 *
 * Filtering, sorting and pagination are query parameters on
 * GET /departments/:id/queue — a dept_admin cannot widen their own scope by
 * editing client state, because the route enforces the department itself.
 *
 * Scope has two dimensions: department AND city. A department row is shared by
 * every city it operates in, so the backend also narrows the queue to the
 * admin's own city and ignores any `city` param they send. The city state here
 * is therefore presentational for a dept_admin (it labels the jurisdiction) and
 * only functional for a super admin, who may switch between cities.
 *
 * Live updates arrive over SSE (GET /departments/:id/stream) rather than
 * polling; EventSource reconnects on its own if the connection drops.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { AuthUser } from "@/shared/types/domain/AuthUser";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/shared/hooks/use-toast";
import { adminService, QueueFilters, QueueItem } from "../services/adminService";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { UserRole } from "@/shared/types/domain/UserRole";
import { logger } from "@/shared/services/logger";
import { ROUTES } from "@/shared/config/routes";
import { useEventStream } from "@/shared/hooks/useEventStream";

/**
 * StreamEvent.payload is Record<string, unknown> by design — the bus carries
 * several event shapes. This narrows the one field the toast needs without
 * pretending to know the rest.
 */
function issueTitleFrom(payload: Record<string, unknown>): string {
  const issue = payload.issue;
  if (typeof issue === "object" && issue !== null) {
    const title = (issue as { title?: unknown }).title;
    if (typeof title === "string") return title;
  }
  return "";
}
import { getErrorMessage } from "@/shared/lib/errorMessage";

export interface AdminDepartment {
  id: string;
  code: string;
  nameEn: string;
  nameHi: string;
}

const PAGE_SIZE = 20;

export function useAdminDashboard(user: AuthUser | null, authLoading: boolean, activeLanguage: "en" | "hi") {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userDepartment, setUserDepartment] = useState<string | null>(null);
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState<string | null>(null);
  /** The signed-in admin's own city — null for a super admin (state-wide). */
  const [userCity, setUserCity] = useState<string | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  /** Super-admin city selection; null means "all cities". */
  const [activeCity, setActiveCity] = useState<string | null>(null);

  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Omit<QueueFilters, "page" | "pageSize" | "departmentId">>({
    sort: "created_desc",
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ── Identify the admin and resolve their scope ───────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate(ROUTES.SIGN_IN);
      return;
    }

    (async () => {
      try {
        const { role, department, city } = await adminService.getUserRole(user.id);
        const admin = role === UserRole.DEPARTMENT_ADMIN || role === UserRole.SUPER_ADMIN;
        setIsAdmin(admin);
        setUserRole(role);
        setUserDepartment(department);
        setUserCity(city);

        if (!admin) return;

        if (role === UserRole.SUPER_ADMIN) {
          const [list, cityList] = await Promise.all([
            adminService.listDepartments(),
            adminService.listCities(),
          ]);
          setDepartments(list);
          setActiveDepartmentId(list[0]?.id ?? null);
          setCities(cityList);
          // Defaults to "all cities" so the super admin's landing view is the
          // state-wide picture their role exists to provide.
          setActiveCity(null);
        } else {
          setActiveDepartmentId(department);
          setCities(city ? [city] : []);
          setActiveCity(city);
        }
      } catch (err) {
        logger.error("Failed to resolve admin permissions:", err);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, navigate]);

  // ── Load the queue whenever scope, filters or page change ────────────────
  const loadQueue = useCallback(async () => {
    if (!activeDepartmentId) return;
    setLoading(true);
    try {
      const result = await adminService.fetchQueue({
        ...filters,
        departmentId: activeDepartmentId,
        // Ignored by the backend for a dept_admin, who is pinned to their own
        // city regardless. Sent unconditionally so the super-admin path needs
        // no special case here.
        city: activeCity ?? undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      logger.error("Failed to load department queue:", err);
      setError(getErrorMessage(err, "Failed to load the department queue."));
    } finally {
      setLoading(false);
    }
  }, [activeDepartmentId, activeCity, filters, page]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  // ── Live queue updates over SSE ──────────────────────────────────────────
  const streamPath = isAdmin && activeDepartmentId ? `/departments/${activeDepartmentId}/stream` : null;

  const { connected: isRealTimeConnected } = useEventStream(
    streamPath,
    useCallback(
      (event) => {
        logger.info("Admin stream event:", event.type);
        if (event.type === "issue.created") {
          toast({
            title: activeLanguage === "en" ? "New issue reported" : "नई समस्या दर्ज",
            description: issueTitleFrom(event.payload),
          });
        }
        // The queue projection joins several tables; refetching is cheaper to
        // reason about than patching rows in place, and keeps totals honest.
        void loadQueue();
      },
      [activeLanguage, toast, loadQueue]
    )
  );

  // ── Mutations ────────────────────────────────────────────────────────────

  /**
   * Moves an issue through the lifecycle. The backend rejects illegal
   * transitions with 422 and requires a note + proof photo on "resolved";
   * those errors are surfaced verbatim rather than swallowed.
   */
  const updateStatus = async (
    issueId: string,
    status: IssueStatus,
    options: { reason?: string; resolutionNote?: string; proofUrl?: string } = {}
  ) => {
    setUpdatingId(issueId);
    try {
      await adminService.updateIssueStatus(issueId, status, options);
      toast({ title: activeLanguage === "en" ? "Status updated" : "स्थिति अपडेट की गई" });
      await loadQueue();
      return true;
    } catch (err) {
      logger.error("Failed to update status:", err);
      toast({
        title: activeLanguage === "en" ? "Could not update status" : "स्थिति अपडेट नहीं हुई",
        description: getErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  return {
    isAdmin,
    userRole,
    userDepartment,
    departments,
    activeDepartmentId,
    setActiveDepartmentId: (id: string) => {
      setActiveDepartmentId(id);
      setPage(1);
    },
    userCity,
    cities,
    activeCity,
    setActiveCity: (city: string | null) => {
      setActiveCity(city);
      setPage(1);
    },
    /**
     * True when the account is a department admin with no city on record. The
     * backend fails closed in that case, so the queue is legitimately empty —
     * the UI needs to say why rather than imply there is no work.
     */
    missingCityAssignment: userRole === UserRole.DEPARTMENT_ADMIN && !userCity,
    items,
    total,
    page,
    totalPages,
    setPage,
    filters,
    setFilters: (next: Partial<typeof filters>) => {
      setFilters((prev) => ({ ...prev, ...next }));
      setPage(1);
    },
    loading,
    error,
    updatingId,
    isRealTimeConnected,
    updateStatus,
    refetch: loadQueue,
  };
}
