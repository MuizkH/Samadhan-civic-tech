import { useState, useEffect, useCallback } from "react";
import { AuthUser } from "@/shared/types/domain/AuthUser";
import { gamificationService } from "../../profile/services/gamificationService";
import { issueRepository, issueService } from "@/features/issues";
import { issueVerificationService } from "@/features/issues/services/issueVerificationService";
import { Issue } from "@/shared/types/domain/Issue";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/shared/services/logger";
import { adminService } from "@/features/admin/services/adminService";
import { UserRole } from "@/shared/types/domain/UserRole";
import { getErrorMessage } from "@/shared/lib/errorMessage";
import { categoryCodeOf } from "@/shared/types/domain/categoryRef";

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

// Helper for Haversine distance calculation in kilometers
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function useDashboardIssues(
  user: AuthUser | null,
  activeLanguage: "en" | "hi",
  userCoords: { lat: number; lng: number } | null = null
) {
  const { toast } = useToast();
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]); // proximity filtered
  const [supportedIssues, setSupportedIssues] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [supportingId, setSupportingId] = useState<string | null>(null);
  const [isNearbyMode, setIsNearbyMode] = useState(false);

  // Dashboard counters come from /analytics/overview (see useAnalytics) —
  // recomputing them here would only ever describe the loaded page of
  // issues, not the whole dataset.

  // Realtime subscription setup
  useEffect(() => {
    const unsubscribe = issueRepository.subscribeToIssuesChange((payload) => {
      logger.info("Realtime reported_issues change received:", payload);
      if (payload.eventType === "INSERT") {
        const newIssue = issueService.mapResponseToDomain(payload.new!);
        setAllIssues((prev) => [newIssue, ...prev]);
        setIssues((prev) => [newIssue, ...prev]);
      } else if (payload.eventType === "UPDATE") {
        const updatedIssue = issueService.mapResponseToDomain(payload.new!);
        setAllIssues((prev) => prev.map((issue) => (issue.id === updatedIssue.id ? updatedIssue : issue)));
        setIssues((prev) => prev.map((issue) => (issue.id === updatedIssue.id ? updatedIssue : issue)));
      } else if (payload.eventType === "DELETE") {
        setAllIssues((prev) => prev.filter((issue) => issue.id !== payload.old.id));
        setIssues((prev) => prev.filter((issue) => issue.id !== payload.old.id));
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const fetchIssues = useCallback(async () => {
    try {
      setLoading(true);

      let limit = userCoords ? 100 : 20;
      let isDeptAdminUser = false;
      let userDeptCode: string | null = null;
      let userCity: string | null = null;

      if (user?.id) {
        try {
          const roleInfo = await adminService.getUserRole(user.id);
          if (roleInfo.role === UserRole.DEPARTMENT_ADMIN) {
            isDeptAdminUser = true;
            userCity = roleInfo.city;
            limit = 500; // fetch all so we can filter correctly on frontend
            const depts = await adminService.listDepartments();
            const found = depts.find((d) => d.id === roleInfo.department);
            if (found) {
              userDeptCode = found.code;
            }
          }
        } catch (err) {
          logger.info("Could not fetch user role in fetchIssues:", err);
        }
      }

      const raw = await issueRepository.fetchAllIssues(limit);
      let mapped = raw.map((item) => issueService.mapResponseToDomain(item));

      if (isDeptAdminUser && userDeptCode) {
        mapped = mapped.filter((issue) => {
          if (
            userCity &&
            (!issue.location || !issue.location.toLowerCase().includes(userCity.toLowerCase()))
          ) {
            return false;
          }
          const issueCategoryCode = categoryCodeOf(issue.category);
          if (userDeptCode && !doesCategoryBelongToDepartment(issueCategoryCode, userDeptCode)) {
            return false;
          }
          return true;
        });
      }

      setAllIssues(mapped);

      // Load real community-verification counts for what's on screen. Until
      // this resolves the UI shows zeroes rather than invented numbers.
      void issueVerificationService.prefetch(mapped.map((i) => i.id));

      if (userCoords) {
        const withDistance = mapped
          .filter((issue) => issue.latitude !== null && issue.longitude !== null)
          .map((issue) => {
            const dist = haversineDistance(userCoords.lat, userCoords.lng, issue.latitude!, issue.longitude!);
            return { issue, dist };
          });

        // Filter to issues within 50km radius
        const nearby = withDistance.filter((item) => item.dist <= 50);

        if (nearby.length > 0) {
          // Sort by distance (closest first)
          nearby.sort((a, b) => a.dist - b.dist);
          setIssues(nearby.map((n) => n.issue));
          setIsNearbyMode(true);
        } else {
          // Fallback to showing all issues if none found within 50km
          setIssues(mapped);
          setIsNearbyMode(false);
        }
      } else {
        setIssues(mapped);
        setIsNearbyMode(false);
      }
    } catch (err) {
      logger.error("Failed to load issues:", err);
      toast({
        title: activeLanguage === "en" ? "Error" : "त्रुटि",
        description: activeLanguage === "en" ? "Failed to load issues" : "समस्याएं लोड करने में विफल",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, userCoords, activeLanguage, toast]);

  const fetchUserSupports = useCallback(async () => {
    if (!user) return;
    try {
      const supports = await issueRepository.fetchUserSupports(user.id);
      setSupportedIssues(new Set(supports.map((s) => s.issue_id)));
    } catch (err) {
      logger.error("Failed to load user supports:", err);
    }
  }, [user]);

  // Declared after both callbacks so their identities exist first.
  useEffect(() => {
    fetchIssues();
    if (user) {
      fetchUserSupports();
    } else {
      setSupportedIssues(new Set());
    }
  }, [user, userCoords, fetchIssues, fetchUserSupports]);

  const handleSupport = async (issueId: string) => {
    if (!user) {
      toast({
        title: activeLanguage === "en" ? "Sign in Required" : "साइन इन आवश्यक",
        description:
          activeLanguage === "en"
            ? "Please sign in to support this issue."
            : "इस समस्या का समर्थन करने के लिए कृपया साइन इन करें।",
        variant: "destructive",
      });
      return;
    }

    setSupportingId(issueId);
    const isSupported = supportedIssues.has(issueId);

    // Optimistic UI updates
    setSupportedIssues((prev) => {
      const updated = new Set(prev);
      if (isSupported) updated.delete(issueId);
      else updated.add(issueId);
      return updated;
    });

    setIssues((prev) =>
      prev.map((issue) =>
        issue.id === issueId
          ? {
              ...issue,
              supportsCount: Math.max(0, issue.supportsCount + (isSupported ? -1 : 1)),
            }
          : issue
      )
    );

    setAllIssues((prev) =>
      prev.map((issue) =>
        issue.id === issueId
          ? {
              ...issue,
              supportsCount: Math.max(0, issue.supportsCount + (isSupported ? -1 : 1)),
            }
          : issue
      )
    );

    try {
      await issueService.toggleSupport(issueId, user.id, isSupported);
      gamificationService.dispatchGamificationUpdate();
      if (!isSupported) {
        const _title = allIssues.find((i) => i.id === issueId)?.title;
        await issueVerificationService.voteOnIssue(issueId, "confirm");

        toast({
          title: activeLanguage === "en" ? "Issue Supported!" : "समस्या समर्थित!",
          description:
            activeLanguage === "en"
              ? "Thank you for supporting this community issue."
              : "इस सामुदायिक समस्या का समर्थन करने के लिए धन्यवाद।",
        });
      }
    } catch (err) {
      logger.error("Failed to toggle support:", err);
      // Rollback optimistic state
      setSupportedIssues((prev) => {
        const rollback = new Set(prev);
        if (isSupported) rollback.add(issueId);
        else rollback.delete(issueId);
        return rollback;
      });
      setIssues((prev) =>
        prev.map((issue) =>
          issue.id === issueId
            ? {
                ...issue,
                supportsCount: Math.max(0, issue.supportsCount + (isSupported ? 1 : -1)),
              }
            : issue
        )
      );
      setAllIssues((prev) =>
        prev.map((issue) =>
          issue.id === issueId
            ? {
                ...issue,
                supportsCount: Math.max(0, issue.supportsCount + (isSupported ? 1 : -1)),
              }
            : issue
        )
      );

      toast({
        title: activeLanguage === "en" ? "Error" : "त्रुटि",
        description: getErrorMessage(err, "Failed to process support request."),
        variant: "destructive",
      });
    } finally {
      setSupportingId(null);
    }
  };

  return {
    issues,
    allIssues,
    supportedIssues,
    loading,
    supportingId,
    handleSupport,
    isNearbyMode,
    refetch: fetchIssues,
  };
}
