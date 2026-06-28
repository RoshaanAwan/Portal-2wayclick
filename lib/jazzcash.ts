import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// ── JazzCash (hosted redirect payment) ────────────────────────────────────────
// JazzCash is a Pakistani payment gateway. Unlike Stripe it has NO native
// auto-renewing subscriptions: it's a one-shot hosted-form redirect. We sign a
// `pp_*` parameter bundle, auto-POST it to JazzCash's merchant page, the customer
// pays there, and JazzCash redirects back (POST) to our ReturnURL with a response
// code we re-verify. A successful payment buys ONE plan period — we set the tenant
// to active and stamp currentPeriodEnd = now + interval (lib/billing.ts). Renewal
// is a fresh payment; the gateway can't auto-charge a card on file.
//
// Test vs live is decided entirely by which JAZZCASH_ENDPOINT + credentials you
// set (sandbox.jazzcash.com.pk vs payments.jazzcash.com.pk) — no separate flag.
//
// Integrity: every request and response carries a pp_SecureHash that is an
// HMAC-SHA256 over the sorted non-empty field VALUES, keyed by the integrity salt
// (JAZZCASH_HASH_KEY). We compute it on the way out and re-verify it on the way
// back, so a forged callback can't mark a tenant paid.

export interface JazzCashConfig {
  merchantId: string;
  password: string;
  integritySalt: string;
  endpoint: string;
  returnUrl: string;
}

/** True when all JazzCash credentials are present (gates the "Pay with JazzCash" UI). */
export function isJazzCashConfigured(): boolean {
  return !!(
    process.env.JAZZCASH_MERCHANT_ID &&
    process.env.JAZZCASH_PASSWORD &&
    process.env.JAZZCASH_HASH_KEY &&
    process.env.JAZZCASH_ENDPOINT &&
    process.env.JAZZCASH_RETURN_URL
  );
}

/**
 * The resolved JazzCash config. Throws if anything is missing — callers should
 * gate on isJazzCashConfigured() first and surface a friendly message.
 */
export function getJazzCashConfig(): JazzCashConfig {
  const merchantId = process.env.JAZZCASH_MERCHANT_ID;
  const password = process.env.JAZZCASH_PASSWORD;
  const integritySalt = process.env.JAZZCASH_HASH_KEY;
  const endpoint = process.env.JAZZCASH_ENDPOINT;
  const returnUrl = process.env.JAZZCASH_RETURN_URL;
  if (!merchantId || !password || !integritySalt || !endpoint || !returnUrl) {
    throw new Error(
      "JazzCash is not configured — set JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, " +
        "JAZZCASH_HASH_KEY, JAZZCASH_ENDPOINT and JAZZCASH_RETURN_URL.",
    );
  }
  return { merchantId, password, integritySalt, endpoint, returnUrl };
}

/**
 * Compute the JazzCash pp_SecureHash for a field bundle.
 *
 * Spec: take every field with a NON-EMPTY value (excluding pp_SecureHash itself),
 * sort the keys ascending, join the VALUES with "&", prepend the integrity salt +
 * "&", then HMAC-SHA256 with the integrity salt as the key. Hex, UPPERCASE.
 */
export function computeSecureHash(
  fields: Record<string, string>,
  integritySalt: string,
): string {
  const ordered = Object.keys(fields)
    .filter((k) => k !== "pp_SecureHash" && fields[k] !== "" && fields[k] != null)
    .sort()
    .map((k) => fields[k]);

  const message = `${integritySalt}&${ordered.join("&")}`;
  return createHmac("sha256", integritySalt)
    .update(message)
    .digest("hex")
    .toUpperCase();
}

/**
 * Constant-time check that a returned pp_SecureHash matches what we recompute over
 * the rest of the response fields. Guards the callback against a forged "paid".
 */
