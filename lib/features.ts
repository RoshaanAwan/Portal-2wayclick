// ── Feature flags ───────────────────────────────────────────────────────────
// Central, build-time-safe feature switches. Use these to keep a feature's code
// present and type-checked in the tree while it's turned OFF in the UI, instead
// of commenting code out (which rots and breaks on refactors).
//
// Flags are plain booleans so they're tree-shakeable and usable on both server
// and client. Where an env override is useful, read NEXT_PUBLIC_* so the value
// is inlined into the client bundle at build time too.

/**
 * Chat / messaging (/messages, the conversation list, the topbar/sidebar wiring).
 *
 * Currently OFF: the feature is fully built and the DB tables exist, but it's
 * hidden from the UI (no nav entry, the MessagingProvider isn't mounted, so its
 * polling loop never runs). The /messages route and the /api/messages +
 * /api/conversations endpoints still exist but are unreachable from the app.
 *
 * To RE-ENABLE: set this to `true` (or set NEXT_PUBLIC_CHAT_ENABLED="true"). No
 * other change is needed — the nav item reappears and the provider mounts.
 */
export const CHAT_ENABLED =
  process.env.NEXT_PUBLIC_CHAT_ENABLED === "true" ? true : false;
