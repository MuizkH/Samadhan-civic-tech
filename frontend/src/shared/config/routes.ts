export const ROUTES = {
  HOME: "/",
  LANDING: "/",
  DASHBOARD: "/dashboard",
  REPORT_ISSUE: "/report",
  SCHEMES: "/schemes",
  FORM_ANALYZER: "/analyzer",
  DOCUMENTS: "/documents",
  SIGN_IN: "/signin",
  SIGN_UP: "/signup",
  PROFILE: "/profile",
  ADMIN: "/admin",
  CIVIC_MAP: "/map",
  TRANSPARENCY: "/transparency",
  ISSUE_DETAIL: "/issues/:id",
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
