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
  .ev-loop, paused off screen and under a covering sheet like the rest of the
  bento, and still under reduced motion (it then shows www.junokada.com).
*/
import type { CSSProperties } from "react"

export const DOMAIN_NAME = "junokada"
/** Endings Storelib accepts for a custom domain. The pill starts on the third, ".com". */
export const DOMAIN_ENDINGS = ["shop", "store", "com", "studio", "art", "co.uk", "net"] as const

const N = DOMAIN_ENDINGS.length
const ROWS = [...DOMAIN_ENDINGS, ...DOMAIN_ENDINGS]
/** One step: a hold, then the move. */
const STEP_S = 2.6
const MOVE_SHARE = 0.26
const EASE = "cubic-bezier(.65,0,.35,1)"

function reelKeyframes(): string {
  const frames: string[] = []
  for (let k = 0; k < N; k++) {
    const at = (k / N) * 100
    const hold = ((k + 1 - MOVE_SHARE) / N) * 100
    const y = -((k / ROWS.length) * 100)
    frames.push(`${at.toFixed(3)}%,${hold.toFixed(3)}%{transform:translate3d(0,${y.toFixed(4)}%,0)}`)
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

export function DomainReel() {
  return (
    <div className="ev-vis pz-d" aria-hidden="true">
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
        <svg className="pz-d-cursor ev-loop" viewBox="0 0 28 30">
          <path d="M4.5 3.2 23.6 13.4c1 .5.9 2-.2 2.3l-7.6 2.1-3.7 7.4c-.5 1-2 .9-2.3-.2L3 4.7c-.3-1 .7-1.9 1.5-1.5Z" fill="#18181b" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

/*
  The tile: a soft lavender ground, the column of addresses fading out above
  and below (a still mask on the column, the moving list inside it), and the
  pill on the middle row. --R is one row, from the tile's own size.
*/
export const DOMAIN_CSS = `
.pz-d{--R:clamp(36px,min(14.5cqh,12.5cqw),66px);container-type:size;background:radial-gradient(70% 60% at 50% 50%,#f6f2ff 0%,rgba(246,242,255,0) 100%),linear-gradient(165deg,#ece6ff 0%,#e2d9ff 100%)}
.pz-d-col{position:absolute;left:0;right:0;top:50%;height:calc(var(--R) * 5);margin-top:calc(var(--R) * -2.5);overflow:hidden;-webkit-mask-image:linear-gradient(transparent 0%,#000 34%,#000 66%,transparent 100%);mask-image:linear-gradient(transparent 0%,#000 34%,#000 66%,transparent 100%)}
.pz-d-track{display:flex;flex-direction:column;will-change:transform;animation:pz-reel ${(N * STEP_S).toFixed(1)}s ${EASE} infinite}
.pz-d-row{display:flex;flex:none;height:var(--R);align-items:center;justify-content:center}
.pz-d-addr{font-size:calc(var(--R) * .4);font-weight:500;letter-spacing:-.015em;white-space:nowrap;color:rgba(62,40,120,.42)}
.pz-d-end{font-weight:650;color:rgba(62,40,120,.62)}
.pz-d-pill{position:absolute;left:50%;top:50%;display:flex;align-items:center;gap:calc(var(--R) * .22);height:calc(var(--R) * 1.22);padding:0 calc(var(--R) * .5) 0 calc(var(--R) * .34);border-radius:999px;background:#fff;box-shadow:0 1px 2px rgba(40,20,90,.08),0 18px 40px -18px rgba(60,30,140,.45);transform:translate(-50%,-50%)}
.pz-d-globe{flex:none;width:calc(var(--R) * .5);height:calc(var(--R) * .5);color:#7c3aed}
.pz-d-window{display:block;height:var(--R);overflow:hidden}
.pz-d-track-pill .pz-d-row{justify-content:flex-start}
.pz-d-track-pill .pz-d-addr{font-size:calc(var(--R) * .43);color:#18181b}
.pz-d-end-on{font-weight:650;color:#7c3aed}
/* The pill's list starts two rows up, so its middle row is the column's. */
.pz-d-track-pill{margin-top:calc(var(--R) * -2)}
.pz-d-cursor{position:absolute;right:calc(var(--R) * -.42);bottom:calc(var(--R) * -.5);width:calc(var(--R) * .56);height:auto;filter:drop-shadow(0 4px 6px rgba(20,10,50,.25));transform-origin:20% 15%;animation:pz-press ${STEP_S}s ease-in-out infinite}
${reelKeyframes()}
@keyframes pz-press{0%,${((1 - MOVE_SHARE) * 100 - 8).toFixed(1)}%,100%{transform:none}${((1 - MOVE_SHARE) * 100 - 2).toFixed(1)}%{transform:scale(.86)}}
@media (prefers-reduced-motion:reduce){.pz-d-track{will-change:auto}}
`
