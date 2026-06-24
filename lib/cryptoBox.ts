import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

// ── Symmetric secret box (AES-256-GCM) ────────────────────────────────────────
// Encrypts small secrets (integration tokens) for at-rest storage in the DB. The
// key is derived from INTEGRATIONS_SECRET (any length) via SHA-256 → 32 bytes.
// Output format: base64( iv[12] || authTag[16] || ciphertext ). GCM gives us
// authenticated encryption, so a tampered or wrong-key value fails to decrypt
// rather than returning garbage.
//
// In production INTEGRATIONS_SECRET MUST be set (we throw if not). In dev we fall
// back to a fixed dev-only key so the feature works out of the box on localhost —
// values encrypted with it are NOT portable to prod, which is fine.

const DEV_FALLBACK = "dev-only-insecure-integrations-secret-do-not-use-in-prod";

function key(): Buffer {
  const raw = process.env.INTEGRATIONS_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "INTEGRATIONS_SECRET is required in production to encrypt integration credentials.",
      );
    }
    return createHash("sha256").update(DEV_FALLBACK).digest();
  }
  return createHash("sha256").update(raw).digest();
}

/** Encrypt a plaintext secret → opaque base64 token. */
export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Decrypt a token produced by seal(). Returns null on any failure (wrong key,
 *  tampering, malformed input) so callers never crash on bad data. */
export function open(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const buf = Buffer.from(token, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
