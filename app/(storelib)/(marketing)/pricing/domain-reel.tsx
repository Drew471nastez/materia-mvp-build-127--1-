/*
  CONNECT YOUR OWN DOMAIN (landing round 13, the owner's picture 7): one
  creator's name with different endings, a column of addresses moving up a
  row at a time, the middle one in a white pill with a globe and a pointer,
  its ending in Storelib violet.

  Every address is one Storelib connects: an apex is served at www (lib/
  custom-domains/hostname.ts, servingHost), and every ending here passes
  hostnameProblem (tests/home-landing-r13-pricing.test.ts holds that).

  MOTION. The column and the pill's own line are two copies of the same list
  of addresses, each twice over, moved by one keyframe animation on the same
  clock: a hold, then one row up, seven times, and the last row is the first
  again, so it loops without a jump. Moves are translate3d by a share of the
  list's own height, so nothing is measured and only the compositor works.
  The pointer presses once at every step, on the same clock. Every loop is an
  .ev-loop, paused off screen like the rest of the bento, and still under
  reduced motion (it then shows www.mayalane.com).

  LANDING ROUND 14, THE OWNER: a cleaner name than round 13's, a short brand
  that reads as one creator's ("mayalane"), and smoother motion: each move
  takes longer (40% of a step, was 26%) on a softer curve that eases out
  slowly, and the pointer's press is lighter, so the reel glides rather than
  jumps.

  LANDING ROUND 16, THE OWNER: much smoother and cleaner, as smooth as a
  120Hz screen allows. What made it step: every row was a 1.8s hold and
  then a 1.2s move that set off with a jolt (the curve's first handle had a
  slope, so it started at speed), the rows were a fractional number of
  pixels tall (--R from cqh), so every resting place sat between two pixels
  and the text rested a little soft, and the pointer pressed at every step
  (a scale over a drop shadow). Now:
    - no holds: one move per row that takes the whole step, on an ease in
      and out that starts and ends at rest (cubic-bezier(.7,0,.3,1)), so the
      list is always gliding, slows to read each address, and never jolts;
    - a row is a whole number of pixels (round(), where the browser has it),
      and the column and the pill are placed on whole pixels, so each
      address rests sharp;
    - the two lists are their own layers (will-change), moved by transform
      only, and nothing else in the tile moves: the pointer rests;
    - in the pill, an address passing through fades at the window's edges
      (a still mask) rather than being cut by them;
    - paused off screen (its host pauses .ev-loop) and still under reduced
      motion, as before.

  IT CAN BE USED ANYWHERE (the home page's "Use your own domain" card imports
  it from this path). It brings its own stylesheet, and by default it fills
  the box it is put in (width and height 100%, at least 220px tall); every
  size inside is a share of that box (container units), so it fits any
  card. Inside the home section's .ev-vis it takes that tile's height.
*/
import type { CSSProperties } from "react"

export const DOMAIN_NAME = "mayalane"
/** Endings Storelib accepts for a custom domain. The pill starts on the third, ".com". */
export const DOMAIN_ENDINGS = ["shop", "store", "com", "studio", "art", "co.uk", "net"] as const

const N = DOMAIN_ENDINGS.length
const ROWS = [...DOMAIN_ENDINGS, ...DOMAIN_ENDINGS]
/** One row's glide (landing round 16: the whole step is the move, no hold). */
export const DOMAIN_STEP_S = 2.6
/** Starts at rest, glides, and comes to rest again: zero speed at each row, so one glide runs into the next without a jolt. */
export const DOMAIN_EASE = "cubic-bezier(.7,0,.3,1)"

function reelKeyframes(): string {
  const frames: string[] = []
  for (let k = 0; k < N; k++) {
    const at = (k / N) * 100
    const y = -((k / ROWS.length) * 100)
    frames.push(`${at.toFixed(3)}%{transform:translate3d(0,${y.toFixed(4)}%,0)}`)
  }
  frames.push(`100%{transform:translate3d(0,-50%,0)}`)
  return `@keyframes pz-reel{${frames.join("")}}`
}
function Address({ ending, strong }: { ending: string; strong?: boolean }) {
  return (
    <span className="pz-d-row">
      <span className="pz-d-addr">
        www.{DOMAIN_NAME}.<b className={strong ? "pz-d-end pz-d-end-on" : "pz-d-end"}>{ending}</b>
      </span>
    </span>
  )
}

