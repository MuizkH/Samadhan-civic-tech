export { useProfileData } from "./hooks/useProfileData";
export { profileService } from "./services/profileService";
export { profileRepository } from "./repositories/profileRepository";
export * from "./types";
// ProfilePage is intentionally NOT re-exported here — it's lazy-loaded
// directly by AppRoutes.
