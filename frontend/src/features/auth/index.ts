export { AuthProvider, useAuth } from "./hooks/useAuth";
export { authService } from "./services/authService";
export { authRepository } from "./repositories/authRepository";
// AuthPage is intentionally NOT re-exported here — it's lazy-loaded
// directly by AppRoutes. AuthProvider wraps the whole app eagerly, so
// re-exporting AuthPage from this barrel would pull it into the initial
// bundle for every route.
