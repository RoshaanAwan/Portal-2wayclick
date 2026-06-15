/**
 * Flat, minimal backdrop — a single solid canvas tone. No washes or texture so
 * the content carries the page.
 */
export function AnimatedBackground() {
  return <div className="fixed inset-0 -z-10 bg-paper" />;
}
