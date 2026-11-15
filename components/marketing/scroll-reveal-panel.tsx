import type { CSSProperties, ReactNode } from "react"

/*
  ===========================================================================
   ROUNDED SHEETS DOWN THE PAGE (landing rounds 3 to 8)
  ===========================================================================
  The page is a stack of grounds: dark stretches (<ScrollRevealBackdrop>)
  and white or purple sheets (<ScrollRevealPanel>), one after the other.

    <ScrollRevealPanel tone="white">…sections…</ScrollRevealPanel>

  ROUND 8, THE OWNER: "the roundness should come as the section under, not
  the section above". So every join is drawn the same way, whatever the two
  grounds are:

    the upper block    square at its foot, and it runs on for one radius
                       more than its content (a padding), so its own colour
                       is what sits behind the corners of the block below;
    the lower block    pulled up over that room by its radius (a negative
                       margin), its top corners rounded, and it clips what
                       is inside it to that rounded shape (overflow: clip,
                       which is not a scroll box, so the checkout's sticky
                       scene and the page's one scrollbar are untouched).
                       A section's own square background inside can then
                       never draw over the corner: that was the clipped
                       strip in the owner's corner screenshot.

  Every block is position: relative with isolation, and none sets a
  z-index, so they paint in the page's order: the lower block is always over
  the upper one, and nothing inside either, however it is layered, can climb
  out over its neighbour. Nothing is drawn behind a corner except the upper
  block's own pixels: no third colour, no fillet to match, no hairline.

  THE PURPLE SHEET RISES (round 8, the owner: "it needs to come up as a
  sheet like we had it before"). With `arrive="rise"` the sheet starts a
  little lower than where it lies and comes up over the block above faster
  than the page scrolls, settling by the time its top is about a third of
  the way down the screen. It is a CSS scroll-driven animation of transform
  alone, on the compositor, with no script and nothing held: the page never
  stops, and the block above is not sticky. The block above runs on by the
  rise as well as the radius, so behind the sheet's corners there is only
  its own colour all the way up. Browsers without scroll-driven animations
  and visitors who ask for less motion get the plain lap.

  A purple sheet sets the band colours the sections inside read
  (--band-ink, --band-muted, --band-line) and is also [data-band="purple"],
  which the sections' recolouring rules key on (landing-story.tsx BAND_CSS).
  On white the sections keep the colours they were designed with.
*/
export type SheetTone = "white" | "purple"

const BLOCK = ":is([data-sheet],[data-sheet-backdrop])"

export const SHEET_CSS = `
${BLOCK}{--srp-r:clamp(22px,4.2vw,48px);--srp-pad:clamp(10px,1.8vw,28px);--srp-rise:0px;--srp-next-rise:0px;position:relative;isolation:isolate}
[data-sheet]{padding-block:var(--srp-pad)}
[data-sheet="white"]{--srp-bg:#fff;background:#fff;color:#18181b}
[data-sheet="purple"]{--srp-bg:#24104f;--band-ink:#fff;--band-muted:#cdc2f7;--band-line:rgba(255,255,255,.16);background:radial-gradient(70% 45% at 85% 0%,rgba(124,58,237,.42) 0%,rgba(124,58,237,0) 70%),radial-gradient(60% 40% at 0% 100%,rgba(91,33,182,.35) 0%,rgba(91,33,182,0) 70%),#24104f;color:#fff}
[data-sheet-backdrop]{--srp-bg:#050506;background:#050506}
[data-sheet-backdrop] .cmc{border-radius:0}
[data-sheet-backdrop]:has(.cmc){--srp-bg:#000;background:#000}
${BLOCK}+${BLOCK}{margin-top:calc((var(--srp-r) + var(--srp-rise)) * -1);border-top-left-radius:var(--srp-r);border-top-right-radius:var(--srp-r);overflow:clip}
[data-sheet]:has(+${BLOCK}){padding-bottom:calc(var(--srp-pad) + var(--srp-r) + var(--srp-next-rise))}
[data-sheet-backdrop]:has(+${BLOCK}){padding-bottom:calc(var(--srp-r) + var(--srp-next-rise))}
@supports (animation-timeline:view()) {
  @media (prefers-reduced-motion:no-preference) {
    ${BLOCK}:has(+[data-sheet-rise]){--srp-next-rise:clamp(96px,14svh,160px)}
    [data-sheet-rise]{--srp-rise:clamp(96px,14svh,160px);animation:srp-rise linear both;animation-timeline:view();animation-range:cover var(--srp-rise) cover calc(var(--srp-rise) + 50svh)}
  }
}
@keyframes srp-rise{from{transform:translate3d(0,var(--srp-rise),0)}to{transform:translate3d(0,0,0)}}
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
  arrive = "lap",
  className,
  children,
}: {
  /** The surface: white, or the deep brand purple. */
  tone?: SheetTone
  /** The corner radius, any CSS length. Default: 22px on a phone, about 32px on a tablet, 48px on a computer. */
  radius?: string
  /** Room above and below the sections inside, any CSS length. */
  padding?: string
  /** "lap": lie over the block before by its rounded top. "rise": the same, and come up over it as the page scrolls. */
  arrive?: "lap" | "rise"
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
      <div data-sheet={tone} data-sheet-rise={arrive === "rise" ? "" : undefined} data-band={tone === "purple" ? "purple" : undefined} className={className} style={style}>
        {children}
      </div>
    </>
  )
}

/** A dark stretch of the page. It laps over the block before it like a sheet does, and the block after laps over it. */
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
