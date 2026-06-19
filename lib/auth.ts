import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { randomBytes } from "crypto";

const SESSION_COOKIE = "twayclick_session";
const SESSION_DAYS = 7;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({ data: { token, userId, expiresAt } });

  // Next 15+: cookies() is async.
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure cookies are dropped by browsers over plain http. While the app is
    // served over http (no TLS/domain yet), set COOKIE_INSECURE=true to allow
    // the session cookie to be stored. Remove this env var once on HTTPS.
    secure:
      process.env.COOKIE_INSECURE === "true"
        ? false
        : process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Returns the authenticated user or null.
 *
 * Wrapped in React.cache() so the session lookup is de-duplicated within a
 * single server request: the layout and the page both call this, but the DB
 * is hit only once per request instead of twice.
 */
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  // A disabled account is treated as signed-out everywhere, even if it still
  // holds a (not-yet-revoked) session cookie. Disabling also deletes sessions,
  // so this is a belt-and-suspenders guard.
  if (session.user.disabledAt) {
    return null;
  }

  const { passwordHash, ...safeUser } = session.user;
  return safeUser;
});

export type SafeUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Throws if not authenticated — use in route handlers / server actions. */
export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
