"use client"

import Link from "next/link"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { DotField } from "./dot-field"

/*
  THE LAST WORD ABOVE THE FOOTER.

  Wave 13, the owner: it faded in and was too tall. Round 4, the owner: he did
  not like it either, nor how it met the footer (a purple sheet ending in the
  footer's lit edge). Now it is the end of the page's dark close, centred and
  quiet: the Storelib mark, one line, two ways in, on a fine dot grid whose
  light drifts slowly (dot-field.tsx) and fades out before the edges. The
  footer below continues the same near-black with no lit top edge, so the two
  read as one surface. Nothing rises or fades in; only the grid's light
  drifts, and only while it is on screen.

  Round 5, the owner: "what you make" a little lighter (it read too grey),
  and the dots smoother, scattered and following the mouse: DotField is a
  canvas now (dot-field.tsx), its light gliding after the pointer.

  Round 7, the owner: the pattern here was "smooth, flowing, following the
  mouse cursor and going auto, very subtle", bring it back. The field is an
  even grid again with a slow current of light flowing through it by
  itself, and the pointer's light gliding after the mouse (dot-field.tsx).
  The block sits in the page's one width (--home-edge, app/globals.css).

  Round 8, the owner: the dots "a little more visible, just a little bit",
  moving by themselves and following the mouse, smoother and cleaner
  (dot-field.tsx: round dots, a light that wanders on its own and glides
  after the mouse while it is over the field, 60 frames a second, paused off
  screen). There are no graphs here; the flowing field is the motion. And
  "the section should fade very nicely into the footer, but the footer
  should still have some depth/border": the field fades out well before
  the section's foot (fade="close"), so the call ends on plain black, and
  the footer starts on that same black, so nothing cuts across. What marks
  the footer as the footer is its top edge: one hairline of light, brightest
  in the middle and gone at both sides, a soft light falling a little way
  under it, and a ground that lifts very slightly before it settles. All
  of it is still background (gradients and a 1px line), nothing that moves.

  Landing round 11, the owner: "the pattern dots should be more smooth and
  clean and more visible at the bottom as well; and that section has too
  much height, reduce it just a little." The dots are brighter, crisper and
  still on their points, and run on to the section's foot (dot-field.tsx);
  the section pads about 15% less above and below (about 600px tall at
  1440x800, was 646).
*/
const STYLES = `
.fcta{position:relative;isolation:isolate;background:transparent;color:#fff;padding:clamp(76px,8.4vw,128px) var(--home-edge,clamp(20px,5.15vw,84px)) clamp(68px,7.6vw,116px)}
.fcta-in{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;max-width:880px;margin:0 auto;text-align:center}
.fcta-mark{display:block;margin-bottom:28px}
.fcta-title{margin:0;max-width:15ch;font-size:clamp(38px,5.6vw,80px);font-weight:500;line-height:1.02;letter-spacing:-.05em;color:#fafafa;text-wrap:balance}
.fcta-title em{font-style:normal;color:#b6b3c1}
.fcta-note{margin:20px 0 0;font-size:clamp(15px,1.3vw,18px);line-height:1.5;color:#a3a0ac}
.fcta-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:36px}
.fcta-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:54px;padding:0 28px;border-radius:999px;font-size:16px;font-weight:600;text-decoration:none;white-space:nowrap;transition:background-color .2s ease,border-color .2s ease,color .2s ease}
.fcta-btn:focus-visible{outline:2px solid #fff;outline-offset:3px}
.fcta-primary{background:#fff;color:#18181b}
.fcta-primary:hover{background:#e7e5ee}
@media(max-width:639px){
  .fcta-actions{flex-direction:column;align-items:stretch;width:100%;max-width:360px}
  .fcta-btn{width:100%}
}
@media(prefers-reduced-motion:reduce){
  .fcta-btn{transition:none}
}
/* The footer under it, on the home page only (this sheet of rules is only drawn there). Round 8: it starts on the call's own black, so the call fades into it, and its top edge gives it depth: a hairline faded at both ends, a faint light under it, the ground lifting a touch. */
footer.storelib-footer{background-color:#050506;background-image:radial-gradient(ellipse 60% 140px at 50% 0%,rgba(255,255,255,.045),transparent 100%),linear-gradient(180deg,#050506 0%,#0a0a0c 140px,#060607 55%,#030304 100%);box-shadow:inset 0 18px 36px -30px rgba(255,255,255,.06)}
footer.storelib-footer::before{content:"";background:linear-gradient(90deg,transparent 4%,rgba(255,255,255,.07) 22%,rgba(255,255,255,.16) 50%,rgba(255,255,255,.07) 78%,transparent 96%)}
`

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

/** The home page's closing call: Start free. (Landing round 5: the owner asked for "See creators on Storelib" to go.) */
export function FinalCta() {
  return (
    <section className="fcta" data-final-cta="" aria-labelledby="fcta-title">
      <style>{STYLES}</style>
      <DotField fade="close" />
      <div className="fcta-in">
        <span className="fcta-mark" aria-hidden="true">
          <StorelibLogo size={44} />
        </span>
        <h2 id="fcta-title" className="fcta-title">
          Start selling <em>what you make.</em>
        </h2>
        <p className="fcta-note">Free to start. No card needed.</p>
        <div className="fcta-actions">
          <Link href="/signup?intent=sell" className="fcta-btn fcta-primary">
            Start free
            <Arrow />
          </Link>
        </div>
      </div>
    </section>
  )
}
