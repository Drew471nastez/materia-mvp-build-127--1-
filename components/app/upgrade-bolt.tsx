/**
 * ===========================================================================
 *  THE BOLT ON "UPGRADE TO PRO"
 * ===========================================================================
 * The round icon at the right of the Upgrade to Pro card, in the desktop
 * sidebar (sidebar-desktop-nav) and the phone menu (sidebar-mobile-nav),
 * drawn once so the two cannot drift. A violet ball lit from above: lighter
 * at the top, deeper at the foot, a highlight along its upper edge and a
 * soft violet shadow under it, with the bolt in white.
 */
export function UpgradeBolt({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(120% 90% at 30% 12%, #b59dfc 0%, #8b5cf6 42%, #6427e6 78%, #5419cf 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 3px rgba(46,16,101,0.35), 0 0 0 1px rgba(91,33,182,0.35), 0 4px 10px -3px rgba(109,40,217,0.55), 0 1px 2px rgba(46,16,101,0.25)",
      }}
    >
      <svg
        width={Math.round(size * 0.52)}
        height={Math.round(size * 0.52)}
        viewBox="0 0 24 24"
        fill="#fff"
        style={{ filter: "drop-shadow(0 1px 1px rgba(46,16,101,0.45))" }}
      >
        <path d="M13.6 1.9 4.7 13.4a.75.75 0 0 0 .6 1.2h5.4l-1.1 7.3c-.1.7.8 1.1 1.3.5l8.9-11.5a.75.75 0 0 0-.6-1.2h-5.4l1.1-7.3c.1-.7-.8-1.1-1.3-.5z" />
      </svg>
    </span>
  )
}
