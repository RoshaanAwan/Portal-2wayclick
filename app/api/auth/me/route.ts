import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// Lightweight "who am I" check. Used by the device-approval page to re-verify the
// session from the CLIENT: when a scanned link opens into the installed PWA, the
// initial server navigation may not carry the SameSite=lax session cookie, but a
// same-origin client fetch like this one does — so this confirms the user is
// actually signed in before we fall back to asking them to log in.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    {
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
