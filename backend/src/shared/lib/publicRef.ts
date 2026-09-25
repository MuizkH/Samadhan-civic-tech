/** Generates a citizen-facing reference like SAM-2026-4F82A1. */
export function generatePublicRef(now: Date = new Date()): string {
  const year = now.getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SAM-${year}-${random}`;
}
