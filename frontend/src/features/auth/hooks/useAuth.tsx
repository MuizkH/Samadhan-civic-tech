import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { AuthUser, AuthSession } from "@/shared/types/domain/AuthUser";
import { authService } from "../services/authService";
import { logger } from "@/shared/services/logger";

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const subscription = authService.onAuthStateChange((_event, session) => {
      logger.info("Auth state changed:", _event);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Check current session
    authService
      .getSession()
      .then((session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch((err) => {
        logger.error("Failed to restore auth session:", err);
        setLoading(false);
      });

    // The API client emits this when a 401 survives a refresh attempt, so
    // an expired session drops the user out instead of leaving a
    // signed-in shell where every request fails.
    const handleExpired = () => {
      logger.info("Session expired — clearing local auth state");
      setSession(null);
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("samadhan_session_expired", handleExpired);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("samadhan_session_expired", handleExpired);
    };
  }, []);

  const signOut = async () => {
    try {
      await authService.signOut();
      setSession(null);
      setUser(null);
    } catch (err) {
      logger.error("Signout failed:", err);
      throw err;
    }
  };

  return <AuthContext.Provider value={{ user, session, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
