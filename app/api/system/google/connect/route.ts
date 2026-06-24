import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireSystemOwner } from "@/lib/auth";
import { originFromRequest } from "@/lib/integrations/google";

// Kicks off Google OAuth for the System Owner's own Drive connection.
// Uses platform-wide GOOGLE_CLIENT_ID/SECRET env vars (no tenant Integration row).
// Redirects back to /api/system/google/callback.

const STATE_COOKIE = "sys_gdrive_state";
const RETURN_COOKIE = "sys_gdrive_return";

function validateRedirect(path: string | null) {
  if (!path) return "/system/settings";
  if (!path.startsWith("/")) return "/system/settings";
  if (path.includes("//")) return "/system/settings";
  return path;
}

export async function GET(req: Request) {
  const origin = originFromRequest(req);
  const url = new URL(req.url);
  const redirectTo = validateRedirect(url.searchParams.get("redirectTo"));
  const back = (q: string) => NextResponse.redirect(new URL(`${redirectTo}?${q}`, origin));

  try {
    const actor = await requireSystemOwner();

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return back("drive_error=not_configured");
    }

    const redirectUri = `${origin}/api/system/google/callback`;
    const state = `${actor.id}.${randomBytes(16).toString("hex")}`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.file",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    });

    const res = NextResponse.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    );
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.COOKIE_INSECURE === "true" ? false : process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    res.cookies.set(RETURN_COOKIE, encodeURIComponent(redirectTo), {
      httpOnly: true,
      secure: process.env.COOKIE_INSECURE === "true" ? false : process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return res;
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.redirect(new URL("/login", origin));
    console.error("[system.google.connect]", e);
    return back("drive_error=connect_failed");
  }
}
