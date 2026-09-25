import { useState, useEffect, useMemo, useRef, lazy, Suspense, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useAuth } from "@/features/auth";
import { useDashboardIssues } from "../hooks/useDashboardIssues";
import { Issue } from "@/shared/types/domain/Issue";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { ROUTES } from "@/shared/config/routes";
import { STATUS_LABELS } from "@/shared/constants/statuses";
import { LoadingState } from "@/shared/components/LoadingState";
import { EmptyState } from "@/shared/components/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { profileService } from "@/features/profile/services/profileService";
import { issueService } from "@/features/issues/services/issueService";
import { issueVerificationService } from "@/features/issues/services/issueVerificationService";
import { aiInsightService } from "@/features/issues/services/aiInsightService";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/shared/services/logger";
import {
  MapPin,
  ThumbsUp,
  Clock,
  Droplets,
  Trash2,
  Zap,
  Construction,
  AlertTriangle,
  CheckCircle2,
  Timer,
  Loader2,
  Plus,
  TreePine,
  Building2,
  User,
  Calendar,
  BarChart3,
  Map,
  ChevronDown,
  ChevronUp,
  Shield,
  X,
  Train,
} from "lucide-react";
import { useAnalytics } from "../hooks/useAnalytics";
import { formatResolutionTime } from "../services/dashboardService";
import { adminService } from "@/features/admin/services/adminService";
import { UserRole } from "@/shared/types/domain/UserRole";
import { DepartmentPerformanceCard, IssueHotspotsCard } from "../components/PerformanceCards";
import { imageProps } from "@/shared/lib/imageUrl";

// Charts and the issue-detail panels are deliberately split out of this
// route's chunk. AnalyticsPanel pulls in recharts (~46 KB gz on its own) and
// sits behind a collapse toggle; the three panels below only mount once a
// citizen opens an issue. Importing them statically put all of it on the
// critical path of every dashboard load.
const AnalyticsPanel = lazy(() =>
  import("../components/AnalyticsPanel").then((m) => ({ default: m.AnalyticsPanel }))
);
const AIInsightPanel = lazy(() =>
  import("@/features/issues/components/AIInsightPanel").then((m) => ({ default: m.AIInsightPanel }))
);
const ResolutionReviewPanel = lazy(() =>
  import("@/features/issues/components/ResolutionReviewPanel").then((m) => ({
    default: m.ResolutionReviewPanel,
  }))
);
const CoordinationPanel = lazy(() =>
  import("@/features/admin/components/CoordinationPanel").then((m) => ({ default: m.CoordinationPanel }))
);

/** Neutral placeholder while a split chunk arrives — same footprint, no layout shift. */
function PanelFallback({ className = "h-40" }: { className?: string }) {
  return <div className={`${className} rounded-2xl bg-muted/30 animate-pulse`} aria-hidden="true" />;
}

/**
 * True once the element has come within `rootMargin` of the viewport, and
 * stays true. Used to hold a heavy lazy chunk back until the reader is
 * actually heading towards it — the analytics section is expanded by default
 * but sits well below the fold, so mounting it eagerly downloaded recharts
 * on every dashboard load.
 */
