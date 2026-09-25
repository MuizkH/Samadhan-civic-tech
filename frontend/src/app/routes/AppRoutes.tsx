import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { MainLayout } from "../layouts/MainLayout";
import { AuthGuard } from "./guards/AuthGuard";
import { AdminGuard } from "./guards/AdminGuard";
import { ROUTES } from "@/shared/config/routes";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages
const Landing = lazy(() => import("@/pages/Landing"));
const Dashboard = lazy(() => import("@/features/dashboard/pages/DashboardPage"));
const ReportIssue = lazy(() => import("@/features/issues/pages/ReportIssuePage"));
const _Schemes = lazy(() => import("@/features/schemes/pages/SchemesPage"));
const FormAnalyzer = lazy(() => import("@/features/ai-assistant/pages/FormAnalyzerPage"));
const _Documents = lazy(() => import("@/features/documents/pages/DocumentsPage"));
const Auth = lazy(() => import("@/features/auth/pages/AuthPage"));
const Profile = lazy(() => import("@/features/profile/pages/ProfilePage"));
const Admin = lazy(() => import("@/features/admin/pages/AdminPage"));
const CivicMap = lazy(() => import("@/features/civic-map/pages/CivicMapPage"));
const IssueDetail = lazy(() => import("@/features/issues/pages/IssueDetailPage"));
const Transparency = lazy(() => import("@/features/transparency/pages/TransparencyPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<MainLayout />}>
          {/* Public Routes */}
          <Route path={ROUTES.LANDING} element={<Landing />} />
          <Route path={ROUTES.SIGN_IN} element={<Auth />} />
          <Route path={ROUTES.SIGN_UP} element={<Auth />} />
          <Route path={ROUTES.FORM_ANALYZER} element={<FormAnalyzer />} />
          <Route path={ROUTES.CIVIC_MAP} element={<CivicMap />} />
          {/* Public accountability scorecard — deliberately unauthenticated. */}
          <Route path={ROUTES.TRANSPARENCY} element={<Transparency />} />

          {/* Protected Citizen Routes */}
          <Route
            path={ROUTES.DASHBOARD}
            element={
              <AuthGuard>
                <Dashboard />
              </AuthGuard>
            }
          />
          <Route
            path={ROUTES.REPORT_ISSUE}
            element={
              <AuthGuard>
                <ReportIssue />
              </AuthGuard>
            }
          />
          <Route
            path={ROUTES.PROFILE}
            element={
              <AuthGuard>
                <Profile />
              </AuthGuard>
            }
          />

          {/* Protected Admin Routes */}
          <Route
            path={ROUTES.ADMIN}
            element={
              <AdminGuard>
                <Admin />
              </AdminGuard>
            }
          />

          {/* Protected Issue Detail Route */}
          <Route
            path={ROUTES.ISSUE_DETAIL}
            element={
              <AuthGuard>
                <IssueDetail />
              </AuthGuard>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
