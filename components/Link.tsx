import NextLink from "next/link";
import type { ComponentProps } from "react";

// ── App-wide Link wrapper ──────────────────────────────────────────────────────
// Thin pass-through over next/link that flips the DEFAULT for `prefetch` from
// Next's "prefetch in production" to OFF. This makes the live build behave like
// dev, where Link prefetching is disabled — so list pages (projects, directory,
// invoices, tasks) stop eagerly fetching the RSC payload for every linked
// dynamic route as cards enter the viewport, which was firing one DB-backed
// route render per row on production only.
//
// `prefetch` is still a normal prop: pass `prefetch` (or `prefetch={true}`) on an
// individual Link to opt that one back into prefetching. Everything else (href,
// className, onClick, replace, scroll, children, …) forwards through unchanged.

type LinkProps = ComponentProps<typeof NextLink>;

export default function Link({ prefetch = false, ...props }: LinkProps) {
  return <NextLink prefetch={prefetch} {...props} />;
}