export function verifySecureHash(
  fields: Record<string, string>,
  integritySalt: string,
): boolean {
  const provided = (fields.pp_SecureHash ?? "").toUpperCase();
  if (!provided) return false;
  const expected = computeSecureHash(fields, integritySalt);
  // Lengths must match for timingSafeEqual; bail early (and in constant-ish time)
  // if they don't rather than throwing.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * A compact JazzCash timestamp (yyyyMMddHHmmss) in PAKISTAN time (UTC+5).
 * JazzCash validates pp_TxnDateTime / pp_TxnExpiryDateTime against its own PKT
 * clock — a UTC timestamp reads as 5 hours in the past, which can fail validation
 * or make the expiry window look already-elapsed. We shift to PKT by adding 5h to
 * the UTC epoch and formatting with the *UTC* getters (so no local-tz drift).
 */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
function txnDateTime(d = new Date()): string {
  const pkt = new Date(d.getTime() + PKT_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${pkt.getUTCFullYear()}${p(pkt.getUTCMonth() + 1)}${p(pkt.getUTCDate())}` +
    `${p(pkt.getUTCHours())}${p(pkt.getUTCMinutes())}${p(pkt.getUTCSeconds())}`
  );
}

/** A unique JazzCash transaction reference: "T" + timestamp + short random tail. */
export function newTxnRef(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `T${txnDateTime()}${rand}`;
}

export interface JazzCashFormParams {
  /** The merchant hosted-form endpoint to POST to. */
  endpoint: string;
  /** The signed pp_* fields to submit (includes pp_SecureHash). */
  fields: Record<string, string>;
}

/**
 * Build the signed JazzCash hosted-form parameters for a one-off plan payment.
 *
 * @param amountPkr  the charge in PKR (whole rupees) — JazzCash wants the amount
 *                   in the smallest unit (paisa), so we ×100 here.
 * @param txnRef     our unique transaction reference (also our reconciliation key).
 * @param billRef    a human-ish bill reference shown to the customer.
 * @param description short order description.
 * @param returnUrl  where JazzCash redirects (POSTs) back to — our callback route,
 *                   carrying the tenant/plan/txn context as query params.
 */
export function buildJazzCashForm(opts: {
  amountPkr: number;
  txnRef: string;
  billRef: string;
  description: string;
  returnUrl: string;
  /**
   * Up to 5 merchant pass-through values (ppmpf_1..5). JazzCash echoes these back
   * verbatim in the callback, so we use them to carry our tenant/plan context
   * INSTEAD of query params on the Return URL — the hosted checkout can reject a
   * Return URL that contains a query string, and the "&" in it also collides with
   * JazzCash's own hash-value separator. Empty/extra slots are fine.
   */
  passThrough?: string[];
}): JazzCashFormParams {
  const cfg = getJazzCashConfig();
  const now = new Date();
  // The payment is valid for 1 hour; JazzCash rejects an expired request.
  const expiry = new Date(now.getTime() + 60 * 60 * 1000);

  // Amount in the smallest unit (paisa). JazzCash expects an integer string.
  const amountMinor = String(Math.round(opts.amountPkr * 100));

  // Field set for HOSTED CHECKOUT v1.1 (the page-redirect form flow). Notably this
  // flow does NOT send pp_TxnType (that's the direct REST wallet flow — sending
  // "MWALLET" here makes JazzCash reject with "insufficient merchant information")
  // and does NOT send pp_BankID/pp_ProductID. The hosted page lets the customer
  // pick the instrument. Empty fields are excluded from the hash (skips empties),
  // so listing the optional ones empty is harmless but we keep to the minimal set.
  const fields: Record<string, string> = {
    pp_Version: "1.1",
    pp_Language: "EN",
    pp_MerchantID: cfg.merchantId,
    pp_SubMerchantID: "",
    pp_Password: cfg.password,
    pp_TxnRefNo: opts.txnRef,
    pp_Amount: amountMinor,
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: txnDateTime(now),
    pp_TxnExpiryDateTime: txnDateTime(expiry),
    pp_BillReference: opts.billRef,
    pp_Description: opts.description,
    pp_ReturnURL: opts.returnUrl,
    // Up to 5 free-form merchant pass-through fields, echoed back in the response.
    // We carry tenant/plan/txn context here (see passThrough doc above).
    ppmpf_1: opts.passThrough?.[0] ?? "",
    ppmpf_2: opts.passThrough?.[1] ?? "",
    ppmpf_3: opts.passThrough?.[2] ?? "",
    ppmpf_4: opts.passThrough?.[3] ?? "",
    ppmpf_5: opts.passThrough?.[4] ?? "",
  };

  fields.pp_SecureHash = computeSecureHash(fields, cfg.integritySalt);
  return { endpoint: cfg.endpoint, fields };
}

/** JazzCash signals a fully successful payment with response code "000". */
export function isJazzCashSuccess(responseCode: string | null | undefined): boolean {
  return responseCode === "000";
}