/** The reel. `className` replaces the box's classes ("ev-vis" by default, the home section's tile). */
export function DomainReel({ className = "ev-vis" }: { className?: string } = {}) {
  return (
    <div className={`${className} pz-d`} aria-hidden="true">
      <style href="pz-domain" precedence="w13-home">
        {DOMAIN_CSS}
      </style>
      <div className="pz-d-col">
        <div className="pz-d-track ev-loop">
          {ROWS.map((e, i) => (
            <Address key={i} ending={e} />
          ))}
        </div>
      </div>
      <div className="pz-d-pill">
        <svg className="pz-d-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9.2" />
          <path d="M2.8 12h18.4M12 2.8c2.6 2.6 3.9 5.6 3.9 9.2s-1.3 6.6-3.9 9.2M12 2.8C9.4 5.4 8.1 8.4 8.1 12s1.3 6.6 3.9 9.2" />
        </svg>
        <span className="pz-d-window">
          <span className="pz-d-track pz-d-track-pill ev-loop" style={{ "--rows": ROWS.length } as CSSProperties}>
            {ROWS.map((e, i) => (
              <Address key={i} ending={e} strong />
            ))}
          </span>
        </span>
        <svg className="pz-d-cursor" viewBox="0 0 28 30">
          <path d="M4.5 3.2 23.6 13.4c1 .5.9 2-.2 2.3l-7.6 2.1-3.7 7.4c-.5 1-2 .9-2.3-.2L3 4.7c-.3-1 .7-1.9 1.5-1.5Z" fill="#18181b" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

/*
  The tile: a soft lavender ground, the column of addresses fading out above
  and below (a still mask on the column, the moving list inside it), and the
  pill on the middle row. --R is one row, from the tile's own size, and a
  whole number of pixels where round() is known; the column's top and the
  pill's padding are whole pixels too, so a row at rest is on the pixel grid.
  The box's own defaults are in :where(), so any tile class (the home
  .ev-vis) sizes it.
*/
export const DOMAIN_CSS = `
:where(.pz-d){position:relative;overflow:hidden;width:100%;height:100%;min-height:220px;border-radius:inherit}
.pz-d{--R:clamp(34px,min(14.5cqh,12cqw),66px);--pp:calc(var(--R) * .11);--top:calc(50% - var(--R) * 2.5);container-type:size;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;background:radial-gradient(70% 60% at 50% 50%,#f6f2ff 0%,rgba(246,242,255,0) 100%),linear-gradient(165deg,#ece6ff 0%,#e2d9ff 100%)}
@supports (width:round(1.5px,1px)){.pz-d{--R:round(down,clamp(34px,min(14.5cqh,12cqw),66px),2px);--pp:round(calc(var(--R) * .11),1px);--top:round(down,calc(50% - var(--R) * 2.5),1px)}}
.pz-d-col{position:absolute;left:0;right:0;top:var(--top);height:calc(var(--R) * 5);overflow:hidden;-webkit-mask-image:linear-gradient(transparent 0%,#000 34%,#000 66%,transparent 100%);mask-image:linear-gradient(transparent 0%,#000 34%,#000 66%,transparent 100%)}
.pz-d-track{display:flex;flex-direction:column;will-change:transform;backface-visibility:hidden;transform:translate3d(0,0,0);animation:pz-reel ${(N * DOMAIN_STEP_S).toFixed(1)}s ${DOMAIN_EASE} infinite}
.pz-d-row{display:flex;flex:none;height:var(--R);align-items:center;justify-content:center}
.pz-d-addr{font-size:calc(var(--R) * .4);font-weight:500;letter-spacing:-.015em;white-space:nowrap;color:rgba(62,40,120,.42)}
.pz-d-end{font-weight:650;color:rgba(62,40,120,.62)}
/* The pill: on the column's middle row (two rows down), --pp above and below it, centred across. */
.pz-d-pill{position:absolute;left:0;right:0;top:calc(var(--top) + var(--R) * 2 - var(--pp));display:flex;align-items:center;gap:calc(var(--R) * .22);width:max-content;height:calc(var(--R) + var(--pp) * 2);margin-inline:auto;padding:0 calc(var(--R) * .5) 0 calc(var(--R) * .34);border-radius:999px;background:#fff;box-shadow:0 1px 2px rgba(40,20,90,.08),0 18px 40px -18px rgba(60,30,140,.45)}
.pz-d-globe{flex:none;width:calc(var(--R) * .5);height:calc(var(--R) * .5);color:#7c3aed}
/* The pill's window, the pill's full height: an address passing through fades out well inside the pill's edges instead of being cut (a still mask; the list moves under it). */
.pz-d-window{display:block;height:calc(var(--R) + var(--pp) * 2);overflow:hidden;-webkit-mask-image:linear-gradient(transparent 0%,#000 26%,#000 74%,transparent 100%);mask-image:linear-gradient(transparent 0%,#000 26%,#000 74%,transparent 100%)}
.pz-d-track-pill .pz-d-row{justify-content:flex-start}
.pz-d-track-pill .pz-d-addr{font-size:calc(var(--R) * .43);color:#18181b}
.pz-d-end-on{font-weight:650;color:#7c3aed}
/* The pill's list starts two rows up, less the pill's padding, so its middle row is the column's. */
.pz-d-track-pill{margin-top:calc(var(--R) * -2 + var(--pp))}
/* The pointer rests on the pill (landing round 16: it no longer presses at every row). */
.pz-d-cursor{position:absolute;right:calc(var(--R) * -.42);bottom:calc(var(--R) * -.5);width:calc(var(--R) * .56);height:auto;filter:drop-shadow(0 4px 6px rgba(20,10,50,.25))}
${reelKeyframes()}
@media (prefers-reduced-motion:reduce){.pz-d-track{animation:none;will-change:auto;transform:none}}
`
