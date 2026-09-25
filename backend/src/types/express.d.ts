import { AccessTokenClaims } from "../shared/lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenClaims;
      audit: {
        actorId: string | null;
        ipHash: string | null;
      };
      /** Set by the `validate(schema, "query")` middleware — req.query itself is read-only in Express 5. */
      validatedQuery?: unknown;
    }
  }
}

export {};
