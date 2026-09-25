/**
 * ===========================================================================
 *  THE BOLT ON "UPGRADE TO PRO"
 * ===========================================================================
 * The round icon at the right of the Upgrade to Pro card, in the desktop
 * sidebar (sidebar-desktop-nav) and the phone menu (sidebar-mobile-nav),
 * drawn once so the two cannot drift.
 *
 * "That purple thing has too much depth and draws too much attention. More
 * subtle, keep it how it is, but it's too gradient, too depthish." It was a
 * violet ball lit from above: a radial gradient, a highlight, an inner
 * shadow, a violet glow under it and a white bolt with its own shadow, the
 * loudest thing in the rail. Now it is a flat circle of soft violet tint with
 * a hairline of the same violet, and the bolt in violet on it. No gradient,
 * no shadow, nothing lit: the violet says Pro, and the card around it is the
 * same quiet surface as the rest of the sidebar.
 */
export const UPGRADE_TINT = "#f3f0ff"
export const UPGRADE_INK = "#7c3aed"

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
        backgroundColor: UPGRADE_TINT,
        boxShadow: "inset 0 0 0 1px rgba(124,58,237,0.14)",
      }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill={UPGRADE_INK}>
        <path d="M13.6 1.9 4.7 13.4a.75.75 0 0 0 .6 1.2h5.4l-1.1 7.3c-.1.7.8 1.1 1.3.5l8.9-11.5a.75.75 0 0 0-.6-1.2h-5.4l1.1-7.3c.1-.7-.8-1.1-1.3-.5z" />
      </svg>
    </span>
  )
}
