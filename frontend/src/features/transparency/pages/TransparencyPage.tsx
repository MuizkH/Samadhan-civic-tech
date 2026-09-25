import { useEffect, useState } from "react";
import { apiRequest } from "@/shared/lib/apiClient";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { PageMeta } from "@/shared/components/PageMeta";
import { Badge } from "@/shared/components/ui/badge";
import { ShieldCheck, AlertTriangle, Clock, TrendingUp, Building2 } from "lucide-react";

interface DepartmentScore {
  departmentId: string;
  code: string;
  name: string;
  totalWorkOrders: number;
  openBacklog: number;
  resolved: number;
  resolutionRate: number;
  avgResolutionHours: number | null;
  p90ResolutionHours: number | null;
  slaCompliance: number | null;
  slaTracked: number;
  currentlyBreached: number;
}

interface Transparency {
  generatedAt: string;
  city: {
    totalWorkOrders: number;
    openBacklog: number;
    resolved: number;
    resolutionRate: number;
    slaCompliance: number | null;
    currentlyBreached: number;
  };
  departments: DepartmentScore[];
}

function hours(v: number | null, language: "en" | "hi") {
  if (v === null) return language === "en" ? "—" : "—";
  if (v < 24) return `${Math.round(v)}h`;
  return `${Math.round(v / 24)}d`;
}

function complianceTone(pct: number | null) {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 85) return "text-green-600";
  if (pct >= 60) return "text-amber-600";
  return "text-red-600";
}

/**
 * Public accountability scorecard. No login, no citizen data — just how
 * each department is actually performing.
 */
export default function TransparencyPage() {
  const { language } = useLanguage();
  const [data, setData] = useState<Transparency | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Transparency>("/public/transparency", { auth: false })
      .then(setData)
      .catch((err) => setError(err?.message ?? "Could not load the scorecard."));
  }, []);

  // The heading and page metadata render unconditionally, before the data
  // arrives or fails. This route is one of only two crawlable pages, so a
  // prerender or a slow connection must still yield a real <h1>, title and
  // canonical rather than a spinner or an error line.
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <PageMeta
        title="Department performance scorecard — Samadhan"
        description="Live public scorecard of how each municipal department is performing on citizen complaints: resolution rates, average time to fix, and SLA breaches. No login required."
        path="/transparency"
      />
      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === "en" ? "Public Transparency Scorecard" : "सार्वजनिक पारदर्शिता स्कोरकार्ड"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {language === "en"
              ? "How each department is performing on citizen complaints. Updated live, no login required."
              : "प्रत्येक विभाग नागरिक शिकायतों पर कैसा प्रदर्शन कर रहा है। लाइव अपडेट, लॉगिन आवश्यक नहीं।"}
          </p>
        </div>
      </div>

      {error && (
        <div className="my-10 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {!error && !data && (
        <div className="my-6 space-y-6" aria-busy="true">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-[104px] rounded-2xl bg-muted/30 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[268px] rounded-2xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {data && (
        <>
          {/* City-wide summary */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 my-6">
            {[
              {
                label: language === "en" ? "Work Orders" : "कार्य आदेश",
                value: data.city.totalWorkOrders,
                icon: Building2,
              },
              {
                label: language === "en" ? "Resolved" : "हल",
                value: `${data.city.resolutionRate}%`,
                icon: TrendingUp,
              },
              {
                label: language === "en" ? "SLA Compliance" : "एसएलए अनुपालन",
                value: data.city.slaCompliance === null ? "—" : `${data.city.slaCompliance}%`,
                icon: ShieldCheck,
              },
              {
                label: language === "en" ? "Open Backlog" : "लंबित",
                value: data.city.openBacklog,
                icon: Clock,
              },
              {
                label: language === "en" ? "Breached" : "उल्लंघन",
                value: data.city.currentlyBreached,
                icon: AlertTriangle,
              },
            ].map((card) => (
              <div key={card.label} className="bg-card border border-border rounded-2xl p-4">
                <card.icon className="w-4 h-4 text-primary mb-2" />
                <p className="text-2xl font-extrabold text-foreground">{card.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Department cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.departments.map((d) => (
              <div key={d.departmentId} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <h2 className="text-sm font-bold text-foreground">{d.name}</h2>
                  {d.currentlyBreached > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-red-600 border-red-500/25 bg-red-500/5 shrink-0"
                    >
                      {d.currentlyBreached} {language === "en" ? "breached" : "उल्लंघन"}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                  <Metric
                    label={language === "en" ? "Resolution rate" : "समाधान दर"}
                    value={`${d.resolutionRate}%`}
                  />
                  <Metric
                    label={language === "en" ? "SLA compliance" : "एसएलए अनुपालन"}
                    value={d.slaCompliance === null ? "—" : `${d.slaCompliance}%`}
                    tone={complianceTone(d.slaCompliance)}
                  />
                  <Metric
                    label={language === "en" ? "Avg resolution" : "औसत समाधान"}
                    value={hours(d.avgResolutionHours, language)}
                  />
                  <Metric
                    label={language === "en" ? "90th percentile" : "90वां प्रतिशतक"}
                    value={hours(d.p90ResolutionHours, language)}
                  />
                  <Metric
                    label={language === "en" ? "Open backlog" : "लंबित कार्य"}
                    value={String(d.openBacklog)}
                  />
                  <Metric
                    label={language === "en" ? "Total handled" : "कुल"}
                    value={String(d.totalWorkOrders)}
                  />
                </div>

                {/* Resolution rate bar */}
                <div className="mt-4">
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, d.resolutionRate)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground mt-6 text-center">
            {language === "en" ? "Generated" : "जनरेट"} {new Date(data.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={`text-lg font-bold ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
