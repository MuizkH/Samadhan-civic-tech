import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useAuth } from "@/features/auth";
import { adminService, QueueItem } from "@/features/admin/services/adminService";
import { issueService } from "@/features/issues/services/issueService";
import { Issue } from "@/shared/types/domain/Issue";
import { IssueStatus } from "@/shared/types/domain/IssueStatus";
import { UserRole } from "@/shared/types/domain/UserRole";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { ResolveIssueDialog } from "@/features/admin/components/ResolveIssueDialog";
import { CoordinationPanel } from "@/features/admin/components/CoordinationPanel";
import { AIInsightPanel } from "@/features/issues/components/AIInsightPanel";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/shared/services/logger";
import { ArrowLeft, Calendar, MapPin, User, Shield, Clock, Loader2, RotateCcw, Map } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { LoadingState } from "@/shared/components/LoadingState";
import { profileService } from "@/features/profile/services/profileService";
import { getErrorMessage } from "@/shared/lib/errorMessage";
import { categoryLabelOf } from "@/shared/types/domain/categoryRef";

// Standard default leaflet icons fix
// Leaflet resolves its default marker icons from bundler-relative paths that
// Vite rewrites. Deleting this private getter forces the explicit URLs set
// below to win. Narrowed to the single field rather than casting to any.
delete (L.Icon.Default.prototype as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const STATUS_COLORS: Record<string, string> = {
  reported: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  acknowledged: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  resolved: "bg-green-500/10 text-green-600 border-green-500/20",
  verified: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  reopened: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
  closed: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

const STATUS_LABEL: Record<string, { en: string; hi: string }> = {
  reported: { en: "Reported", hi: "रिपोर्ट" },
  acknowledged: { en: "Acknowledged", hi: "स्वीकृत" },
  in_progress: { en: "In Progress", hi: "प्रगति में" },
  resolved: { en: "Resolved", hi: "हल" },
  verified: { en: "Verified", hi: "सत्यापित" },
  reopened: { en: "Reopened", hi: "पुनः खोला" },
  rejected: { en: "Rejected", hi: "अस्वीकृत" },
  closed: { en: "Closed", hi: "बंद" },
};

const NEXT_ADMIN_STATUSES: Record<string, string[]> = {
  reported: ["acknowledged", "rejected"],
  acknowledged: ["in_progress", "rejected"],
  in_progress: ["resolved", "rejected"],
  resolved: ["closed"],
  verified: ["closed"],
  reopened: ["acknowledged", "in_progress", "rejected"],
  rejected: [],
  closed: [],
};

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [reporterProfile, setReporterProfile] = useState<{ fullName: string } | null>(null);
  const [userRoleData, setUserRoleData] = useState<{
    role: UserRole | null;
    department: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [resolvingItem, setResolvingItem] = useState<QueueItem | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);

  // 1. Fetch user role details to verify admin access
  useEffect(() => {
    if (user?.id) {
      adminService
        .getUserRole(user.id)
        .then(setUserRoleData)
        .catch((err) => logger.info("Could not fetch user details:", err));
    }
  }, [user]);

  // 2. Fetch issue details
  // Run-once guard for the map effect; a ref so storing the instance does not
  // re-trigger the effect and rebuild the map.
  const mapInitialisedRef = useRef(false);

  const loadIssue = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await issueService.getIssueById(id);
      setIssue(data);

      // Fetch reporter profile
      if (data.userId) {
        try {
          const prof = await profileService.getProfile(data.userId);
          setReporterProfile({ fullName: prof.fullName || (language === "en" ? "Citizen" : "नागरिक") });
        } catch {
          setReporterProfile({ fullName: language === "en" ? "Citizen" : "नागरिक" });
        }
      }
    } catch (err) {
      logger.error("Failed to load issue:", err);
      toast({
        title: language === "en" ? "Error" : "त्रुटि",
        description: language === "en" ? "Issue not found" : "समस्या नहीं मिली",
        variant: "destructive",
      });
      navigate(ROUTES.DASHBOARD);
    } finally {
      setLoading(false);
    }
  }, [id, language, navigate, toast]);

  useEffect(() => {
    void loadIssue();
  }, [loadIssue]);

  // 3. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInitialisedRef.current || !issue?.latitude || !issue?.longitude)
      return;
    mapInitialisedRef.current = true;

    const center: L.LatLngExpression = [issue.latitude, issue.longitude];
    const map = L.map(mapContainerRef.current, {
      center,
      zoom: 15,
      zoomControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    L.marker(center).addTo(map);

    // Force resize calculation because container might load hidden or layout shifts
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInitialisedRef.current = false;
    };
  }, [issue, loading]);

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <LoadingState
          message={language === "en" ? "Loading issue details..." : "समस्या विवरण लोड हो रहे हैं..."}
        />
      </div>
    );
  }

  if (!issue) {
    return null;
  }

  const isOfficer =
    userRoleData?.role === UserRole.DEPARTMENT_ADMIN || userRoleData?.role === UserRole.SUPER_ADMIN;
  const nextStatuses = isOfficer ? (NEXT_ADMIN_STATUSES[issue.status] ?? []) : [];

  const handleTransition = async (status: string) => {
    if (status === IssueStatus.RESOLVED) {
      // Construct a minimal QueueItem to feed into ResolveIssueDialog
      const queueItem: QueueItem = {
        workOrderId: "details-resolve",
        status: issue.status,
        role: "primary",
        priority: 1,
        assignee: null,
        createdAt: new Date(issue.createdAt).toISOString(),
        issue: {
          id: issue.id,
          publicRef: "REF-" + issue.id.slice(0, 8).toUpperCase(),
          title: issue.title,
          description: issue.description,
          category:
            typeof issue.category === "object"
              ? issue.category
              : { code: issue.category, nameEn: issue.category },
          status: issue.status,
          latitude: issue.latitude || 0,
          longitude: issue.longitude || 0,
          address: issue.location,
          city: null,
          priority: 1,
          reportedBy: issue.userId,
          reporterName: reporterProfile?.fullName || null,
          supportsCount: issue.supportsCount,
          resolutionNote: null,
          createdAt: new Date(issue.createdAt).toISOString(),
          acknowledgedAt: null,
          resolvedAt: null,
          verifiedAt: null,
          closedAt: null,
        },
      };
      setResolvingItem(queueItem);
      return;
    }

    setUpdating(true);
    try {
      await adminService.updateIssueStatus(issue.id, status as IssueStatus);
      toast({ title: language === "en" ? "Status updated" : "स्थिति अपडेट की गई" });
      await loadIssue();
    } catch (err) {
      logger.error("Failed to update status:", err);
      toast({
        title: language === "en" ? "Could not update status" : "स्थिति अपडेट नहीं हुई",
        description: getErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleResolveSubmit = async (note: string, proofUrl: string) => {
    setUpdating(true);
    try {
      await adminService.updateIssueStatus(issue.id, IssueStatus.RESOLVED, {
        resolutionNote: note,
        proofUrl,
      });
      toast({ title: language === "en" ? "Status updated to Resolved" : "स्थिति अपडेट की गई" });
      setResolvingItem(null);
      await loadIssue();
      return true;
    } catch (err) {
      logger.error("Failed to resolve issue:", err);
      toast({
        title: language === "en" ? "Could not update status" : "स्थिति अपडेट नहीं हुई",
        description: getErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const categoryName = categoryLabelOf(issue.category, language);

  const timelineSteps = [
    { key: "reported", labelEn: "Reported", labelHi: "दर्ज की गई", complete: true },
    {
      key: "acknowledged",
      labelEn: "Acknowledged",
      labelHi: "स्वीकृत",
      complete: (issue.status as string) !== "reported" && (issue.status as string) !== "rejected",
    },
    {
      key: "in_progress",
      labelEn: "In Progress",
      labelHi: "प्रगति में",
      complete:
        (issue.status as string) === "in_progress" ||
        (issue.status as string) === "resolved" ||
        (issue.status as string) === "closed",
    },
    {
      key: "resolved",
      labelEn: "Resolved",
      labelHi: "सुलझाया गया",
      complete: (issue.status as string) === "resolved" || (issue.status as string) === "closed",
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        className="mb-6 gap-2 hover:bg-muted font-bold text-sm rounded-xl cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        {language === "en" ? "Back" : "पीछे जाएं"}
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Columns - Issue details & Map */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Card */}
          <div className="bg-card border border-border/80 shadow-md rounded-2xl overflow-hidden p-6">
            {/* Header tags */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Badge variant="secondary" className="text-xs">
                {categoryName}
              </Badge>
              <Badge variant="outline" className={STATUS_COLORS[issue.status] ?? ""}>
                {STATUS_LABEL[issue.status]?.[language] ?? issue.status}
              </Badge>
            </div>

            {/* Issue Title */}
            <h1 className="text-3xl font-extrabold text-foreground mb-4">{issue.title}</h1>

            {/* Issue Photo */}
            {issue.imageUrls && issue.imageUrls.length > 0 && (
              <div className="relative w-full h-80 bg-muted rounded-xl overflow-hidden mb-6 border border-border/40">
                <img src={issue.imageUrls[0]} alt={issue.title} className="w-full h-full object-cover" />
              </div>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/20 border border-border/40 rounded-xl mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    {language === "en" ? "Issued By" : "द्वारा जारी"}
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    {reporterProfile?.fullName || (language === "en" ? "Citizen" : "नागरिक")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    {language === "en" ? "Reported On" : "रिपोर्ट की तिथि"}
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    {new Date(issue.createdAt).toLocaleDateString(language === "en" ? "en-US" : "hi-IN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 sm:col-span-2">
                <div className="w-10 h-10 rounded-xl bg-info/10 text-info flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    {language === "en" ? "Location" : "स्थान"}
                  </p>
                  <p className="text-sm font-bold text-foreground truncate">{issue.location}</p>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="mb-6">
              <h3 className="text-base font-bold text-foreground mb-2">
                {language === "en" ? "Description" : "विवरण"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed bg-muted/10 p-4 rounded-xl border border-border/30 whitespace-pre-wrap">
                {issue.description || (language === "en" ? "No description provided." : "कोई विवरण नहीं।")}
              </p>
            </div>

            {/* Resolution outcome if resolved */}
            {issue.status === IssueStatus.RESOLVED && (
              <div className="mt-4 text-sm bg-green-500/5 border border-green-500/15 rounded-xl p-4 text-muted-foreground">
                <p className="font-bold text-foreground mb-1">
                  {language === "en" ? "Resolution Details: " : "समाधान विवरण: "}
                </p>
                <p className="text-sm mb-2">
                  {issue.description ||
                    (language === "en"
                      ? "No resolution description available."
                      : "कोई समाधान विवरण उपलब्ध नहीं।")}
                </p>
              </div>
            )}
          </div>

          {/* Leaflet Map Card */}
          {issue.latitude && issue.longitude && (
            <div className="bg-card border border-border/80 shadow-md rounded-2xl overflow-hidden p-6">
              <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-1.5">
                <Map className="w-5 h-5 text-primary" />
                {language === "en" ? "Location Map" : "स्थान मानचित्र"}
              </h3>
              <div
                ref={mapContainerRef}
                className="w-full h-80 rounded-xl border border-border/50 overflow-hidden z-10"
              />
              <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                <span>Latitude: {issue.latitude.toFixed(6)}</span>
                <span>Longitude: {issue.longitude.toFixed(6)}</span>
              </div>
            </div>
          )}

          {/* Multi-department Coordination Panel */}
          {isOfficer && <CoordinationPanel issueId={issue.id} />}
        </div>

        {/* Right Column - Status Operations / AI Intelligence */}
        <div className="space-y-6">
          {/* Officer Operations / Status transition card */}
          {isOfficer && (
            <div className="bg-card border border-border/85 shadow-lg rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">
                  {language === "en" ? "Lifecycle Controls" : "जीवनचक्र नियंत्रण"}
                </h3>
              </div>

              <div className="p-4 bg-muted/20 border border-border/30 rounded-xl mb-4 text-center">
                <p className="text-xs text-muted-foreground">
                  {language === "en" ? "Current Lifecycle Status" : "वर्तमान जीवनचक्र स्थिति"}
                </p>
                <p className="text-lg font-extrabold text-foreground mt-1 uppercase">
                  {STATUS_LABEL[issue.status]?.[language] ?? issue.status}
                </p>
              </div>

              {nextStatuses.length === 0 ? (
                <p className="text-xs text-muted-foreground italic text-center py-2">
                  {language === "en"
                    ? "No further operations available."
                    : "आगे की कोई कार्रवाई उपलब्ध नहीं।"}
                </p>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs text-muted-foreground font-semibold">
                    {language === "en" ? "Update status to:" : "स्थिति बदलें:"}
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {nextStatuses.map((status) => (
                      <Button
                        key={status}
                        disabled={updating}
                        variant={status === "rejected" ? "outline" : "default"}
                        className="w-full font-bold h-11 text-xs justify-center gap-2 rounded-xl"
                        onClick={() => handleTransition(status)}
                      >
                        {updating && <Loader2 className="w-4 h-4 animate-spin" />}
                        {status === "reopened" && <RotateCcw className="w-3.5 h-3.5" />}
                        {STATUS_LABEL[status]?.[language] ?? status}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timeline Milestones Card */}
          <div className="bg-card border border-border/80 shadow-md rounded-2xl p-6">
            <h3 className="text-base font-bold text-foreground mb-4 flex items-center gap-1.5">
              <Clock className="w-5 h-5 text-primary" />
              {language === "en" ? "Milestone Timeline" : "समयरेखा"}
            </h3>
            <div className="space-y-4">
              {timelineSteps.map((step, idx) => (
                <div key={step.key} className="flex items-start gap-3">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                      step.complete
                        ? "bg-green-500 text-white"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}
                  >
                    {step.complete ? "✓" : idx + 1}
                  </div>
                  <div>
                    <p
                      className={`text-sm font-bold ${step.complete ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {language === "en" ? step.labelEn : step.labelHi}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {step.complete
                        ? language === "en"
                          ? "Completed milestone"
                          : "मील का पत्थर पूरा हुआ"
                        : language === "en"
                          ? "Pending milestone"
                          : "लंबित मील का पत्थर"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Intelligence Panel */}
          {user && <AIInsightPanel issue={issue} />}
        </div>
      </div>

      {/* Resolution note dialog modal */}
      {resolvingItem && (
        <ResolveIssueDialog
          item={resolvingItem}
          onClose={() => setResolvingItem(null)}
          onSubmit={handleResolveSubmit}
        />
      )}
    </div>
  );
}
