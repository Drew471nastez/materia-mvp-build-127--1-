/**
 * ===========================================================================
 *  THE BOLT ON "UPGRADE TO PRO"
 * ===========================================================================
 * The round icon at the right of the Upgrade to Pro card, in the desktop
 * sidebar (sidebar-desktop-nav) and the phone menu (sidebar-mobile-nav),
 * drawn once so the two cannot drift.
 *
 * It was a violet ball lit from above (a radial gradient, a highlight, an
 * inner shadow and a violet glow), the loudest thing in the rail; then a pale
 * tint that no longer read as the purple button it is. "Keep the button
 * purple, just less depth and gradient." So: one flat violet, the bolt in
 * white, a hairline of light along the top edge and a small soft shadow
 * under it. No gradient, no glow.
 */
export const UPGRADE_FILL = "#8b5cf6"
export const UPGRADE_INK = "#ffffff"

export function UpgradeBolt({ size = 28 }: { size?: number }) {
  const glyph = Math.round(size * 0.5)
  return (
    <span
      aria-hidden="true"
      data-upgrade-bolt=""
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: UPGRADE_FILL,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(76,29,149,0.22)",
      }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill={UPGRADE_INK}>
        <path d="M13.6 1.9 4.7 13.4a.75.75 0 0 0 .6 1.2h5.4l-1.1 7.3c-.1.7.8 1.1 1.3.5l8.9-11.5a.75.75 0 0 0-.6-1.2h-5.4l1.1-7.3c.1-.7-.8-1.1-1.3-.5z" />
      </svg>
    </span>
  )
}
