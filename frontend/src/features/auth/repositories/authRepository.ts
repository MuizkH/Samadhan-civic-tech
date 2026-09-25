// Backed by the real Phase 2 backend (/auth/*) instead of the local mock.

import { apiRequest, tokenStore } from "@/shared/lib/apiClient";
import { AuthChangeEvent, AuthSession, AuthUser } from "@/shared/types/domain/AuthUser";
import { LoginInput } from "../validation/loginSchema";
import { SignupInput } from "../validation/signupSchema";
import { AuthError } from "@/shared/errors/errors";
import { profileRepository } from "@/features/profile/repositories/profileRepository";
import { getErrorMessage } from "@/shared/lib/errorMessage";

const AUTH_EVENT = "samadhan_auth_change";

// The backend user table carries no location, so a locally-seeded profile
// starts on the demo city until the citizen edits it in /profile.
const DEFAULT_PROFILE_CITY = "Bhopal";
const DEFAULT_PROFILE_STATE = "Madhya Pradesh";

interface ApiUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  departmentId: string | null;
}

function toAuthUser(u: ApiUser): AuthUser {
  return {
    id: u.id,
    email: u.email,
    user_metadata: {
      full_name: u.fullName,
      phone: u.phone || undefined,
      role: u.role,
      departmentId: u.departmentId,
    },
  };
}

function emitAuthChange(event: AuthChangeEvent, session: AuthSession | null): void {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { event, session } }));
}

export const authRepository = {
  async signUp(input: SignupInput): Promise<AuthSession> {
    try {
      const data = await apiRequest<{ user: ApiUser; accessToken: string; refreshToken: string }>(
        "/auth/register",
        {
          method: "POST",
          auth: false,
          body: { email: input.email, password: input.password, fullName: input.fullName },
        }
      );
      profileRepository.seedProfileFromAuth(
        data.user.id,
        data.user.fullName,
        data.user.phone,
        input.city,
        input.state
      );
      return { user: toAuthUser(data.user), access_token: data.accessToken };
    } catch (error) {
      throw new AuthError(getErrorMessage(error), error);
    }
  },

  async signIn(input: LoginInput): Promise<AuthSession> {
    try {
      const data = await apiRequest<{ user: ApiUser; accessToken: string; refreshToken: string }>(
        "/auth/login",
        {
          method: "POST",
          auth: false,
          body: { email: input.email, password: input.password },
        }
      );
      tokenStore.setTokens(data.accessToken, data.refreshToken);
      profileRepository.seedProfileFromAuth(
        data.user.id,
        data.user.fullName,
        data.user.phone,
        DEFAULT_PROFILE_CITY,
        DEFAULT_PROFILE_STATE
      );
      const session: AuthSession = { user: toAuthUser(data.user), access_token: data.accessToken };
      emitAuthChange("SIGNED_IN", session);
      return session;
    } catch (error) {
      throw new AuthError(getErrorMessage(error), error);
    }
  },

  async signOut(): Promise<void> {
    tokenStore.clear();
    emitAuthChange("SIGNED_OUT", null);
  },

  async getSession(): Promise<AuthSession | null> {
    const token = tokenStore.getAccessToken();
    if (!token) return null;

    try {
      const user = await apiRequest<ApiUser>("/auth/me");
      profileRepository.seedProfileFromAuth(
        user.id,
        user.fullName,
        user.phone,
        DEFAULT_PROFILE_CITY,
        DEFAULT_PROFILE_STATE
      );
      return { user: toAuthUser(user), access_token: tokenStore.getAccessToken()! };
    } catch {
      tokenStore.clear();
      return null;
    }
  },

  onAuthStateChange(callback: (event: AuthChangeEvent, session: AuthSession | null) => void) {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { event: AuthChangeEvent; session: AuthSession | null };
      callback(detail.event, detail.session);
    };
    window.addEventListener(AUTH_EVENT, handler);
    return { unsubscribe: () => window.removeEventListener(AUTH_EVENT, handler) };
  },
};
