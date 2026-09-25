import { AnalyticsOverview, DepartmentPerformanceRow, Hotspot } from "./analyticsApi";

/**
 * Presentation helpers only.
 *
 * All aggregation now happens server-side in /analytics/* (see
 * analyticsApi.ts) — the previous client-side implementations recomputed
 * counts from whatever page of issues happened to be loaded, and filled the
 * gaps with invented values (an "AI classifications" tally that was just
 * issues.length, and a growth forecast that defaulted to +15%). Those are
 * gone; this file only formats numbers the server produced.
 */

export interface WeeklySummaryState {
  summaryTextEn: string;
  summaryTextHi: string;
  insightsEn: string[];
  insightsHi: string[];
}

export const CATEGORY_COLORS: Record<string, string> = {
  "Water Supply": "#3b82f6",
  Sanitation: "#f59e0b",
  Electricity: "#eab308",
  Roads: "#6b7280",
  "Parks & Gardens": "#22c55e",
  Buildings: "#8b5cf6",
};

export const STATUS_COLORS: Record<string, string> = {
  reported: "#f59e0b",
  acknowledged: "#a855f7",
  in_progress: "#3b82f6",
  resolved: "#22c55e",
  verified: "#10b981",
  reopened: "#f97316",
  rejected: "#ef4444",
  closed: "#64748b",
};

export const STATUS_LABELS: Record<string, { en: string; hi: string }> = {
  reported: { en: "Reported", hi: "रिपोर्ट" },
  acknowledged: { en: "Acknowledged", hi: "स्वीकृत" },
  in_progress: { en: "In Progress", hi: "प्रगति में" },
  resolved: { en: "Resolved", hi: "हल" },
  verified: { en: "Verified", hi: "सत्यापित" },
  reopened: { en: "Reopened", hi: "पुनः खोला" },
  rejected: { en: "Rejected", hi: "अस्वीकृत" },
  closed: { en: "Closed", hi: "बंद" },
};

/** Hours -> a short human string, or a clear "no data yet" when null. */
export function formatResolutionTime(hours: number | null, language: "en" | "hi"): string {
  if (hours === null) {
    return language === "en" ? "No resolved issues yet" : "अभी कोई हल नहीं";
  }
  if (hours < 24) return `${Math.round(hours)} ${language === "en" ? "hrs" : "घंटे"}`;
  return `${Math.round(hours / 24)} ${language === "en" ? "days" : "दिन"}`;
}

export const dashboardService = {
  /**
   * Builds the narrative summary purely from server-computed figures.
   * Every number quoted here came out of /analytics/*.
   */
  buildWeeklySummary(
    overview: AnalyticsOverview | null,
    departments: DepartmentPerformanceRow[],
    hotspots: Hotspot[]
  ): WeeklySummaryState {
    if (!overview) {
      return { summaryTextEn: "", summaryTextHi: "", insightsEn: [], insightsHi: [] };
    }

    const topCategory = overview.byCategory[0]?.nameEn ?? "—";
    const topCategoryCount = overview.byCategory[0]?.count ?? 0;
    const totalIssues = overview.totals.issues;
    const resolutionRate = totalIssues === 0 ? 0 : Math.round((overview.totals.resolved / totalIssues) * 100);
    const avg = overview.resolutionTime.avgHours;
    const p90 = overview.resolutionTime.p90Hours;
    const bestDept = [...departments].sort((a, b) => b.resolutionRate - a.resolutionRate)[0];
    const topHotspotCount = hotspots[0]?.count ?? 0;

    const avgEn = avg === null ? "not measurable yet" : `${formatResolutionTime(avg, "en")}`;
    const avgHi = avg === null ? "अभी मापने योग्य नहीं" : `${formatResolutionTime(avg, "hi")}`;

    return {
      summaryTextEn:
        `Weekly Summary: **${overview.totals.reportedThisWeek}** new issues were reported in the last 7 days, ` +
        `out of **${totalIssues}** total. Departments have resolved **${overview.totals.resolved}** ` +
        `(**${resolutionRate}%**), averaging **${avgEn}** per resolution.`,
      summaryTextHi:
        `साप्ताहिक विवरण: पिछले 7 दिनों में **${overview.totals.reportedThisWeek}** नई समस्याएं दर्ज हुईं, ` +
        `कुल **${totalIssues}** में से। विभागों ने **${overview.totals.resolved}** ` +
        `(**${resolutionRate}%**) हल कीं, औसतन **${avgHi}** प्रति समाधान।`,
      insightsEn: [
        `Most reported category: **${topCategory}** (${topCategoryCount} issues).`,
        bestDept
          ? `Best performing department: **${bestDept.nameEn}** at **${bestDept.resolutionRate}%** resolution.`
          : `No department performance data yet.`,
        p90 !== null
          ? `90% of resolved issues closed within **${formatResolutionTime(p90, "en")}**.`
          : `Not enough resolved issues to compute a 90th percentile.`,
        topHotspotCount > 0
          ? `Densest hotspot holds **${topHotspotCount}** reports in one area.`
          : `No clustered hotspots detected yet.`,
      ],
      insightsHi: [
        `सर्वाधिक दर्ज श्रेणी: **${topCategory}** (${topCategoryCount} समस्याएं)।`,
        bestDept
          ? `सर्वश्रेष्ठ विभाग: **${bestDept.nameEn}** — **${bestDept.resolutionRate}%** समाधान दर।`
          : `अभी कोई विभागीय डेटा नहीं।`,
        p90 !== null
          ? `90% हल की गई समस्याएं **${formatResolutionTime(p90, "hi")}** के भीतर बंद हुईं।`
          : `90वें प्रतिशतक के लिए पर्याप्त डेटा नहीं।`,
        topHotspotCount > 0
          ? `सबसे घना हॉटस्पॉट: एक क्षेत्र में **${topHotspotCount}** रिपोर्ट।`
          : `अभी कोई हॉटस्पॉट नहीं मिला।`,
      ],
    };
  },
};
