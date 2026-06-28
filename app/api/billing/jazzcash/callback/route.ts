import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { adminDb } from "@/lib/db";
import { appBaseUrl } from "@/lib/share";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import { activateTenantPlanFromJazzCash } from "@/lib/billing";
import {
  getJazzCashConfig,
  isJazzCashConfigured,
  verifySecureHash,
  isJazzCashSuccess,
} from "@/lib/jazzcash";

// JazzCash return handler. JazzCash POSTs the customer back here (form-encoded)
// after the hosted payment. This — NOT the redirect alone — is where a payment is
// trusted: we re-verify the pp_SecureHash against the integrity salt, so a forged
// "paid" POST can't activate a tenant. On a verified success we activate the plan
// for one period (lib/billing.activateTenantPlanFromJazzCash, idempotent on the
// txn ref), then redirect the browser to /billing with a status flag.
//
// The tenant/plan/txnRef we issued ride along as query params (JazzCash doesn't
// echo arbitrary metadata); we cross-check the echoed pp_TxnRefNo against them so
// the URL can't be repointed at a different tenant.
export const dynamic = "force-dynamic";

/** Redirect the browser to the billing page with a JazzCash status flag. */
async function redirectToBilling(flag: "success" | "failed"): Promise<NextResponse> {
  const subdomain = (await headers()).get("x-tenant-subdomain");
  const base = appBaseUrl(subdomain);
  return NextResponse.redirect(`${base}/billing?jazzcash=${flag}`, { status: 303 });
}

export async function POST(req: Request) {
  // No JazzCash config → nothing could have legitimately been signed; bail.
  if (!isJazzCashConfigured()) return redirectToBilling("failed");

  // Context we issued at checkout, echoed back in the return URL.
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const planId = url.searchParams.get("planId");
  const expectedTxnRef = url.searchParams.get("txnRef");

  // JazzCash posts the response as application/x-www-form-urlencoded.
  let fields: Record<string, string> = {};
  try {
    const body = await req.formData();
    for (const [k, v] of body.entries()) fields[k] = typeof v === "string" ? v : "";
  } catch {
    return redirectToBilling("failed");
  }

  const cfg = getJazzCashConfig();

  // 1) Authenticity: the response hash must verify against our integrity salt.
  if (!verifySecureHash(fields, cfg.integritySalt)) {
    console.error("[billing.jazzcash.callback] secure hash mismatch", {
      tenantId,
      txnRef: fields.pp_TxnRefNo,
    });
    return redirectToBilling("failed");
  }

  // 2) Integrity of the linkage: the echoed txn ref must match the one we issued,
  // and we must have a tenant + plan to credit.
  if (!tenantId || !planId || !expectedTxnRef) return redirectToBilling("failed");
  if (fields.pp_TxnRefNo !== expectedTxnRef) {
    console.error("[billing.jazzcash.callback] txn ref mismatch", {
      expected: expectedTxnRef,
      got: fields.pp_TxnRefNo,
    });
    return redirectToBilling("failed");
  }

  // 3) Payment outcome.
  const responseCode = fields.pp_ResponseCode ?? null;
  if (!isJazzCashSuccess(responseCode)) {
    // A declined/cancelled payment — record it and send them back to choose again.
    await runWithTenant(tenantId, () =>
      audit({
        actor: { id: null, name: "JazzCash", role: "SYSTEM" },
        action: "billing.jazzcash_failed",
        entity: "Tenant",
        entityId: tenantId,
        summary: `JazzCash payment did not complete (${responseCode ?? "no code"})`,
        detail: {
          planId,
          txnRef: expectedTxnRef,
          responseCode,
          responseMessage: fields.pp_ResponseMessage ?? null,
        },
      }),
    ).catch((e) => console.error("[billing.jazzcash.callback] audit failed", e));
    return redirectToBilling("failed");
  }

  // 4) Verified success → activate the plan for one period (idempotent on txnRef).
  // Guard against a stale/foreign tenant id (e.g. a repointed URL whose hash still
  // somehow verified): a missing tenant just lands "failed" rather than 500-ing.
  const exists = await adminDb.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!exists) {
    console.error("[billing.jazzcash.callback] tenant not found", { tenantId });
    return redirectToBilling("failed");
  }

  try {
    await activateTenantPlanFromJazzCash(tenantId, planId, expectedTxnRef);
  } catch (e) {
    console.error("[billing.jazzcash.callback] activation failed", e);
    return redirectToBilling("failed");
  }

  return redirectToBilling("success");
}

// Some JazzCash configurations issue the return as a GET with the params in the
// query string. Mirror the POST handling by reconstructing a form-shaped request.
export async function GET(req: Request) {
  const url = new URL(req.url);
  // Only the pp_* response fields are in the query for a GET return; rebuild a
  // form-encoded body and delegate to POST so verification logic stays in one place.
  const params = new URLSearchParams();
  for (const [k, v] of url.searchParams.entries()) {
    if (k.startsWith("pp_") || k.startsWith("ppmpf_")) params.set(k, v);
  }
  // Preserve our issued context (tenantId/planId/txnRef) on the delegated URL.
  const forwarded = new Request(req.url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return POST(forwarded);
}
