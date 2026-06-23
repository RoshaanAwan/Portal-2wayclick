import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { getInvoiceByToken } from "@/lib/invoiceQueries";
import { adminDb } from "@/lib/db";
import { runWithTenant } from "@/lib/tenantContext";
import { isStripeConfigured } from "@/lib/stripe";
import { formatMoney } from "@/lib/invoices";
import { InvoiceDocument } from "@/app/(app)/invoices/InvoiceDocument";
import { resolveBrand, resolveBrandForTenant } from "@/lib/branding";
import { pageTitle } from "@/lib/brand";
import { PrintButton } from "./PrintButton";
import { PayButton } from "./PayButton";

// Public, login-less client invoice view. Lives OUTSIDE the (app) route group,
// so it skips the auth layout (no session, no sidebar) — the share token is the
// only gate. Never indexed; the link is meant to be shared privately.
//
// "The token wins": the brand the client sees is the OWNING tenant's brand,
// resolved from the invoice row's tenantId — NOT the request host or the env
// default. adminDb looks up that tenant id without any ambient context.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const owner = await adminDb.invoice.findUnique({
    where: { shareToken: token },
    select: { tenantId: true },
  });
  const brand = owner
    ? await resolveBrandForTenant(owner.tenantId)
    : await resolveBrand();
  return {
    title: pageTitle("Invoice", brand.name),
    robots: { index: false, follow: false },
  };
}

export default async function SharedInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; canceled?: string }>;
}) {
  const { token } = await params;
  const { paid, canceled } = await searchParams;

  // The token wins: resolve the OWNING tenant from the row (adminDb, no ambient
  // context), then run the scoped read inside that tenant so the auto-scoped
  // Prisma client doesn't fail closed on a context-less public request.
  const owner = await adminDb.invoice.findUnique({
    where: { shareToken: token },
    select: { tenantId: true },
  });

  // Unknown or revoked token → 404. We don't confirm an invoice ever existed.
  if (!owner) notFound();

  const invoice = await runWithTenant(owner.tenantId, () =>
    getInvoiceByToken(token),
  );
  if (!invoice) notFound();

  // The brand the *client* sees on the invoice is the OWNING tenant's brand, so
  // a runtime rebrand (BrandingSettings) for that tenant shows here.
  const brand = await resolveBrandForTenant(owner.tenantId);

  const isPaid = invoice.status === "PAID";
  const isCancelled = invoice.status === "CANCELLED";
  // Offer online payment only when Stripe is wired up, there's a balance, and
  // the invoice is in a payable state.
  const canPay =
    isStripeConfigured() && !isPaid && !isCancelled && invoice.totalCents > 0;

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-[900px]">
        {/* Return-from-Stripe banners. The webhook is the real source of truth
            for PAID; if the redirect lands before the webhook, the invoice may
            still read SENT for a beat — the success banner reassures meanwhile. */}
        {(paid || isPaid) && (
          <div className="no-print mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>
              Payment received — thank you. This invoice is marked as paid.
            </span>
          </div>
        )}
        {canceled && !isPaid && (
          <div className="no-print mb-5 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <XCircle className="h-5 w-5 shrink-0 text-amber-600" />
            <span>Payment was canceled. You can try again below.</span>
          </div>
        )}

        {/* Toolbar — hidden when printing. */}
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-zinc-500">
            Invoice {invoice.number}
          </p>
          <div className="flex items-center gap-2">
            <PrintButton />
            {canPay && (
              <PayButton
                token={token}
                amountLabel={formatMoney(invoice.totalCents, invoice.currency)}
              />
            )}
          </div>
        </div>

        <div className="print-area">
          <InvoiceDocument
            invoice={invoice}
            issuer={{
              name: brand.name,
              tagline: brand.tagline,
              website: brand.website,
              logoUrl: brand.logoUrl,
              accent: brand.invoiceAccent,
            }}
          />
        </div>
      </div>
    </div>
  );
}
