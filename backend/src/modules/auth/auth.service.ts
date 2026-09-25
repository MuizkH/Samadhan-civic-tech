import bcrypt from "bcrypt";
import { prisma } from "../../shared/lib/prisma.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../shared/lib/jwt.js";
import { AuthError, ConflictError, NotFoundError } from "../../shared/errors/AppError.js";
import { RegisterInput, LoginInput } from "./auth.schemas.js";

const BCRYPT_ROUNDS = 12;

function issueTokens(user: { id: string; role: string; departmentId: string | null; city: string | null }) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role as "citizen" | "dept_admin" | "super_admin",
    departmentId: user.departmentId,
    city: user.city,
  });
  const refreshToken = signRefreshToken({ sub: user.id });
  return { accessToken, refreshToken };
}

function toPublicUser(user: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  departmentId: string | null;
  city: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    departmentId: user.departmentId,
    // The client needs this to label the dashboard with the jurisdiction being
    // shown, and to distinguish "your city has no open issues" from
    // "no city assigned to your account".
    city: user.city,
  };
}

export const authService = {
  /** Public registration always creates a citizen — staff accounts are seeded/provisioned separately. */
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError("An account with this email already exists");

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        role: "citizen",
      },
    });

    return { user: toPublicUser(user), ...issueTokens(user) };
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new AuthError("Invalid email or password");

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new AuthError("Invalid email or password");

    return { user: toPublicUser(user), ...issueTokens(user) };
  },

  async refresh(refreshToken: string) {
    let claims;
    try {
      claims = verifyRefreshToken(refreshToken);
    } catch {
      throw new AuthError("Invalid or expired refresh token");
    }

    const user = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user) throw new AuthError("Invalid or expired refresh token");

    return issueTokens(user);
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");
    return toPublicUser(user);
  },
};
