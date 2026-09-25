import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export interface AccessTokenClaims {
  sub: string; // user id
  role: "citizen" | "dept_admin" | "super_admin";
  departmentId: string | null;
  /**
   * Municipal jurisdiction a staff account is scoped to. Optional rather than
   * required because tokens minted before city scoping shipped do not carry
   * it — `resolveCityScope` treats a missing claim the same as null.
   */
  city?: string | null;
}

export interface RefreshTokenClaims {
  sub: string;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(claims: RefreshTokenClaims): string {
  return jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenClaims;
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenClaims;
}
