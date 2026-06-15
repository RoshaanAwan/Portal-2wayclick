/**
 * Quiet dark backdrop. Near-black canvas with a barely-there warm accent wash
 * in the top corners — depth without noise. Content stays the focus.
 */
export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-paper">
      {/* Soft warm wash, top corners only */}
      <div className="absolute inset-0 bg-paper-wash" />
      {/* Faint texture grid, fading toward the bottom */}
      <div className="absolute inset-0 bg-grid [mask-image:linear-gradient(to_bottom,black,transparent_75%)] opacity-50" />
    </div>
  );
}
