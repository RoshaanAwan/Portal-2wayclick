import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClientBoard } from "@/lib/clientShare";
import { adminDb } from "@/lib/db";
import { runWithTenant } from "@/lib/tenantContext";
import { resolveBrand, resolveBrandForTenant } from "@/lib/branding";
import { pageTitle } from "@/lib/brand";
import { SharedBoardClient } from "./SharedBoardClient";

// Public, login-less client board. Lives OUTSIDE the (app) route group, so it
// skips the auth layout (no session, no sidebar) — the share token is the only
// gate. Never index it; the link is meant to be shared privately.
//
// "The token wins": brand (logo/name shown to the client) comes from the OWNING
// tenant resolved from the project row, not the request host or env default.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const owner = await adminDb.project.findUnique({
    where: { shareToken: token },
    select: { tenantId: true },
  });
  const brand = owner
    ? await resolveBrandForTenant(owner.tenantId)
    : await resolveBrand();
  return {
    title: pageTitle("Project", brand.name),
    robots: { index: false, follow: false },
  };
}

export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Resolve the OWNING tenant from the row (adminDb, no ambient context), then
  // run the scoped board read inside that tenant — the auto-scoped Prisma client
  // fails closed without a context on this public, context-less request.
  const owner = await adminDb.project.findUnique({
    where: { shareToken: token },
    select: { tenantId: true },
  });

  // Unknown or revoked token → 404 (same as a missing page; we don't confirm
  // whether a project ever existed behind this link).
  if (!owner) notFound();

  const board = await runWithTenant(owner.tenantId, () =>
    getClientBoard(token),
  );
  if (!board) notFound();

  // The client sees the owning tenant's brand (logo + name in the board header).
  const brand = await resolveBrandForTenant(owner.tenantId);

  return (
    <SharedBoardClient
      token={token}
      board={board}
      brand={{ name: brand.name, logoUrl: brand.logoUrl }}
    />
  );
}
