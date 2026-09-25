export { adminService } from "./services/adminService";
export { adminRepository } from "./repositories/adminRepository";
export { useAdminDashboard } from "./hooks/useAdminDashboard";
// AdminPage is intentionally NOT re-exported here — it's lazy-loaded
// directly by AppRoutes. Re-exporting it from this barrel would pull the
// whole admin page (and its deps) into every module that imports
// adminService/adminRepository/useAdminDashboard, defeating the lazy split.
