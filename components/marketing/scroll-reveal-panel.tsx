import type { CSSProperties, ReactNode } from "react"

/*
  ===========================================================================
   A SHEET THAT RISES OVER THE DARK PAGE (landing round 3, the owner)
  ===========================================================================
  The page's base is dark. A light or purple section is a full width surface
  with rounded top and bottom corners that comes up over the dark as the
  page scrolls, becomes the page, and leaves by its rounded bottom edge.

  It is not a modal and nothing here is animated: the sheet is an ordinary
  block of the document, so its edge moves exactly as far as the page is
  scrolled, stops when the scroll stops and goes back when it goes back.
  No script, no scroll listener, no fade, no scale, one scrollbar.

    <ScrollRevealPanel tone="white">…sections…</ScrollRevealPanel>

  HOLDING STILL UNDER THE NEXT ONE. With `hold`, the block stays where it is
  for the last screen of scroll while whatever follows it slides up over it,
  the way a sheet covers the page behind it. That is position: sticky and
  nothing else: the block sits at the bottom of a box that is one screen
  taller than it (an empty ::before, not padding: a sticky block may only
  move inside its parent's content box), and `bottom: 0` keeps its last
  screen in view until the box has gone by; the next block starts one screen higher, so the page is
  no longer than before. <ScrollRevealBackdrop> does the same for a dark
  stretch of the page that is not a sheet (the hero with the showcase, the
  checkout scene). A held block must be taller than the screen (the gap it
  leaves is above the screen); on a very tall window, and for a visitor who
  asked for less motion, nothing is held and the next sheet only laps over
  the end of this one by its corner.

  A purple sheet sets the band colours the sections inside read
  (--band-ink, --band-muted, --band-line) and is also [data-band="purple"],
  which the sections' recolouring rules key on (landing-story.tsx BAND_CSS).
  On white the sections keep the colours they were designed with.
*/
export type SheetTone = "white" | "purple"

export const SHEET_CSS = `
[data-sheet],[data-sheet-hold]{--srp-r:clamp(22px,4.2vw,48px);--srp-pad:clamp(10px,1.8vw,28px);--srp-cover:100vh}
@supports (height:1svh){[data-sheet],[data-sheet-hold]{--srp-cover:100svh}}
[data-sheet]{position:relative;z-index:1;border-radius:var(--srp-r);padding-block:var(--srp-pad)}
[data-sheet="white"]{background:#fff;color:#18181b}
[data-sheet="purple"]{--band-ink:#fff;--band-muted:#cdc2f7;--band-line:rgba(255,255,255,.16);background:radial-gradient(70% 45% at 85% 0%,rgba(124,58,237,.42) 0%,rgba(124,58,237,0) 70%),radial-gradient(60% 40% at 0% 100%,rgba(91,33,182,.35) 0%,rgba(91,33,182,0) 70%),#24104f;color:#fff}
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
  className,
  children,
}: {
  /** The surface: white, or the deep brand purple. */
  tone?: SheetTone
  /** The corner radius, any CSS length. Default: 22px on a phone, about 32px on a tablet, 48px on a computer. */
  radius?: string
  /** Room above and below the sections inside, any CSS length. */
  padding?: string
  /** Stay put for the last screen while the next block slides over this one. */
  hold?: boolean
  className?: string
  children: ReactNode
}) {
  const vars: Record<string, string> = {}
  if (radius) vars["--srp-r"] = radius
  if (padding) vars["--srp-pad"] = padding
  const style = radius || padding ? (vars as CSSProperties) : undefined
  const sheet = (
    <div data-sheet={tone} data-band={tone === "purple" ? "purple" : undefined} className={className} style={style}>
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

/** A dark stretch of the page that holds still for its last screen while the sheet after it rises over it. */
export function ScrollRevealBackdrop({
  lift,
  holdOnPhone = true,
  className,
  children,
}: {
  /**
   * false: below 768px the block is not held and the sheet only laps over its end. For a block that ends in something
   * a thumb drags (the showcase under the hero is shorter than a phone's screen, and a held block cannot be scrolled
   * up the screen: the sheet would cover the carousel instead).
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
