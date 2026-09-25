import { apiRequest } from "@/shared/lib/apiClient";

export interface UserStats {
  reportCount: number;
  supportCount: number;
  verificationCount: number;
  resolvedReportCount: number;
  reportDates: string[];
}

const EMPTY: UserStats = {
  reportCount: 0,
  supportCount: 0,
  verificationCount: 0,
  resolvedReportCount: 0,
  reportDates: [],
};

/**
 * Real contribution counts for the Community Hero widget, straight from the
 * database. Replaces the previous localStorage key scan, which only ever
 * saw activity from the current browser.
 */
export const userStatsService = {
  async getMyStats(): Promise<UserStats> {
    try {
      return await apiRequest<UserStats>("/users/me/stats");
    } catch {
      // Gamification is decorative — never block the header on it.
      return EMPTY;
    }
  },
};
