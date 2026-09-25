export { HeroSection } from "./components/HeroSection";
export { IssuesNearYou } from "./components/IssuesNearYou";
export { issueService } from "./services/issueService";
export { issueRepository } from "./repositories/issueRepository";
export { useReportIssue } from "./hooks/useReportIssue";
export { visionService } from "./services/visionService";
// ReportIssuePage is intentionally NOT re-exported here — it's
// lazy-loaded directly by AppRoutes. Re-exporting it would pull the
// report-issue flow (and its deps) into every module that imports
// issueService/issueRepository from this barrel, including the
// always-mounted Header widget.
