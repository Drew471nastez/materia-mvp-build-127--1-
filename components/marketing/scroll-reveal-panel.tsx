import type { CSSProperties, ReactNode } from "react"

/*
  ===========================================================================
   A SHEET THAT RISES OVER THE PAGE BEHIND IT (landing rounds 3 and 4)
  ===========================================================================
  The page's base is dark. A light or purple stretch of sections is a full
  width surface with rounded corners that comes up over what is before it as
  the page scrolls, becomes the page, and leaves by its rounded bottom edge.

    <ScrollRevealPanel tone="white">…sections…</ScrollRevealPanel>

  HOW IT RISES (round 4, the owner: "realistically coming up as a sheet",
  like a phone's sheet). While its top edge travels from the bottom of the
  screen to the top, the sheet is a little narrower than the page (a small
  side inset, scaled about its top edge) and settles to full width as it
  takes the screen. The block behind it, held still for that screen (below),
  recedes: it shrinks a little about the middle of the screen and dims into
  the dark page. Both are CSS scroll-driven animations (a view timeline) of
  transform and opacity only, so the compositor runs them off the page's
  thread, they follow the scroll exactly (back up as well as down) and no
  script runs per frame. A browser without view timelines, or a visitor who
  asked for less motion, gets the plain version: the sheet simply laps over
  the block before it.

  A FLAT GROUND. With `arrive="flat"` the sheet does not rise: its top is
  square and it continues straight under the dark block before it, whose
  bottom corners it rounds (two fillets in the sheet's own colour, drawn
  above the dark). The page reads as a dark block sitting on the light
  ground, which is how the first section after the showcase arrives (the
  owner: Make the work must not come up as a drawer).

  HOLDING STILL UNDER THE NEXT ONE. With `hold`, the block stays where it is
  for the last screen of scroll while whatever follows it slides up over it.
  That is position: sticky and nothing else: the block sits at the bottom of
  a box that is one screen taller than it (an empty ::before, not padding: a
  sticky block may only move inside its parent's content box), and
  `bottom: 0` keeps its last screen in view until the box has gone by; the
  next block starts one screen higher, so the page is no longer than before.
  <ScrollRevealBackdrop> does the same for a dark stretch of the page that is
  not a sheet (the checkout scene). A held block must be taller than the
  screen; on a very tall window, and for a visitor who asked for less motion,
  nothing is held and the next sheet only laps over the end of this one by
  its corner.

  The box's own view timeline (--srp-box) times both halves: a held sheet
  rises while the box enters (its top is the sheet's top then), and the
  block recedes during the box's last screen, which is exactly while the
  next sheet comes up over it.

  A purple sheet sets the band colours the sections inside read
  (--band-ink, --band-muted, --band-line) and is also [data-band="purple"],
  which the sections' recolouring rules key on (landing-story.tsx BAND_CSS).
  On white the sections keep the colours they were designed with.
*/
export type SheetTone = "white" | "purple"

