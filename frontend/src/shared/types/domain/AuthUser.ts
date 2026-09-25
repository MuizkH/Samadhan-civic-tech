// TEMPORARY — backend pending (Phase 2)
// Minimal local replacements for the auth types that used to flow through
// the app via the removed backend SDK. Shapes are kept intentionally
// close to that SDK's so a real backend can be swapped in later with
// minimal changes to consuming code.

/**
 * Claims the API actually returns alongside the user record. These are named
 * explicitly rather than left to the index signature so consumers get real
 * autocomplete and type errors instead of reaching in with a cast.
 */
export interface AuthUserMetadata {
  full_name?: string;
  fullName?: string;
  phone?: string;
  role?: string;
  departmentId?: string | null;
  city?: string | null;
  [key: string]: unknown;
}

export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: AuthUserMetadata;
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
}

export type AuthChangeEvent =
  "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED" | "INITIAL_SESSION";
