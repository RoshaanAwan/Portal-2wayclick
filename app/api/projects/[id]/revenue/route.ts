import { NextResponse } from "next/server";

// DEPRECATED. A project's revenue is no longer a single editable figure — it is
// the sum of its income lines. Use POST/DELETE /api/projects/[id]/income instead.
// This stub remains only so a stale client gets a clear signal, not a 404 mystery.
export async function PUT() {
  return NextResponse.json(
    { error: "Revenue is now managed via income lines (/income)." },
    { status: 410 },
  );
}