export const SHEET_CSS = `
[data-sheet],[data-sheet-hold]{--srp-r:clamp(22px,4.2vw,48px);--srp-pad:clamp(10px,1.8vw,28px);--srp-cover:100vh;--srp-rise:.955;--srp-back:.95;--srp-dim:.62}
@supports (height:1svh){[data-sheet],[data-sheet-hold]{--srp-cover:100svh}}
[data-sheet]{position:relative;z-index:1;border-radius:var(--srp-r);padding-block:var(--srp-pad)}
[data-sheet="white"]{--srp-bg:#fff;background:#fff;color:#18181b}
[data-sheet="purple"]{--srp-bg:#24104f;--band-ink:#fff;--band-muted:#cdc2f7;--band-line:rgba(255,255,255,.16);background:radial-gradient(70% 45% at 85% 0%,rgba(124,58,237,.42) 0%,rgba(124,58,237,0) 70%),radial-gradient(60% 40% at 0% 100%,rgba(91,33,182,.35) 0%,rgba(91,33,182,0) 70%),#24104f;color:#fff}
[data-sheet][data-sheet-flat]{border-top-left-radius:0;border-top-right-radius:0}
[data-sheet][data-sheet-flat]::before{content:"";position:absolute;left:0;right:0;top:calc(var(--srp-r) * -1);height:var(--srp-r);pointer-events:none;background:radial-gradient(circle at 100% 0,transparent calc(var(--srp-r) - .5px),var(--srp-bg) var(--srp-r)) left bottom/var(--srp-r) var(--srp-r) no-repeat,radial-gradient(circle at 0 0,transparent calc(var(--srp-r) - .5px),var(--srp-bg) var(--srp-r)) right bottom/var(--srp-r) var(--srp-r) no-repeat}
[data-sheet-hold]{position:relative}
[data-sheet-hold]>[data-sheet]{border-bottom-left-radius:0;border-bottom-right-radius:0;padding-bottom:calc(var(--srp-pad) + var(--srp-r))}
[data-sheet-hold]>[data-sheet-backdrop]{padding-bottom:var(--srp-r)}
[data-sheet-hold]+[data-sheet],[data-sheet-hold]+[data-sheet-hold]{margin-top:calc(var(--srp-r) * -1)}
[data-sheet]+[data-sheet]{margin-top:calc(var(--srp-r) * -1)}
[data-sheet]:has(+[data-sheet]){border-bottom-left-radius:0;border-bottom-right-radius:0;padding-bottom:calc(var(--srp-pad) + var(--srp-r))}
@media (max-height:1400px) and (prefers-reduced-motion:no-preference){
  [data-sheet-hold]{margin-top:calc(var(--srp-lift,0px) * -1)}
  [data-sheet-hold]::before{content:"";display:block;height:var(--srp-cover)}
  [data-sheet-hold]>*{position:sticky;bottom:0}
  [data-sheet-hold]+[data-sheet],[data-sheet-hold]+[data-sheet-hold]{margin-top:calc(var(--srp-cover) * -1)}
}
@media (max-width:767px){
  [data-sheet-hold="wide"]{margin-top:0}
  [data-sheet-hold="wide"]::before{content:none}
  [data-sheet-hold="wide"]>*{position:relative;bottom:auto}
  [data-sheet-hold="wide"]+[data-sheet],[data-sheet-hold="wide"]+[data-sheet-hold]{margin-top:calc(var(--srp-r) * -1)}
}
@keyframes srp-rise{from{transform:scale(var(--srp-rise))}to{transform:none}}
@keyframes srp-recede{from{transform:none;opacity:1}to{transform:translateY(calc((1 - var(--srp-back)) * (100% - var(--srp-cover) / 2))) scale(var(--srp-back));opacity:var(--srp-dim)}}
@supports (animation-timeline:view()){
  @media (prefers-reduced-motion:no-preference){
    [data-sheet]:not([data-sheet-flat]){transform-origin:50% 0;animation:srp-rise linear both;animation-timeline:view();animation-range:entry 0% entry 100%}
    [data-sheet-hold]{view-timeline:--srp-box block}
    [data-sheet-hold]>[data-sheet]:not([data-sheet-flat]){animation-timeline:--srp-box}
  }
  @media (max-height:1400px) and (prefers-reduced-motion:no-preference){
    [data-sheet-hold]>[data-sheet-backdrop]{transform-origin:50% 0;animation:srp-recede linear forwards;animation-timeline:--srp-box;animation-range:contain calc(100% - var(--srp-cover)) contain 100%}
    [data-sheet-hold]>[data-sheet]:not([data-sheet-flat]){animation:srp-rise linear both,srp-recede linear forwards;animation-timeline:--srp-box,--srp-box;animation-range:entry 0% entry 100%,contain calc(100% - var(--srp-cover)) contain 100%}
  }
  @media (max-width:767px){
    [data-sheet-hold="wide"]>*{animation:none}
  }
}
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
  hold = false,
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
  /** Stay put for the last screen while the next block slides over this one (and recede under it). */
  hold?: boolean
  /** "rise": come up over the block before as a sheet. "flat": a ground the page continues on, under the dark block before it. */
  arrive?: "rise" | "flat"
  className?: string
  children: ReactNode
}) {
  const vars: Record<string, string> = {}
  if (radius) vars["--srp-r"] = radius
  if (padding) vars["--srp-pad"] = padding
  const style = radius || padding ? (vars as CSSProperties) : undefined
  const sheet = (
    <div data-sheet={tone} data-sheet-flat={arrive === "flat" ? "" : undefined} data-band={tone === "purple" ? "purple" : undefined} className={className} style={style}>
      {children}
    </div>
  )
  return (
    <>
      <SheetStyle />
      {hold ? (
        <div data-sheet-hold="" style={radius ? ({ "--srp-r": radius } as CSSProperties) : undefined}>
          {sheet}
        </div>
      ) : (
        sheet
      )}
    </>
  )
}

/** A dark stretch of the page: held still for its last screen while the sheet after it rises over it, or (hold={false}) plain. */
export function ScrollRevealBackdrop({
  lift,
  hold = true,
  holdOnPhone = true,
  className,
  children,
}: {
  /** false: the block is not held at all; the page simply continues after it. */
  hold?: boolean
  /**
   * false: below 768px the block is not held and the sheet only laps over its end. For a block that ends in something
   * a thumb drags (a held block cannot be scrolled up the screen: the sheet would cover it instead).
   */
  holdOnPhone?: boolean
  /**
   * How far the first thing inside pulls itself up with a negative margin (the home hero slides under the header by the
   * header's height). A held block cannot leave its box, so the box is raised by the same length instead.
   */
  lift?: string
  className?: string
  children: ReactNode
}) {
  if (!hold)
    return (
      <div data-sheet-backdrop="" className={className}>
        {children}
      </div>
    )
  return (
    <>
      <SheetStyle />
      <div data-sheet-hold={holdOnPhone ? "" : "wide"} style={lift ? ({ "--srp-lift": lift } as CSSProperties) : undefined}>
        <div data-sheet-backdrop="" className={className}>
          {children}
        </div>
      </div>
    </>
  )
}
