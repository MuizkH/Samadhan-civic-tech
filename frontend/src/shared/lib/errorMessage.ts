/**
 * Pulls a displayable message out of an unknown thrown value.
 *
 * `catch (err: any)` used to be the shortcut for reaching `.message`, which
 * silently accepts anything — including the case where a non-Error was thrown
 * and `.message` is undefined, producing "undefined" in the UI. Catch clauses
 * now bind `unknown` and come through here instead.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  if (typeof err === "object" && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}
