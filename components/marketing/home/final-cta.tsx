"use client"

import Link from "next/link"

/*
  THE LAST WORD ABOVE THE FOOTER.

  Wave 13, the owner: it faded in and was too tall. Now it is plain and
  short: no card, no rise or fade, no turning light, no floating receipts.
  The headline and one line on the left, Start free and a second way in on
  the right (stacked under it on a phone). Nothing animates but a button's own hover colour.

  Round 3: on the home page it closes the last purple sheet, under the app
  section; the sheet recolours it (landing-story.tsx BAND_CSS, [data-band]
  .fcta). Anywhere else it is drawn on white, as written here.
*/
const STYLES = `
.fcta{background:#fff;padding:clamp(48px,6vw,96px) var(--landing-gutter,clamp(22px,6vw,96px))}
.fcta-in{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:28px 48px;max-width:1400px;margin:0 auto}
.fcta-title{margin:0;max-width:16ch;font-size:clamp(36px,5vw,72px);font-weight:500;line-height:1.04;letter-spacing:-.05em;color:#18181b;text-wrap:balance}
.fcta-title em{font-style:normal;color:#7c3aed}
.fcta-note{margin:16px 0 0;font-size:clamp(15px,1.3vw,17px);line-height:1.5;color:#6b6874}
.fcta-actions{display:flex;flex-wrap:wrap;gap:12px}
.fcta-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:54px;padding:0 28px;border-radius:999px;font-size:16px;font-weight:600;text-decoration:none;white-space:nowrap;transition:background-color .2s ease,border-color .2s ease}
.fcta-btn:focus-visible{outline:2px solid #7c3aed;outline-offset:3px}
.fcta-primary{background:#18181b;color:#fff}
.fcta-primary:hover{background:#7c3aed}
.fcta-secondary{color:#18181b;border:1px solid #dcdce2;background:#fff}
.fcta-secondary:hover{border-color:#18181b}
@media(max-width:639px){
  .fcta-actions{flex-direction:column;align-items:stretch;width:100%}
  .fcta-btn{width:100%}
}
@media(prefers-reduced-motion:reduce){
  .fcta-btn{transition:none}
}
`

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

/** The home page's closing call: Start free, or look around first. */
export function FinalCta() {
  return (
    <section className="fcta" data-final-cta="" aria-labelledby="fcta-title">
      <style>{STYLES}</style>
      <div className="fcta-in">
        <div>
          <h2 id="fcta-title" className="fcta-title">
            Turn what you make into a <em>business.</em>
          </h2>
          <p className="fcta-note">Free to start. No card needed.</p>
        </div>
        <div className="fcta-actions">
          <Link href="/signup?intent=sell" className="fcta-btn fcta-primary">
            Start free
            <Arrow />
          </Link>
          <Link href="/explore" className="fcta-btn fcta-secondary">
            See creators on Storelib
          </Link>
        </div>
      </div>
    </section>
  )
}
