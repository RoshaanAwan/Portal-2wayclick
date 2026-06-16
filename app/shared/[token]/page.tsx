import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClientBoard } from "@/lib/clientShare";
import { SharedBoardClient } from "./SharedBoardClient";

// Public, login-less client board. Lives OUTSIDE the (app) route group, so it
// skips the auth layout (no session, no sidebar) — the share token is the only
// gate. Never index it; the link is meant to be shared privately.
export const metadata: Metadata = {
  title: "Project — 2WayClick",
  robots: { index: false, follow: false },
};

export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const board = await getClientBoard(token);

  // Unknown or revoked token → 404 (same as a missing page; we don't confirm
  // whether a project ever existed behind this link).
  if (!board) notFound();

  return <SharedBoardClient token={token} board={board} />;
}
