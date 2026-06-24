import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { createHash } from "crypto";

// ── Session JWT ───────────────────────────────────────────────────────────────
// The session cookie carries a SIGNED JWT (HS256) rather than a bare token. The
// JWT wraps the opaque session token that still lives in the Session table — the
// DB row remains the source of truth, so revocation (logout / disable-account),
// impersonation, and tenant scoping all keep working exactly as before. The JWT
// adds: a tamper-proof, self-expiring, verifiable cookie whose payload we can
// read without a DB hit when we only need the embedded token.
//
// Why HS256 (symmetric): a single server signs and verifies; there's no need to
// hand a public key to a separate verifier, so a shared secret is simpler and
// has no operational downside here.
//
// Key: derived from AUTH_JWT_SECRET (any length) via SHA-256 → 32 bytes. In
// production AUTH_JWT_SECRET MUST be set (we throw if not). In dev we fall back to
// a fixed dev-only key so login works out of the box on localhost — tokens signed
// with it are NOT portable to prod, which is fine. Mirrors lib/cryptoBox.ts.

const DEV_FALLBACK = "dev-only-insecure-auth-jwt-secret-do-not-use-in-prod";
const ALG = "HS256";
const ISSUER = "twayclick-portal";

function secret(): Uint8Array {
  const raw = process.env.AUTH_JWT_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_JWT_SECRET is required in production to sign session tokens.",
      );
    }
    return new Uint8Array(createHash("sha256").update(DEV_FALLBACK).digest());
  }
  return new Uint8Array(createHash("sha256").update(raw).digest());
}

export interface SessionClaims {
  /** The opaque Session.token — the credential we look up in the DB. */
  sid: string;
  /** Denormalized for convenience/logging; the DB row stays authoritative. */
  uid: string;
  tid: string;
}

/**
 * Sign a session JWT wrapping the opaque session token. `expiresAt` matches the
 * Session row's expiry so the cookie and the DB row die together.
 */
export async function signSessionJwt(
  claims: SessionClaims,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({ sid: claims.sid, uid: claims.uid, tid: claims.tid })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
}

/**
 * Verify a session JWT and return its claims, or null if the token is missing,
 * malformed, expired, or has a bad signature — callers treat null as signed-out.
 * Never throws.
 */
export async function verifySessionJwt(
  jwt: string | undefined | null,
): Promise<SessionClaims | null> {
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, secret(), {
      issuer: ISSUER,
      algorithms: [ALG],
    });
    return claimsOf(payload);
  } catch {
    return null;
  }
}

function claimsOf(payload: JWTPayload): SessionClaims | null {
  const { sid, uid, tid } = payload as Record<string, unknown>;
  if (typeof sid !== "string" || typeof uid !== "string" || typeof tid !== "string") {
    return null;
  }
  return { sid, uid, tid };
}
