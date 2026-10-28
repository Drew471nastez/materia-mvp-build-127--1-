/**
 * ===========================================================================
 *  THE BOLT ON "UPGRADE TO PRO"
 * ===========================================================================
 * The round icon at the right of the Upgrade to Pro card, in the desktop
 * sidebar (sidebar-desktop-nav) and the phone menu (sidebar-mobile-nav),
 * drawn once so the two cannot drift.
 *
 * It was a violet ball lit from above (a radial gradient and a glow), then a
 * pale tint, then a flat violet with almost no depth, then solid with the
 * primary buttons' light and shade. "More depth, and a gradient, a little
 * bit, not so much." So: the white bolt on the app's violet, a touch lighter
 * at the top and deeper at the foot (a linear gradient over 18% of the
 * colour, no glow), a line of light along its top, a hairline ring just
 * inside its edge, a darker foot and a soft two-step shadow under it.
 * Hovering the card takes it a touch deeper.
 *
 * The card it sits in carries `group/upgrade`, a named group, so the hover
 * reaches it without the plain `.group` that app/globals.css strips the
 * transitions from on a touch screen.
 */
export const UPGRADE_FILL = "#8b5cf6"
export const UPGRADE_FILL_HOVER = "#7c4fe6"
export const UPGRADE_INK = "#ffffff"

/** The bolt itself, on a 24 unit grid: rounded joints, so it stays smooth at 12px. Shared with the Pro mark in Publish (publish-domain.tsx). */
export const BOLT_PATH = "M13.6 1.9 4.7 13.4a.75.75 0 0 0 .6 1.2h5.4l-1.1 7.3c-.1.7.8 1.1 1.3.5l8.9-11.5a.75.75 0 0 0-.6-1.2h-5.4l1.1-7.3c.1-.7-.8-1.1-1.3-.5z"

/** At rest: light on top, a hairline inside the edge, a darker foot, and a soft shadow under it. */
export const UPGRADE_DEPTH =
  "inset 0 1px 0 rgba(255,255,255,0.38), inset 0 0 0 1px rgba(76,29,149,0.18), inset 0 -1.5px 0 rgba(76,29,149,0.34), 0 1px 2px rgba(76,29,149,0.3), 0 4px 10px -3px rgba(76,29,149,0.34)"

export function UpgradeBolt({ size = 28 }: { size?: number }) {
  const glyph = Math.round(size * 0.5)
  return (
    <span
      aria-hidden="true"
      data-upgrade-bolt=""
      className="flex shrink-0 items-center justify-center rounded-full bg-[#8b5cf6] bg-[linear-gradient(180deg,#9d74fa_0%,#8b5cf6_52%,#7a48ea_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.38),inset_0_0_0_1px_rgba(76,29,149,0.18),inset_0_-1.5px_0_rgba(76,29,149,0.34),0_1px_2px_rgba(76,29,149,0.3),0_4px_10px_-3px_rgba(76,29,149,0.34)] transition-[background-color,box-shadow,filter] duration-[140ms] ease-out group-hover/upgrade:brightness-[0.94] group-hover/upgrade:shadow-[inset_0_1px_0_rgba(255,255,255,0.34),inset_0_0_0_1px_rgba(76,29,149,0.22),inset_0_-1.5px_0_rgba(76,29,149,0.4),0_1px_2px_rgba(76,29,149,0.34),0_5px_12px_-3px_rgba(76,29,149,0.4)] group-active/upgrade:brightness-[0.9]"
      style={{ width: size, height: size }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill={UPGRADE_INK} style={{ filter: "drop-shadow(0 0.5px 0.5px rgba(46,16,101,0.35))" }}>
        <path d={BOLT_PATH} />
      </svg>
    </span>
  )
}
