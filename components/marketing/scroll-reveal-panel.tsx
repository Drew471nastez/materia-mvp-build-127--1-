import type { CSSProperties, ReactNode } from "react"

/*
  ===========================================================================
   A ROUNDED SHEET OVER THE DARK PAGE (landing rounds 3 to 5)
  ===========================================================================
  The page's base is dark. A light or purple stretch of sections is a full
  width surface with rounded corners that laps over the block before it by
  its corner, scrolls with the page like everything else, and leaves by its
  rounded bottom edge.

    <ScrollRevealPanel tone="white">…sections…</ScrollRevealPanel>

  ROUND 5: PLAIN, ON PURPOSE. Round 4 made a sheet rise with a side inset
  (a scroll-driven scale) while the block behind held still (sticky, in a
  box one screen taller) and dimmed under a layer. On a phone that is what
  the owner saw as "glitches with black, shows containers, stutters and
  flashes": the scaled sheet's corners and edges read as cut, the empty
  screen of the hold box showed as a black band whenever the real screen
  was not exactly 100svh (Safari's bars), and every held block was a
  section sized box the compositor redrew under the sheet. So none of that
  is left: no transform, no animation, no sticky, no script. A sheet is an
  ordinary block, it moves with the page's own scroll, and nothing about it
  can be late, clipped or out of step with the scroll.

  THE CORNERS. A sheet's top corners show what is behind them, so a sheet
  pulls itself up over the block before it by its radius (a negative
  margin) and that block leaves the same room at its foot (a padding), so
  nothing of its content sits under the corner. A dark block is its own
  stacking context below the sheet (z-index 0 against 1), so nothing inside
  it, however it is layered, can draw over the sheet's corner. A sheet
  that is followed by another sheet squares its bottom corners (the next
  one's rounded top laps over its colour, not over dark).

  A SECTION ON THE DARK GROUND DRAWS NO ROUNDED BOX OF ITS OWN. The checkout
  scene (.cmc) is a black box with its own large radius; on the dark ground
  its corners showed as a second rounded edge right under the white sheet's,
  the "black band with a rounded corner" in the owner's screenshot. On a
  backdrop it sits flush: the sheets' corners are the only ones.

  A FLAT GROUND. With `arrive="flat"` the sheet does not lap over anything:
  its top is square and it continues straight under the dark block before
  it, whose bottom corners it rounds (two fillets in the sheet's own colour,
  drawn above the dark). The page reads as a dark block sitting on the
  light ground, which is how the first section after the showcase arrives
  (the owner: Make the work must not come up as a drawer).

  A purple sheet sets the band colours the sections inside read
  (--band-ink, --band-muted, --band-line) and is also [data-band="purple"],
  which the sections' recolouring rules key on (landing-story.tsx BAND_CSS).
  On white the sections keep the colours they were designed with.
*/
export type SheetTone = "white" | "purple"

export const SHEET_CSS = `
[data-sheet],[data-sheet-backdrop]{--srp-r:clamp(22px,4.2vw,48px);--srp-pad:clamp(10px,1.8vw,28px)}
[data-sheet]{position:relative;z-index:1;border-radius:var(--srp-r);padding-block:var(--srp-pad)}
[data-sheet="white"]{--srp-bg:#fff;background:#fff;color:#18181b}
[data-sheet="purple"]{--srp-bg:#24104f;--band-ink:#fff;--band-muted:#cdc2f7;--band-line:rgba(255,255,255,.16);background:radial-gradient(70% 45% at 85% 0%,rgba(124,58,237,.42) 0%,rgba(124,58,237,0) 70%),radial-gradient(60% 40% at 0% 100%,rgba(91,33,182,.35) 0%,rgba(91,33,182,0) 70%),#24104f;color:#fff}
[data-sheet-backdrop]{position:relative;z-index:0}
[data-sheet-backdrop] .cmc{border-radius:0}
[data-sheet]:not([data-sheet-flat]){margin-top:calc(var(--srp-r) * -1)}
[data-sheet-backdrop]:has(+[data-sheet]:not([data-sheet-flat])){padding-bottom:var(--srp-r)}
[data-sheet]:has(+[data-sheet]:not([data-sheet-flat])){border-bottom-left-radius:0;border-bottom-right-radius:0;padding-bottom:calc(var(--srp-pad) + var(--srp-r))}
[data-sheet][data-sheet-flat]{border-top-left-radius:0;border-top-right-radius:0}
[data-sheet][data-sheet-flat]::before{content:"";position:absolute;left:0;right:0;top:calc(var(--srp-r) * -1);height:var(--srp-r);pointer-events:none;background:radial-gradient(circle at 100% 0,transparent calc(var(--srp-r) - .5px),var(--srp-bg) var(--srp-r)) left bottom/var(--srp-r) var(--srp-r) no-repeat,radial-gradient(circle at 0 0,transparent calc(var(--srp-r) - .5px),var(--srp-bg) var(--srp-r)) right bottom/var(--srp-r) var(--srp-r) no-repeat}
`

function SheetStyle() {
  return (
    <style href="scroll-reveal-panel" precedence="default">
      {SHEET_CSS}
    </style>
  )
}

export function ScrollRevealPanel({
  tone = "white",
  radius,
  padding,
  arrive = "rise",
  className,
  children,
}: {
  /** The surface: white, or the deep brand purple. */
  tone?: SheetTone
  /** The corner radius, any CSS length. Default: 22px on a phone, about 32px on a tablet, 48px on a computer. */
  radius?: string
  /** Room above and below the sections inside, any CSS length. */
  padding?: string
  /** "rise": lap over the block before by its rounded corners. "flat": a ground the page continues on, under the dark block before it. */
  arrive?: "rise" | "flat"
  className?: string
  children: ReactNode
}) {
  const vars: Record<string, string> = {}
  if (radius) vars["--srp-r"] = radius
  if (padding) vars["--srp-pad"] = padding
  const style = radius || padding ? (vars as CSSProperties) : undefined
  return (
    <>
      <SheetStyle />
      <div data-sheet={tone} data-sheet-flat={arrive === "flat" ? "" : undefined} data-band={tone === "purple" ? "purple" : undefined} className={className} style={style}>
        {children}
      </div>
    </>
  )
}

/** A dark stretch of the page: the ground the sheet after it laps over. */
export function ScrollRevealBackdrop({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <>
      <SheetStyle />
      <div data-sheet-backdrop="" className={className}>
        {children}
      </div>
    </>
  )
}
