import { EventEmitter } from "events";

/**
 * In-process pub/sub backing the SSE endpoints.
 *
 * Single-process only by design — the stack rules out Redis, so a
 * horizontally scaled deployment would need each instance's subscribers to
 * be fed from the database (e.g. LISTEN/NOTIFY) instead. Documented here so
 * the constraint is visible rather than discovered in production.
 */
export interface IssueEvent {
  type: "issue.created" | "issue.status_changed" | "issue.verification_changed" | "issue.supported";
  issueId: string;
  departmentIds: string[];
  /**
   * City the underlying issue belongs to. Required (not optional) so that
   * adding a new emit site cannot silently leak across jurisdictions — the
   * compiler forces every publisher to state the city. Use null only for
   * events that are not department-scoped at all (e.g. a notification nudge
   * addressed to one recipient), which never reach a department channel.
   */
  city: string | null;
  payload: Record<string, unknown>;
  at: string;
}

class EventBus extends EventEmitter {
  emitIssueEvent(event: IssueEvent) {
    this.emit(`issue:${event.issueId}`, event);
    for (const departmentId of event.departmentIds) {
      this.emit(`department:${departmentId}`, event);
    }
    this.emit("all", event);
  }

  onIssue(issueId: string, listener: (e: IssueEvent) => void): () => void {
    const channel = `issue:${issueId}`;
    this.on(channel, listener);
    return () => this.off(channel, listener);
  }

  /**
   * Subscribes to one department's queue, optionally narrowed to a single
   * city. `city: null` means no geographic restriction (super_admin).
   *
   * Without the city filter a Bhopal roads admin's dashboard would live-update
   * with Indore issues even though the same issues are absent from the paged
   * queue they just fetched.
   */
  onDepartment(departmentId: string, city: string | null, listener: (e: IssueEvent) => void): () => void {
    const channel = `department:${departmentId}`;
    const scoped =
      city === null
        ? listener
        : (e: IssueEvent) => {
            if (e.city === city) listener(e);
          };
    this.on(channel, scoped);
    return () => this.off(channel, scoped);
  }
}

export const eventBus = new EventBus();
// Each connected SSE client adds a listener; the default cap of 10 is far
// too low for a dashboard with several admins watching one department.
eventBus.setMaxListeners(0);
