import { useNavigate } from "react-router-dom";
import { useAnalytics } from "../hooks/useAnalytics";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { ROUTES } from "@/shared/config/routes";
import { MapPin, Clock, Map } from "lucide-react";

/**
 * The two analytics cards that render no charts. They used to live in
 * AnalyticsPanel.tsx, which imports recharts — and because these two are
 * always visible on the dashboard, that pulled ~104 KB gz of charting onto
 * every dashboard load even though neither card draws a chart.
 */
export function DepartmentPerformanceCard() {
  const { language } = useLanguage();
  const { departments, loading } = useAnalytics();

  if (loading || !departments.length) return null;

  return (
    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-card h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">
          {language === "en" ? "Department Performance" : "विभागीय प्रदर्शन"}
        </h3>
      </div>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b border-border text-left">
              <th className="py-2.5 font-semibold text-sm">{language === "en" ? "Department" : "विभाग"}</th>
              <th className="py-2.5 text-center font-semibold text-sm">
                {language === "en" ? "Open" : "खुले"}
              </th>
              <th className="py-2.5 text-center font-semibold text-sm">
                {language === "en" ? "Resolved" : "हल"}
              </th>
              <th className="py-2.5 text-right font-semibold text-sm">{language === "en" ? "Rate" : "दर"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {departments.slice(0, 4).map((dept) => (
              <tr key={dept.departmentId} className="hover:bg-muted/20 transition-colors">
                <td className="py-3 font-semibold text-foreground pr-2 text-sm">{dept.nameEn}</td>
                <td className="py-3 text-center text-muted-foreground font-medium text-sm">
                  {dept.openIssues}
                </td>
                <td className="py-3 text-center text-muted-foreground font-medium text-sm">
                  {dept.resolvedIssues}
                </td>
                <td className="py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  {dept.resolutionRate}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IssueHotspotsCard() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { hotspots, loading } = useAnalytics();

  if (loading || !hotspots.length) return null;

  return (
    <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-card h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Map className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">
            {language === "en" ? "Issue Hotspots" : "समस्या हॉटस्पॉट"}
          </h3>
        </div>
        <span className="text-xs text-muted-foreground font-semibold">
          {language === "en" ? "click → zoom map" : "क्लिक → मानचित्र"}
        </span>
      </div>
      <div className="space-y-3 flex-1">
        {hotspots.slice(0, 3).map((spot, idx) => (
          <button
            key={`${spot.latitude},${spot.longitude}`}
            onClick={() => navigate(`${ROUTES.CIVIC_MAP}?lat=${spot.latitude}&lng=${spot.longitude}&zoom=14`)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/40 hover:border-primary/30 transition-all text-left group cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate flex items-center gap-1.5 group-hover:text-primary transition-colors">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {spot.topCategory ?? (language === "en" ? "Mixed reports" : "मिश्रित")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                {spot.latitude.toFixed(3)}, {spot.longitude.toFixed(3)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-base font-extrabold text-foreground">{spot.count}</p>
              <p className="text-xs font-bold text-rose-500">
                {spot.openCount} {language === "en" ? "open" : "खुले"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
