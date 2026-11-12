"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"

/*
  THE LAST WORD ABOVE THE FOOTER (wave 12; replaces "Your next chapter starts
  here"). One rounded near-black card on the white page, rising into place as
  it reaches the screen: a big headline, one line, Start free and a second
  way in. Behind the words, a slow purple-to-blue light turns (one layer,
  transform only), and three small receipts of a creator's day float at the
  card's edges on a computer.

  The rise is tied to the scroll where the browser can (a scroll-driven
  animation on the compositor, no script); elsewhere one IntersectionObserver
  adds data-in once. Nothing is hidden before that script runs: the card is
  only lowered once script knows it is below the screen. Off screen the light
  and the receipts stop; with reduced motion nothing moves at all.
*/
const STYLES = `
.fcta{background:#fff;padding:clamp(40px,6vw,96px) clamp(12px,2.2vw,32px) clamp(12px,2.2vw,32px)}
.fcta-card{position:relative;isolation:isolate;overflow:hidden;max-width:1400px;margin:0 auto;border-radius:clamp(24px,3vw,40px);background:#09090b;color:#fafafa;padding:clamp(72px,10vw,152px) clamp(22px,6vw,96px) clamp(64px,8vw,128px);text-align:center;transform-origin:50% 100%}
.fcta-light{position:absolute;z-index:-1;left:50%;top:50%;width:max(1200px,130%);aspect-ratio:1;margin:calc(max(1200px,130%) / -2) 0 0 calc(max(1200px,130%) / -2);pointer-events:none;background:conic-gradient(from 0deg,rgba(124,58,237,0) 0deg,rgba(124,58,237,.7) 70deg,rgba(59,130,246,.5) 140deg,rgba(124,58,237,0) 210deg,rgba(168,85,247,.5) 290deg,rgba(124,58,237,0) 360deg);-webkit-mask:radial-gradient(closest-side,#000 0%,rgba(0,0,0,.7) 45%,transparent 78%);mask:radial-gradient(closest-side,#000 0%,rgba(0,0,0,.7) 45%,transparent 78%);animation:fcta-turn 28s linear infinite;will-change:transform}
.fcta-card::after{content:"";position:absolute;z-index:-1;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(130% 80% at 50% 120%,rgba(9,9,11,0) 50%,rgba(9,9,11,.85) 90%);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.fcta-eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 0 28px;padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);font-size:13px;font-weight:500;letter-spacing:.01em;color:rgba(250,250,250,.86)}
.fcta-dot{width:6px;height:6px;border-radius:50%;background:#a78bfa;box-shadow:0 0 0 3px rgba(167,139,250,.18)}
.fcta .story-heading{margin-inline:auto;max-width:13ch;font-size:clamp(40px,6.4vw,96px);line-height:1.02}
.fcta-sub{margin:28px auto 0;max-width:44ch;font-size:clamp(16px,1.5vw,20px);line-height:1.6;color:rgba(250,250,250,.72);text-wrap:pretty}
.fcta-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:40px}
.fcta-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:54px;min-width:168px;padding:0 28px;border-radius:999px;font-size:16px;font-weight:600;text-decoration:none;transition:background-color .2s ease,border-color .2s ease,transform .2s cubic-bezier(.2,.8,.2,1)}
.fcta-btn:active{transform:scale(.98)}
.fcta-btn:focus-visible{outline:2px solid #fff;outline-offset:3px}
.fcta-primary{background:#fff;color:#09090b}
.fcta-primary:hover{background:#ede9fe}
.fcta-primary svg{transition:transform .2s ease}
.fcta-primary:hover svg{transform:translate3d(3px,0,0)}
.fcta-secondary{color:#fafafa;border:1px solid rgba(255,255,255,.22);background:transparent}
.fcta-secondary:hover{border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.06)}
.fcta-note{margin:20px 0 0;font-size:13px;color:rgba(250,250,250,.5)}
.fcta-chip{position:absolute;display:none;align-items:center;gap:10px;padding:10px 14px 10px 10px;border-radius:16px;background:rgba(24,24,27,.92);border:1px solid rgba(255,255,255,.09);box-shadow:0 18px 40px -18px rgba(0,0,0,.8);font-size:13px;line-height:1.3;text-align:left;color:#fafafa;animation:fcta-float 7s ease-in-out infinite}
.fcta-chip b{display:block;font-weight:600}
.fcta-chip span{color:rgba(250,250,250,.56)}
.fcta-chip i{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:10px;font-style:normal;font-size:14px;font-weight:700}
.fcta-chip:nth-of-type(1){left:6%;top:22%}
.fcta-chip:nth-of-type(2){right:6%;top:30%;animation-delay:-2.4s}
.fcta-chip:nth-of-type(3){left:12%;bottom:16%;animation-delay:-4.6s}
@media(min-width:1180px){.fcta-chip{display:flex}}
@keyframes fcta-turn{to{transform:rotate(360deg)}}
@keyframes fcta-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-10px,0)}}
.fcta[data-paused] .fcta-light,.fcta[data-paused] .fcta-chip{animation-play-state:paused}
@keyframes fcta-rise{from{opacity:.001;transform:translate3d(0,72px,0) scale(.94)}to{opacity:1;transform:none}}
@supports (animation-timeline:view()){
  @media(prefers-reduced-motion:no-preference){
    .fcta-card{animation:fcta-rise linear both;animation-timeline:view();animation-range:entry 0% entry 80%}
  }
}
@supports not (animation-timeline:view()){
  .fcta[data-armed] .fcta-card{opacity:.001;transform:translate3d(0,72px,0) scale(.94);transition:opacity .9s cubic-bezier(.2,.8,.2,1),transform 1.1s cubic-bezier(.2,.8,.2,1)}
  .fcta[data-armed][data-in] .fcta-card{opacity:1;transform:none}
}
@media(max-width:639px){
  .fcta-actions{flex-direction:column;align-items:stretch;max-width:340px;margin-inline:auto}
  .fcta-btn{width:100%}
}
@media(prefers-reduced-motion:reduce){
  .fcta-light,.fcta-chip{animation:none}
  .fcta-btn,.fcta-primary svg{transition:none}
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
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver !== "function") return
    const scrollDriven = typeof CSS !== "undefined" && CSS.supports("animation-timeline: view()")
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches
    /* Lower the card only when it is below the screen and the browser cannot tie the rise to the scroll. */
    if (!scrollDriven && !still && el.getBoundingClientRect().top > innerHeight) el.setAttribute("data-armed", "")
    let visible = true
    const sync = () => el.toggleAttribute("data-paused", !visible || document.hidden)
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        if (visible) el.setAttribute("data-in", "")
        sync()
      },
      { threshold: 0.12 },
    )
    io.observe(el)
    document.addEventListener("visibilitychange", sync)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])

  return (
    <section ref={ref} className="fcta" data-final-cta="" aria-labelledby="fcta-title">
      <style>{STYLES}</style>
      <div className="fcta-card">
        <div className="fcta-light" aria-hidden="true" />
        <div className="fcta-chip" aria-hidden="true">
          <i style={{ background: "rgba(34,197,94,.16)", color: "#4ade80" }}>$</i>
          <div>
            <b>New sale · $49.00</b>
            <span>Lightroom Preset Pack</span>
          </div>
        </div>
        <div className="fcta-chip" aria-hidden="true">
          <i style={{ background: "rgba(167,139,250,.18)", color: "#c4b5fd" }}>+</i>
          <div>
            <b>+128 subscribers</b>
            <span>This week</span>
          </div>
        </div>
        <div className="fcta-chip" aria-hidden="true">
          <i style={{ background: "rgba(96,165,250,.16)", color: "#93c5fd" }}>↗</i>
          <div>
            <b>Payout sent</b>
            <span>$2,318.40 to your bank</span>
          </div>
        </div>

        <p className="fcta-eyebrow">
          <span className="fcta-dot" aria-hidden="true" />
          Free to start. No card needed.
        </p>
        <StoryHeading id="fcta-title" text="Turn what you make into a business." accent={["business"]} dark />
        <p className="fcta-sub">
          Open your store in minutes. Sell products, courses and bookings from one place, get paid directly, and keep every
          customer you earn.
        </p>
        <div className="fcta-actions">
          <Link href="/signup?intent=sell" className="fcta-btn fcta-primary">
            Start free
            <Arrow />
          </Link>
          <Link href="/explore" className="fcta-btn fcta-secondary">
            See creators on Storelib
          </Link>
        </div>
        <p className="fcta-note">Set up in minutes. Cancel anytime.</p>
      </div>
    </section>
  )
}
