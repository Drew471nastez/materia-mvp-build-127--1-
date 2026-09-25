/**
 * ===========================================================================
 *  THE BOLT ON "UPGRADE TO PRO"
 * ===========================================================================
 * The round icon at the right of the Upgrade to Pro card, in the desktop
 * sidebar (sidebar-desktop-nav) and the phone menu (sidebar-mobile-nav),
 * drawn once so the two cannot drift.
 *
 * It was a violet ball lit from above (a radial gradient and a glow), then a
 * pale tint, then a flat violet with almost no depth. "The bolt is white on a
 * purple circle background, how it was before. Basically revert it, but not
 * quite: more depth." So: the white bolt on the app's violet, solid, lit the
 * way the app's primary buttons are (components/ui/depth-button.ts): a line
 * of light along its top, a hairline ring just inside its edge, a darker line
 * at its foot, and a soft shadow under it. Hovering the card takes it a touch
 * deeper. No gradient and no glow.
 *
 * The card it sits in carries `group/upgrade`, a named group, so the hover
 * reaches it without the plain `.group` that app/globals.css strips the
 * transitions from on a touch screen.
 */
export const UPGRADE_FILL = "#8b5cf6"
export const UPGRADE_FILL_HOVER = "#7c4fe6"
export const UPGRADE_INK = "#ffffff"

/** At rest: light on top, a hairline inside the edge, a darker foot, and a soft shadow under it. */
export const UPGRADE_DEPTH =
  "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 0 0 1px rgba(76,29,149,0.16), inset 0 -1px 0 rgba(76,29,149,0.3), 0 1px 2px rgba(76,29,149,0.28), 0 2px 6px -1px rgba(76,29,149,0.2)"

export function UpgradeBolt({ size = 28 }: { size?: number }) {
  const glyph = Math.round(size * 0.5)
  return (
    <span
      aria-hidden="true"
      data-upgrade-bolt=""
      className="flex shrink-0 items-center justify-center rounded-full bg-[#8b5cf6] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_0_0_1px_rgba(76,29,149,0.16),inset_0_-1px_0_rgba(76,29,149,0.3),0_1px_2px_rgba(76,29,149,0.28),0_2px_6px_-1px_rgba(76,29,149,0.2)] transition-[background-color,box-shadow] duration-[140ms] ease-out group-hover/upgrade:bg-[#7c4fe6] group-hover/upgrade:shadow-[inset_0_1px_0_rgba(255,255,255,0.26),inset_0_0_0_1px_rgba(76,29,149,0.2),inset_0_-1px_0_rgba(76,29,149,0.36),0_1px_2px_rgba(76,29,149,0.32),0_3px_8px_-1px_rgba(76,29,149,0.28)] group-active/upgrade:bg-[#7447dc]"
      style={{ width: size, height: size }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill={UPGRADE_INK}>
        <path d="M13.6 1.9 4.7 13.4a.75.75 0 0 0 .6 1.2h5.4l-1.1 7.3c-.1.7.8 1.1 1.3.5l8.9-11.5a.75.75 0 0 0-.6-1.2h-5.4l1.1-7.3c.1-.7-.8-1.1-1.3-.5z" />
      </svg>
    </span>
  )
}