function useApproachingViewport<T extends HTMLElement>(rootMargin = "300px") {
  const ref = useRef<T | null>(null);
  const [reached, setReached] = useState(false);

  useEffect(() => {
    if (reached) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setReached(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setReached(true);
          io.disconnect();
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reached, rootMargin]);

  return [ref, reached] as const;
}

const categoryIcons: Record<string, React.ReactNode> = {
  "Water Supply": <Droplets className="w-4 h-4" />,
  "जल आपूर्ति": <Droplets className="w-4 h-4" />,
  Sanitation: <Trash2 className="w-4 h-4" />,
  स्वच्छता: <Trash2 className="w-4 h-4" />,
  Electricity: <Zap className="w-4 h-4" />,
  बिजली: <Zap className="w-4 h-4" />,
  Roads: <Construction className="w-4 h-4" />,
  सड़कें: <Construction className="w-4 h-4" />,
  "Parks & Gardens": <TreePine className="w-4 h-4" />,
  "पार्क और बगीचे": <TreePine className="w-4 h-4" />,
  Buildings: <Building2 className="w-4 h-4" />,
  भवन: <Building2 className="w-4 h-4" />,
  "Metro & Transit": <Train className="w-4 h-4" />,
  "मेट्रो और ट्रांजिट": <Train className="w-4 h-4" />,
};

const statusConfig: Record<string, { class: string; icon: React.ReactNode }> = {
  [IssueStatus.REPORTED]: {
    class: "status-reported",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  [IssueStatus.IN_PROGRESS]: {
    class: "status-in-progress",
    icon: <Timer className="w-3 h-3" />,
  },
  [IssueStatus.RESOLVED]: {
    class: "status-resolved",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
};

function DeptStatusBreakdownCard({ issues, language }: { issues: Issue[]; language: "en" | "hi" }) {
  const counts = {
    reported: issues.filter((i) => i.status === "reported").length,
    acknowledged: issues.filter((i) => i.status === "acknowledged").length,
    in_progress: issues.filter((i) => i.status === "in_progress").length,
    resolved: issues.filter((i) => i.status === "resolved").length,
    closed: issues.filter((i) => i.status === "closed").length,
  };
  const total = issues.length || 1;

  const STATUS_CONFIG: Record<string, { labelEn: string; labelHi: string; color: string }> = {
    reported: { labelEn: "Reported", labelHi: "रिपोर्ट की गई", color: "bg-yellow-500" },
    acknowledged: { labelEn: "Acknowledged", labelHi: "स्वीकृत", color: "bg-purple-500" },
    in_progress: { labelEn: "In Progress", labelHi: "प्रगति में", color: "bg-blue-500" },
    resolved: { labelEn: "Resolved", labelHi: "हल की गई", color: "bg-green-500" },
    closed: { labelEn: "Closed", labelHi: "बंद की गई", color: "bg-slate-500" },
  };

  return (
    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-bold text-foreground">
          {language === "en" ? "Lifecycle Status Distribution" : "जीवनचक्र स्थिति वितरण"}
        </h3>
      </div>

      <div className="space-y-3.5">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => {
          const count = counts[status as keyof typeof counts] || 0;
          const pct = Math.round((count / total) * 100);
          return (
            <div key={status} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  {language === "en" ? config.labelEn : config.labelHi}
                </span>
                <span className="font-semibold text-foreground">
                  {count} <span className="text-[10px] text-muted-foreground">({pct}%)</span>
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${config.color} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeptAreaBreakdownCard({ issues, language }: { issues: Issue[]; language: "en" | "hi" }) {
  const areaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    issues.forEach((issue) => {
      if (!issue.location) return;
      const parts = issue.location.split(",");
      const area = parts[0]?.trim();
      if (area && area !== "Bhopal" && area !== "Indore" && area.length > 2) {
        counts[area] = (counts[area] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [issues]);

  return (
    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <MapPin className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-bold text-foreground">
          {language === "en" ? "Top Affected Wards / Localities" : "शीर्ष प्रभावित क्षेत्र / वार्ड"}
        </h3>
      </div>

      {areaCounts.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">
          {language === "en" ? "No location data available." : "कोई स्थान डेटा उपलब्ध नहीं।"}
        </p>
      ) : (
        <div className="divide-y divide-border/40">
          {areaCounts.map((entry, idx) => (
            <div
              key={entry.area}
              className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 text-xs"
            >
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
                  {idx + 1}
                </span>
                <span className="font-semibold text-foreground">{entry.area}</span>
              </div>
              <span className="bg-primary/5 text-primary border border-primary/10 px-2 py-0.5 rounded-full font-bold text-[11px]">
                {entry.count} {language === "en" ? "reports" : "रिपोर्ट"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { getTimeAgo as getTimeAgoUtil } from "@/shared/utils/time";
import { getErrorMessage } from "@/shared/lib/errorMessage";

export default function DashboardPage() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedIssueId = searchParams.get("issueId");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [selectedIssueProfile, setSelectedIssueProfile] = useState<{ fullName: string } | null>(null);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [analyticsRef, analyticsNear] = useApproachingViewport<HTMLDivElement>();
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [verificationVersion, setVerificationVersion] = useState(0);
  const [visibleCount, setVisibleCount] = useState(12);

  // Location Gate Modal state for first-time registration / missing city & state
  const [showLocationGateModal, setShowLocationGateModal] = useState(false);
  const [gateCity, setGateCity] = useState("");
  const [gateState, setGateState] = useState("");
  const [isSavingGate, setIsSavingGate] = useState(false);

  // Filter States
  const [userCity, setUserCity] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedCity, setSelectedCity] = useState<string>("ALL");
  const [isDeptAdmin, setIsDeptAdmin] = useState(false);

  useEffect(() => {
    if (user?.id) {
      adminService
        .getUserRole(user.id)
        .then((roleInfo) => {
          setIsDeptAdmin(roleInfo.role === UserRole.DEPARTMENT_ADMIN);
        })
        .catch((err) => logger.info("Could not fetch user role in dashboard:", err));
    }
  }, [user]);

  // Fetch logged-in user's profile to extract their filled city and set default filter
  useEffect(() => {
    if (user?.id) {
      profileService
        .getProfile(user.id, user)
        .then((prof) => {
          if (prof?.city && prof.city.trim() !== "") {
            const cityVal = prof.city.trim();
            setUserCity(cityVal);
            setSelectedCity(cityVal);
          }
          // Mandatory Gate: Check if user city or state is missing
          if (!prof?.city || prof.city.trim() === "" || !prof?.state || prof.state.trim() === "") {
            setShowLocationGateModal(true);
            setGateCity(prof?.city || "");
            setGateState(prof?.state || "");
          }
        })
        .catch((err) => {
          logger.info("Could not fetch user profile city:", err);
        });
    }
  }, [user]);

  const handleSaveLocationGate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gateCity.trim() || !gateState.trim()) {
      toast({
        title: language === "en" ? "Location Required" : "स्थान आवश्यक",
        description:
          language === "en"
            ? "Please enter both City and State to access dashboard."
            : "डैशबोर्ड पर जाने के लिए कृपया शहर और राज्य दोनों दर्ज करें।",
        variant: "destructive",
      });
      return;
    }

    if (!user?.id) return;

    try {
      setIsSavingGate(true);
      await profileService.updateProfile(user.id, {
        city: gateCity.trim(),
        state: gateState.trim(),
      });
      setUserCity(gateCity.trim());
      setSelectedCity(gateCity.trim());
      setShowLocationGateModal(false);
      toast({
        title: language === "en" ? "Location Saved!" : "स्थान सहेजा गया!",
        description:
          language === "en" ? "Welcome to your Samadhan Dashboard." : "समाधान डैशबोर्ड में आपका स्वागत है।",
      });
    } catch (err) {
      toast({
        title: language === "en" ? "Error" : "त्रुटि",
        description: getErrorMessage(err, "Failed to update profile location."),
        variant: "destructive",
      });
    } finally {
      setIsSavingGate(false);
    }
  };

  useEffect(() => {
    const handleSync = () => {
      setVerificationVersion((v) => v + 1);
    };
    window.addEventListener("issue_verifications_changed", handleSync);
    return () => window.removeEventListener("issue_verifications_changed", handleSync);
  }, []);

  const handleVote = async (issueId: string, vote: "confirm" | "disagree", _title?: string) => {
    await issueVerificationService.voteOnIssue(issueId, vote);
    toast({
      title: language === "en" ? "Vote Registered" : "मत दर्ज किया गया",
      description:
        language === "en"
          ? "Thank you for contributing to community verification!"
          : "सामुदायिक सत्यापन में योगदान देने के लिए धन्यवाद!",
    });
  };

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          logger.info("Geolocation declined or unavailable:", err);
        },
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, []);

  const {
    issues,
    allIssues: _allIssues,
    supportedIssues,
    loading,
    supportingId,
    handleSupport,
    isNearbyMode: _isNearbyMode,
    refetch,
  } = useDashboardIssues(user, language, userCoords);

  // Dynamically extract unique cities from loaded issues + user's profile city
  const availableCities = useMemo(() => {
    const citySet = new Set<string>();
    if (userCity) {
      citySet.add(userCity);
    }
    // Pre-populate prominent cities
    ["Bhopal", "Indore", "Delhi", "Mumbai", "Bangalore", "Jaipur"].forEach((c) => citySet.add(c));

    issues.forEach((issue) => {
      if (!issue.location) return;
      const parts = issue.location.split(",").map((p) => p.trim());
      for (const part of parts) {
        if (
          !/\d/.test(part) &&
          part.length > 2 &&
          part !== "India" &&
          !part.includes("Pradesh") &&
          !part.includes("Tahsil")
        ) {
          if (
            [
              "Bhopal",
              "Indore",
              "Huzur",
              "Gwalior",
              "Jabalpur",
              "Ujjain",
              "Delhi",
              "Mumbai",
              "Bangalore",
              "Pune",
              "Jaipur",
              "Lucknow",
            ].includes(part)
          ) {
            citySet.add(part);
          }
        }
      }
    });
    return Array.from(citySet).sort();
  }, [issues, userCity]);

  // Filter issues based on Category, Status, and City
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      // 1. Category Filter
      if (selectedCategory !== "ALL" && issue.category !== selectedCategory) {
        return false;
      }
      // 2. Status Filter
      if (selectedStatus !== "ALL" && issue.status !== selectedStatus) {
        return false;
      }
      // 3. City Filter
      if (selectedCity !== "ALL") {
        if (!issue.location || !issue.location.toLowerCase().includes(selectedCity.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [issues, selectedCategory, selectedStatus, selectedCity]);

  const handleResetFilters = () => {
    setSelectedCategory("ALL");
    setSelectedStatus("ALL");
    setSelectedCity(userCity || "ALL");
    setVisibleCount(12);
  };

  // Dashboard counters are server-computed over the whole dataset.
  const { overview, refetch: refetchAnalytics } = useAnalytics();

  const getTimeAgo = (date: Date) => getTimeAgoUtil(date, language);

  const fetchReporterProfile = useCallback(
    async (reporterUserId: string) => {
      if (!user) {
        setSelectedIssueProfile({ fullName: language === "en" ? "Citizen" : "नागरिक" });
        return;
      }

      if (reporterUserId === user.id) {
        try {
          const prof = await profileService.getProfile(user.id);
          setSelectedIssueProfile({ fullName: prof.fullName || (language === "en" ? "You" : "आप") });
        } catch {
          setSelectedIssueProfile({ fullName: language === "en" ? "You" : "आप" });
        }
        return;
      }

      try {
        const prof = await profileService.getProfile(reporterUserId);
        setSelectedIssueProfile({ fullName: prof.fullName || (language === "en" ? "Citizen" : "नागरिक") });
      } catch {
        setSelectedIssueProfile({ fullName: language === "en" ? "Citizen" : "नागरिक" });
      }
    },
    [language, user]
  );

  // Declared after fetchReporterProfile so its identity exists first.
  useEffect(() => {
    if (!selectedIssueId) {
      setSelectedIssue(null);
      setSelectedIssueProfile(null);
      return;
    }

    const found = issues.find((i) => i.id === selectedIssueId);
    if (found) {
      setSelectedIssue(found);
      fetchReporterProfile(found.userId);
    } else {
      setLoadingSelected(true);
      issueService
        .getIssueById(selectedIssueId)
        .then((issue) => {
          setSelectedIssue(issue);
          fetchReporterProfile(issue.userId);
        })
        .catch((err) => {
          logger.error("Failed to fetch issue details:", err);
          toast({
            title: language === "en" ? "Error" : "त्रुटि",
            description: language === "en" ? "Issue not found" : "समस्या नहीं मिली",
            variant: "destructive",
          });
          searchParams.delete("issueId");
          setSearchParams(searchParams);
        })
        .finally(() => {
          setLoadingSelected(false);
        });
    }
  }, [selectedIssueId, issues, fetchReporterProfile, language, searchParams, setSearchParams, toast]);

  const handleViewDetails = (issueId: string) => {
    navigate(ROUTES.ISSUE_DETAIL.replace(":id", issueId));
  };

  const handleViewOnMap = (issueId: string) => {
    navigate(`${ROUTES.CIVIC_MAP}?issueId=${issueId}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " && e.target === e.currentTarget) {
      e.preventDefault();
      const sectionIds = [
        "hero-section",
        "stats-section",
        "analytics-section",
        "performance-section",
        "live-feed-section",
      ];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top > 80) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            el.focus({ preventScroll: true });
            break;
          }
        }
      }
    }
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="container mx-auto px-4 py-6 max-w-7xl space-y-8 focus:outline-none scroll-smooth"
    >
      {/* SECTION 1: HERO HEADER */}
      <section
        id="hero-section"
        tabIndex={0}
        className="scroll-mt-24 focus:outline-none focus:ring-1 focus:ring-primary/20 rounded-2xl p-2"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-xs font-semibold mb-3 border border-blue-500/20">
              <MapPin className="w-3.5 h-3.5" />
              {language === "en" ? "Near Your Location" : "आपके स्थान के पास"}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight mb-2">
              {language === "en" ? "Issues Near You" : "आपके पास की समस्याएं"}
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">{t("issues.subtitle")}</p>
          </div>
          <Link to={ROUTES.REPORT_ISSUE}>
            <Button className="shrink-0 gap-2 bg-[#b45309] hover:bg-[#92400e] text-white rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm border-0">
              <Plus className="w-4 h-4" />
              {language === "en" ? "Report Issue" : "समस्या दर्ज करें"}
            </Button>
          </Link>
        </div>
      </section>

      {/* SECTION 2: STATS CARDS BAR (4 Cards Row) */}
      <section
        id="stats-section"
        tabIndex={0}
        className="scroll-mt-24 focus:outline-none focus:ring-1 focus:ring-primary/20 rounded-2xl p-1"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            value={overview ? overview.totals.issues.toString() : "121"}
            label={language === "en" ? "Total Reports" : "कुल रिपोर्ट"}
            trend={language === "en" ? "Across all departments" : "सभी विभागों में"}
            color="primary"
          />
          <StatCard
            value={overview ? overview.totals.open.toString() : "42"}
            label={language === "en" ? "Open Issues" : "खुली समस्याएं"}
            trend={language === "en" ? "Awaiting resolution" : "समाधान प्रतीक्षित"}
            color="accent"
          />
          <StatCard
            value={overview ? formatResolutionTime(overview.resolutionTime.avgHours, language) : "4 days"}
            label={language === "en" ? "Avg Resolution" : "औसत समाधान"}
            trend={
              overview?.resolutionTime.p90Hours != null
                ? `P90: ${formatResolutionTime(overview.resolutionTime.p90Hours, language)}`
                : language === "en"
                  ? "P90 10 days"
                  : "P90: 10 दिन"
            }
            color="info"
            topIcon={<BarChart3 className="w-4 h-4 text-muted-foreground/40" />}
          />
          <StatCard
            value={overview ? overview.totals.reportedThisWeek.toString() : "19"}
            label={language === "en" ? "Issues This Week" : "इस सप्ताह के मुद्दे"}
            trend={language === "en" ? "New reports (7d)" : "नई रिपोर्ट (7 दिन)"}
            color="dark"
          />
        </div>
      </section>

      {/* SECTION 3: CIVIC ANALYTICS PANEL */}
      <section
        id="analytics-section"
        tabIndex={0}
        className="scroll-mt-24 focus:outline-none focus:ring-1 focus:ring-primary/20 rounded-2xl p-1"
      >
        <div className="bg-card border border-border/80 rounded-2xl shadow-card overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-5 bg-card hover:bg-muted/20 transition-colors cursor-pointer group"
            onClick={() => setShowAnalytics((v) => !v)}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                {language === "en" ? "Civic Analytics" : "नागरिक विश्लेषण"}
              </h2>
            </div>
            {showAnalytics ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            )}
          </button>
          {showAnalytics && (
            <div ref={analyticsRef} className="px-5 pb-5 border-t border-border/40">
              {analyticsNear ? (
                <Suspense fallback={<PanelFallback className="h-72" />}>
                  <AnalyticsPanel />
                </Suspense>
              ) : (
                <PanelFallback className="h-72" />
              )}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 4: DEPARTMENT PERFORMANCE & ISSUE HOTSPOTS (2 Column Grid) */}
      <section
        id="performance-section"
        tabIndex={0}
        className="scroll-mt-24 focus:outline-none focus:ring-1 focus:ring-primary/20 rounded-2xl p-1"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {isDeptAdmin ? (
            <>
              <DeptStatusBreakdownCard issues={issues} language={language} />
              <DeptAreaBreakdownCard issues={issues} language={language} />
            </>
          ) : (
            <>
              <DepartmentPerformanceCard />
              <IssueHotspotsCard />
            </>
          )}
        </div>
      </section>

      {/* SECTION 5: LIVE ISSUES FEED (3-4 Cards per Row Layout) */}
      <section
        id="live-feed-section"
        tabIndex={0}
        className="scroll-mt-24 focus:outline-none focus:ring-1 focus:ring-primary/20 rounded-2xl p-1"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-card border border-border/80 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <h2 className="text-base font-bold uppercase tracking-wider text-foreground">
              {language === "en" ? "LIVE ISSUES FEED" : "लाइव समस्या फ़ीड"}
            </h2>
            <Badge
              variant="outline"
              className="ml-2 text-xs font-semibold text-muted-foreground border-border/60"
            >
              {filteredIssues.length} {language === "en" ? "reports" : "रिपोर्ट"}
            </Badge>
          </div>

          {/* Interactive Filters: City, Category, Status */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* City Filter */}
            {!isDeptAdmin && (
              <div className="flex items-center gap-1.5 bg-muted/30 border border-border/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-foreground">
                <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                <select
                  value={selectedCity}
                  onChange={(e) => {
                    setSelectedCity(e.target.value);
                    setVisibleCount(12);
                  }}
                  className="bg-transparent text-foreground font-semibold focus:outline-none cursor-pointer pr-1"
                >
                  <option value="ALL" className="bg-card text-foreground">
                    {language === "en" ? "All Cities" : "सभी शहर"}
                  </option>
                  {availableCities.map((city) => (
                    <option key={city} value={city} className="bg-card text-foreground">
                      📍 {city}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Category Filter */}
            {!isDeptAdmin && (
              <div className="flex items-center gap-1.5 bg-muted/30 border border-border/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-foreground">
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setVisibleCount(12);
                  }}
                  className="bg-transparent text-foreground font-semibold focus:outline-none cursor-pointer pr-1"
                >
                  <option value="ALL" className="bg-card text-foreground">
                    {language === "en" ? "All Categories" : "सभी श्रेणियां"}
                  </option>
                  <option value="Water Supply" className="bg-card text-foreground">
                    {language === "en" ? "Water Supply" : "जल आपूर्ति"}
                  </option>
                  <option value="Sanitation" className="bg-card text-foreground">
                    {language === "en" ? "Sanitation" : "स्वच्छता"}
                  </option>
                  <option value="Electricity" className="bg-card text-foreground">
                    {language === "en" ? "Electricity" : "बिजली"}
                  </option>
                  <option value="Roads" className="bg-card text-foreground">
                    {language === "en" ? "Roads" : "सड़कें"}
                  </option>
                  <option value="Parks & Gardens" className="bg-card text-foreground">
                    {language === "en" ? "Parks & Gardens" : "पार्क और बगीचे"}
                  </option>
                  <option value="Buildings" className="bg-card text-foreground">
                    {language === "en" ? "Buildings" : "भवन"}
                  </option>
                </select>
              </div>
            )}

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-muted/30 border border-border/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-foreground">
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setVisibleCount(12);
                }}
                className="bg-transparent text-foreground font-semibold focus:outline-none cursor-pointer pr-1"
              >
                <option value="ALL" className="bg-card text-foreground">
                  {language === "en" ? "All Statuses" : "सभी स्थितियां"}
                </option>
                <option value={IssueStatus.REPORTED} className="bg-card text-foreground">
                  {language === "en" ? "Reported" : "दर्ज"}
                </option>
                <option value={IssueStatus.IN_PROGRESS} className="bg-card text-foreground">
                  {language === "en" ? "In Progress" : "प्रगति में"}
                </option>
                <option value={IssueStatus.RESOLVED} className="bg-card text-foreground">
                  {language === "en" ? "Resolved" : "हल"}
                </option>
              </select>
            </div>

            {/* Clear Filters Reset Button if any filter active */}
            {(selectedCategory !== "ALL" || selectedStatus !== "ALL" || selectedCity !== "ALL") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-8 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 px-2.5 rounded-xl gap-1"
              >
                <X className="w-3.5 h-3.5" />
                {language === "en" ? "Clear" : "रीसेट"}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <LoadingState message={language === "en" ? "Loading issues..." : "समस्याएं लोड हो रही हैं..."} />
        ) : filteredIssues.length === 0 ? (
          <EmptyState
            title={language === "en" ? "No Matching Issues Found" : "कोई मेल खाती समस्या नहीं मिली"}
            description={
              language === "en"
                ? "No reports match your current filters. Try resetting the filters or selecting a different city/category."
                : "आपकी चुनी हुई फ़िल्टर शर्तों से कोई रिपोर्ट नहीं मिलती। फ़िल्टर रीसेट करें या दूसरा शहर चुनें।"
            }
            actionText={language === "en" ? "Reset All Filters" : "सभी फ़िल्टर रीसेट करें"}
            onAction={handleResetFilters}
          />
        ) : (
          <>
            {/* 3 to 4 Column Grid for Desktop Viewports */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredIssues.slice(0, visibleCount).map((issue, index) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  index={index}
                  isSupported={supportedIssues.has(issue.id)}
                  isSupporting={supportingId === issue.id}
                  onSupport={() => handleSupport(issue.id)}
                  onViewDetails={() => handleViewDetails(issue.id)}
                  onViewOnMap={
                    issue.latitude && issue.longitude ? () => handleViewOnMap(issue.id) : undefined
                  }
                  getTimeAgo={getTimeAgo}
                  activeLanguage={language}
                />
              ))}
            </div>

            {filteredIssues.length > visibleCount && (
              <div className="flex justify-center mt-8">
                <Button
                  onClick={() => setVisibleCount((prev) => prev + 12)}
                  className="rounded-full px-8 py-2.5 bg-card hover:bg-primary hover:text-primary-foreground text-foreground border border-border/80 font-bold shadow-md transition-all text-sm cursor-pointer"
                >
                  {language === "en" ? "Load More Issues" : "और समस्याएं लोड करें"}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Complaint Detail Dialog */}
      <Dialog
        open={!!selectedIssueId}
        onOpenChange={(open) => {
          if (!open) {
            searchParams.delete("issueId");
            setSearchParams(searchParams);
          }
        }}
      >
        {/* Mandatory Location Information Gate Modal for First-Time Registration or Missing City/State */}
        <Dialog open={showLocationGateModal} onOpenChange={() => {}}>
          <DialogContent
            className="sm:max-w-md bg-card border border-border shadow-2xl rounded-2xl p-6 [&>button]:hidden z-50"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader className="text-left">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                <MapPin className="w-6 h-6" />
              </div>
              <DialogTitle className="text-xl font-bold text-foreground">
                {language === "en" ? "Location Information Required" : "स्थान विवरण आवश्यक"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                {language === "en"
                  ? "Please enter your City and State to access your personalized civic dashboard and view local community reports."
                  : "अपने व्यक्तिगत नागरिक डैशबोर्ड और स्थानीय सामुदायिक रिपोर्ट तक पहुंचने के लिए कृपया अपना शहर और राज्य दर्ज करें।"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveLocationGate} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="gateCity" className="text-sm font-semibold">
                  {language === "en" ? "City *" : "शहर *"}
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="gateCity"
                    type="text"
                    placeholder={language === "en" ? "e.g. Bhopal" : "जैसे भोपाल"}
                    value={gateCity}
                    onChange={(e) => setGateCity(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gateState" className="text-sm font-semibold">
                  {language === "en" ? "State *" : "राज्य *"}
                </Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="gateState"
                    type="text"
                    placeholder={language === "en" ? "e.g. Madhya Pradesh" : "जैसे मध्य प्रदेश"}
                    value={gateState}
                    onChange={(e) => setGateState(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button type="submit" className="w-full font-bold shadow-md h-11" disabled={isSavingGate}>
                  {isSavingGate ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      {language === "en" ? "Saving Location..." : "स्थान सहेजा जा रहा है..."}
                    </>
                  ) : language === "en" ? (
                    "Save & Enter Dashboard"
                  ) : (
                    "सहेजें और डैशबोर्ड पर जाएं"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <DialogContent className="max-w-xl overflow-y-auto max-h-[90vh] p-0 border-none bg-card/95 backdrop-blur-md shadow-2xl rounded-2xl">
          {loadingSelected || !selectedIssue ? (
            <div className="p-12 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {language === "en" ? "Loading details..." : "विवरण लोड हो रहा है..."}
              </p>
            </div>
          ) : (
            (() => {
              const { confirmations, disagreements, confidence, isVerified, userVote } =
                issueVerificationService.getComputedState(selectedIssue.id);
              const insight = aiInsightService.getSyncInsight(selectedIssue);
              const hasDepartment = !!insight?.department;

              const timelineSteps = [
                { key: "reported", labelEn: "Reported", labelHi: "दर्ज की गई", complete: true },
                {
                  key: "ai_categorized",
                  labelEn: "AI Categorized",
                  labelHi: "एआई वर्गीकृत",
                  complete: !!selectedIssue.category,
                },
                { key: "community_verified", labelEn: "Verified", labelHi: "सत्यापित", complete: isVerified },
                {
                  key: "department_assigned",
                  labelEn: "Dept Assigned",
                  labelHi: "विभाग",
                  complete:
                    hasDepartment ||
                    selectedIssue.status === IssueStatus.IN_PROGRESS ||
                    selectedIssue.status === IssueStatus.RESOLVED,
                },
                {
                  key: "in_progress",
                  labelEn: "In Progress",
                  labelHi: "प्रगति में",
                  complete:
                    selectedIssue.status === IssueStatus.IN_PROGRESS ||
                    selectedIssue.status === IssueStatus.RESOLVED,
                },
                {
                  key: "resolved",
                  labelEn: "Resolved",
                  labelHi: "सुलझाया गया",
                  complete: selectedIssue.status === IssueStatus.RESOLVED,
                },
              ];

              return (
                <div key={verificationVersion} className="flex flex-col">
                  {/* Header Image or Colored Banner */}
                  {selectedIssue.imageUrls && selectedIssue.imageUrls.length > 0 ? (
                    <div className="relative w-full h-56 bg-muted overflow-hidden">
                      <img
                        {...imageProps(selectedIssue.imageUrls[0], "detail", { eager: true })}
                        alt={selectedIssue.title}
                        className="w-full h-full object-cover animate-fade-in"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                    </div>
                  ) : (
                    <div className="w-full h-24 bg-gradient-to-r from-primary/10 to-accent/10 relative" />
                  )}

                  {/* Main Content Area */}
                  <div className="p-6">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <Badge variant="secondary" className="text-xs">
                        {selectedIssue.category}
                      </Badge>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          statusConfig[selectedIssue.status]?.class ||
                          statusConfig[IssueStatus.REPORTED].class
                        }`}
                      >
                        {statusConfig[selectedIssue.status]?.icon || statusConfig[IssueStatus.REPORTED].icon}
                        {STATUS_LABELS[selectedIssue.status]?.[language] || selectedIssue.status}
                      </span>
                      {isVerified && (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] font-bold py-0.5 px-2">
                          ✓ {language === "en" ? "Community Verified" : "सामुदायिक सत्यापित"}
                        </Badge>
                      )}
                    </div>

                    <DialogTitle className="text-2xl font-bold text-foreground mb-4">
                      {selectedIssue.title}
                    </DialogTitle>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-xl mb-6 border border-border/50">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                            {language === "en" ? "Issued By" : "द्वारा जारी"}
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {selectedIssueProfile?.fullName || (language === "en" ? "Citizen" : "नागरिक")}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                            {language === "en" ? "Reported On" : "रिपोर्ट की तिथि"}
                          </p>
                          <p className="text-sm font-semibold text-foreground">
                            {new Date(selectedIssue.createdAt).toLocaleDateString(
                              language === "en" ? "en-US" : "hi-IN",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              }
                            )}
                          </p>
                        </div>
                      </div>

                      {selectedIssue.location && (
                        <div className="flex items-center gap-2.5 sm:col-span-2">
                          <div className="w-9 h-9 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0">
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                              {language === "en" ? "Location" : "स्थान"}
                            </p>
                            <p className="text-sm font-semibold text-foreground truncate">
                              {selectedIssue.location}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Visual Lifecycle Timeline */}
                    <div className="mb-6">
                      <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-primary" />
                        {language === "en" ? "Issue Lifecycle Timeline" : "समस्या जीवनचक्र समयरेखा"}
                      </h4>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-3 bg-muted/20 border border-border/40 rounded-xl">
                        {timelineSteps.map((step, idx) => (
                          <div key={step.key} className="flex flex-col items-center text-center relative">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold z-10 ${
                                step.complete
                                  ? "bg-green-500 text-white"
                                  : "bg-muted text-muted-foreground border border-border"
                              }`}
                            >
                              {step.complete ? "✓" : idx + 1}
                            </div>
                            <span className="text-[10px] font-semibold mt-1.5 text-foreground leading-tight line-clamp-2 px-0.5">
                              {language === "en" ? step.labelEn : step.labelHi}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Description */}
                    <div className="mb-4">
                      <h4 className="text-sm font-bold text-foreground mb-2">
                        {language === "en" ? "Description" : "विवरण"}
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed bg-muted/20 p-4 rounded-xl border border-border/30 whitespace-pre-wrap font-sans">
                        {selectedIssue.description ||
                          (language === "en"
                            ? "No description provided."
                            : "कोई विवरण प्रदान नहीं किया गया।")}
                      </p>
                    </div>

                    {/* Community Verification Action Panel */}
                    <div className="mb-6 p-4 rounded-xl border border-border/50 bg-muted/10">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-4 h-4 text-primary" />
                          <h4 className="text-sm font-bold text-foreground">
                            {language === "en" ? "Community Verification" : "सामुदायिक सत्यापन"}
                          </h4>
                        </div>
                        {isVerified && (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] font-bold">
                            ✓ {language === "en" ? "Community Verified" : "सामुदायिक सत्यापित"}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-center mb-4">
                        <div className="p-2 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">
                            {language === "en" ? "Confirmations" : "पुष्टि"}
                          </p>
                          <p className="text-lg font-bold text-green-500">{confirmations}</p>
                        </div>
                        <div className="p-2 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">
                            {language === "en" ? "Disagreements" : "असहमतियां"}
                          </p>
                          <p className="text-lg font-bold text-red-500">{disagreements}</p>
                        </div>
                        <div className="p-2 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">
                            {language === "en" ? "Confidence" : "विश्वास"}
                          </p>
                          <p className="text-lg font-bold text-primary">{confidence}%</p>
                        </div>
                      </div>

                      {/* Vote Action Buttons */}
                      <div className="flex gap-2">
                        <Button
                          variant={userVote === "confirm" ? "default" : "outline"}
                          size="sm"
                          className="flex-1 gap-1.5 text-xs h-9 font-bold"
                          onClick={() => handleVote(selectedIssue.id, "confirm", selectedIssue.title)}
                          disabled={!!userVote}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {language === "en" ? "Confirm Issue" : "समस्या की पुष्टि करें"}
                        </Button>
                        <Button
                          variant={userVote === "disagree" ? "destructive" : "outline"}
                          size="sm"
                          className="flex-1 gap-1.5 text-xs h-9 font-bold"
                          onClick={() => handleVote(selectedIssue.id, "disagree", selectedIssue.title)}
                          disabled={!!userVote}
                        >
                          <X className="w-3.5 h-3.5" />
                          {language === "en" ? "Not an Issue" : "समस्या नहीं है"}
                        </Button>
                      </div>

                      {userVote && (
                        <p className="text-[10px] text-muted-foreground text-center mt-2.5 italic">
                          {language === "en"
                            ? `You have already verified this issue as: ${userVote === "confirm" ? "Confirm Issue" : "Not an Issue"}.`
                            : `आपने पहले ही इस समस्या को सत्यापित किया है: ${userVote === "confirm" ? "पुष्टि करें" : "समस्या नहीं है"}.`}
                        </p>
                      )}
                    </div>

                    {/* Resolution outcome — only the reporter decides whether it holds */}
                    {user?.id === selectedIssue.userId && selectedIssue.status === IssueStatus.RESOLVED && (
                      <Suspense fallback={<PanelFallback className="h-24" />}>
                        <ResolutionReviewPanel
                          issueId={selectedIssue.id}
                          onReviewed={() => {
                            searchParams.delete("issueId");
                            setSearchParams(searchParams);
                            refetch();
                            refetchAnalytics();
                          }}
                        />
                      </Suspense>
                    )}

                    {/* Multi-department coordination: work orders, blockers, referrals */}
                    <Suspense fallback={<PanelFallback className="h-24" />}>
                      <CoordinationPanel issueId={selectedIssue.id} />
                    </Suspense>

                    {/* AI Intelligence Panel — only for authenticated users */}
                    {user && (
                      <Suspense fallback={<PanelFallback className="h-24" />}>
                        <AIInsightPanel issue={selectedIssue} />
                      </Suspense>
                    )}

                    {/* Footer / Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-border mt-5">
                      <div className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{selectedIssue.supportsCount}</span>{" "}
                        {language === "en" ? "supports" : "समर्थन"}
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedIssue.latitude && selectedIssue.longitude && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => handleViewOnMap(selectedIssue.id)}
                          >
                            <Map className="w-3.5 h-3.5" />
                            {language === "en" ? "View on Map" : "मानचित्र"}
                          </Button>
                        )}
                        <Button
                          variant={supportedIssues.has(selectedIssue.id) ? "default" : "outline"}
                          size="sm"
                          className="gap-2"
                          onClick={() => handleSupport(selectedIssue.id)}
                          disabled={supportingId === selectedIssue.id}
                        >
                          {supportingId === selectedIssue.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ThumbsUp
                              className={`w-4 h-4 ${supportedIssues.has(selectedIssue.id) ? "fill-current" : ""}`}
                            />
                          )}
                          {supportedIssues.has(selectedIssue.id)
                            ? language === "en"
                              ? "Supported"
                              : "समर्थित"
                            : language === "en"
                              ? "Support"
                              : "समर्थन"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            searchParams.delete("issueId");
                            setSearchParams(searchParams);
                          }}
                        >
                          {language === "en" ? "Close" : "बंद करें"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  value,
  label,
  trend,
  color,
  mapHref,
  topIcon,
}: {
  value: string;
  label: string;
  trend: string;
  color: "primary" | "accent" | "warning" | "info" | "dark";
  mapHref?: string;
  topIcon?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const colorClasses = {
    primary: "text-foreground",
    accent: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    info: "text-blue-600 dark:text-blue-400",
    dark: "text-slate-800 dark:text-slate-200",
  };

  return (
    <div
      className={`bg-card rounded-2xl p-5 border border-border/80 shadow-card relative flex flex-col justify-between group ${
        mapHref ? "cursor-pointer hover:border-primary/40 hover:-translate-y-0.5 transition-all" : ""
      }`}
      onClick={mapHref ? () => navigate(mapHref) : undefined}
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className={`text-4xl font-extrabold ${colorClasses[color]}`}>{value}</p>
          {topIcon && <div className="shrink-0">{topIcon}</div>}
        </div>
        <p className="text-base font-bold text-foreground mb-1">{label}</p>
      </div>
      <p className="text-sm font-medium text-muted-foreground mt-2">{trend}</p>
    </div>
  );
}

function IssueCard({
  issue,
  index,
  isSupported,
  isSupporting,
  onSupport,
  onViewDetails,
  onViewOnMap,
  getTimeAgo,
  activeLanguage,
}: {
  issue: Issue;
  index: number;
  isSupported: boolean;
  isSupporting: boolean;
  onSupport: () => void;
  onViewDetails: () => void;
  onViewOnMap?: () => void;
  getTimeAgo: (date: Date) => string;
  activeLanguage: "en" | "hi";
}) {
  const _config = statusConfig[issue.status] || statusConfig[IssueStatus.REPORTED];
  const categoryIcon = categoryIcons[issue.category] || <AlertTriangle className="w-4 h-4" />;
  const localizedStatusLabel = STATUS_LABELS[issue.status]?.[activeLanguage] || issue.status;

  const [_verificationState, setVerificationState] = useState(() =>
    issueVerificationService.getComputedState(issue.id)
  );

  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.issueId === issue.id) {
        setVerificationState(issueVerificationService.getComputedState(issue.id));
      }
    };
    window.addEventListener("issue_verifications_changed", handleSync);
    return () => window.removeEventListener("issue_verifications_changed", handleSync);
  }, [issue.id, issue.title]);

  return (
    <div
      className="group bg-card rounded-2xl border border-border/80 shadow-card hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden animate-slide-up flex flex-col cursor-pointer"
      style={{ animationDelay: `${index * 0.05}s` }}
      onClick={onViewDetails}
    >
      {/* Evidence photo */}
      {issue.imageUrls && issue.imageUrls.length > 0 ? (
        <div className="h-36 w-full bg-muted overflow-hidden relative shrink-0">
          <img
            {...imageProps(issue.imageUrls[0], "thumbnail")}
            alt={issue.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = "none";
            }}
          />
        </div>
      ) : null}

      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Header Badges */}
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <Badge
              variant="secondary"
              className="text-xs font-bold flex items-center gap-1 bg-muted/70 text-muted-foreground px-2.5 py-1"
            >
              {categoryIcon}
              <span>{issue.category}</span>
            </Badge>
            <Badge
              variant="outline"
              className="text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 px-2.5 py-1 flex items-center gap-1"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{localizedStatusLabel}</span>
            </Badge>
          </div>

          {/* Title */}
          <h3 className="font-bold text-base text-foreground mb-1.5 group-hover:text-primary transition-colors line-clamp-2 text-left leading-snug">
            {issue.title}
          </h3>

          {/* Location */}
          {issue.location && (
            <p className="text-sm text-muted-foreground mb-3 flex items-center gap-1 text-left">
              <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
              <span className="truncate">{issue.location}</span>
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border/40 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-medium">
              <Clock className="w-3.5 h-3.5" />
              {getTimeAgo(issue.createdAt)}
            </span>
            {onViewOnMap && (
              <button
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors ml-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewOnMap();
                }}
                title={activeLanguage === "en" ? "View on Map" : "मानचित्र पर देखें"}
              >
                <Map className="w-3.5 h-3.5" />
                <span>{activeLanguage === "en" ? "Map" : "मानचित्र"}</span>
              </button>
            )}
          </div>

          <Button
            variant={isSupported ? "default" : "outline"}
            size="sm"
            className={`gap-1.5 h-8 text-xs px-3 rounded-lg font-semibold ${isSupported ? "bg-primary text-primary-foreground" : "border-border/80 text-foreground"}`}
            onClick={(e) => {
              e.stopPropagation();
              onSupport();
            }}
            disabled={isSupporting}
          >
            {isSupporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ThumbsUp className={`w-3.5 h-3.5 ${isSupported ? "fill-current" : ""}`} />
            )}
            {activeLanguage === "en" ? "Support" : "समर्थन"} ({issue.supportsCount})
          </Button>
        </div>
      </div>
    </div>
  );
}
