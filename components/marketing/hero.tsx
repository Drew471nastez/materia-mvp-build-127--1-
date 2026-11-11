import { HeroHeadline } from "./hero-headline"
import { HeroVideo } from "./hero-video"
import { HeroCta } from "./hero-cta"
import { HERO_VIDEO } from "@/lib/marketing/hero-video"
import type { CSSProperties } from "react"

/** The copy and signup form are server-rendered; media never gates the page. */
export function Hero() {
  return (
    <section
      data-home-hero="cinematic"
      data-own-look=""
      aria-label="Build with Storelib"
      style={
        {
          "--hero-video-position": HERO_VIDEO.desktopPosition,
          "--hero-video-position-mobile": HERO_VIDEO.mobilePosition,
        } as CSSProperties
      }
    >
      <style>{HERO_CSS}</style>
      <HeroVideo />
      <div className="cinematic-tint" aria-hidden="true" />
      <div className="cinematic-grain" aria-hidden="true" />
      <div className="cinematic-fade" aria-hidden="true" />
      <div className="cinematic-copy">
        <p className="cinematic-eyebrow">
          The all-in-one platform for creators
        </p>
        <HeroHeadline />
        <p className="cinematic-description">
          Create your website, sell your products, and grow your audience. All
          in one place.
        </p>
        <HeroCta />
        <a href="/explore" className="cinematic-marketplace">
          Explore marketplace
        </a>
        <p className="cinematic-reassurance">
          Free to start. No card required.
        </p>
      </div>
    </section>
  )
}

const HERO_CSS = `
[data-home-hero="cinematic"] {
  --hero-grain-opacity: .06;
  --hero-tint-opacity: .60;
  position: relative; isolation: isolate; width: 100%; overflow: hidden;
  background: #141516; color: #fff;
  min-height: min(860px, calc(100svh - 70.35px));
  display: grid; place-items: center;
  padding: clamp(72px, 10vh, 132px) 24px calc(clamp(80px, 11vh, 144px) + env(safe-area-inset-bottom, 0px));
  padding-left: max(24px, env(safe-area-inset-left, 0px));
  padding-right: max(24px, env(safe-area-inset-right, 0px));
}
[data-home-hero="cinematic"] *, [data-home-hero="cinematic"] *::before { box-sizing: border-box; }
.cinematic-media, .cinematic-poster, .cinematic-video, .cinematic-tint, .cinematic-grain, .cinematic-fade { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cinematic-media { z-index: -5; }
.cinematic-poster, .cinematic-video { object-fit: cover; object-position: var(--hero-video-position, 50% 50%); }
.cinematic-video { opacity: 0; transition: opacity 600ms ease; }
.cinematic-video[data-ready="true"] { opacity: 1; }
.cinematic-tint { z-index: -4; background: #000; opacity: var(--hero-tint-opacity); }
.cinematic-grain { z-index: -3; opacity: var(--hero-grain-opacity); background: url('/marketing/hero/cinematic-grain.png') repeat; }
.cinematic-fade { z-index: -2; background: linear-gradient(to bottom, transparent 62%, rgba(0,0,0,.15) 78%, rgba(0,0,0,.68) 100%); }
.cinematic-copy { position: relative; width: 100%; max-width: 1040px; text-align: center; display: flex; flex-direction: column; align-items: center; }
.cinematic-eyebrow { margin: 0 0 28px; font-size: 13px; font-weight: 500; letter-spacing: .045em; color: rgba(255,255,255,.94); }
.cinematic-heading { width: 100%; margin: 0; font-size: clamp(76px, 7.6vw, 110px); line-height: 1.04; letter-spacing: -.055em; font-weight: 600; color: #fff; }
.cinematic-heading-fixed { display: block; font-weight: 500; }
.cinematic-phrases { display: grid; position: relative; margin-top: .03em; color: #f1f1f3; perspective: 900px; }
.cinematic-phrase { grid-area: 1 / 1; display: block; white-space: nowrap; visibility: hidden; }
.cinematic-phrase[data-active="true"], .cinematic-phrase[data-exiting="true"] { visibility: visible; }
.cinematic-phrases[data-animate="true"] .cinematic-phrase[data-active="true"] { animation: cinematic-in 400ms cubic-bezier(.22,1,.36,1) both; }
.cinematic-phrase[data-exiting="true"] { animation: cinematic-out 400ms cubic-bezier(.22,1,.36,1) both; }
@keyframes cinematic-in { from { opacity: 0; transform: translate3d(0,16px,0) rotateX(-6deg); } to { opacity: 1; transform: none; } }
@keyframes cinematic-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translate3d(0,-16px,0) rotateX(6deg); } }
.cinematic-description { margin: 28px 0 0; max-width: 460px; font-size: 17px; line-height: 1.6; color: rgba(255,255,255,.94); text-wrap: pretty; }
.cinematic-signup { width: 100%; max-width: 540px; margin-top: 32px; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; position: relative; }
.cinematic-signup input, .cinematic-signup button { height: 56px; border-radius: 999px; font: inherit; font-size: 15px; }
.cinematic-signup input { min-width: 0; width: 100%; padding: 0 22px; background: rgba(12,12,14,.48); border: 1px solid rgba(255,255,255,.4); color: #fff; outline: none; }
.cinematic-signup input::placeholder { color: rgba(255,255,255,.75); opacity: 1; }
.cinematic-signup button { border: 0; padding: 0 28px; background: #fff; color: #151517; font-weight: 600; cursor: pointer; transition: background 160ms, transform 160ms; }
.cinematic-signup button:hover { background: #ededee; }
.cinematic-signup button:active { transform: scale(.98); }
.cinematic-signup input:focus-visible, .cinematic-signup button:focus-visible, .cinematic-marketplace:focus-visible, .cinematic-motion:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }
.cinematic-error { grid-column: 1 / -1; font-size: 13px; color: #fff; margin: 2px 0 0; text-align: left; }
.cinematic-marketplace { margin-top: 24px; color: rgba(255,255,255,.94); font-size: 14px; text-decoration: underline; text-underline-offset: 5px; text-decoration-color: rgba(255,255,255,.4); transition: text-decoration-color 160ms; }
.cinematic-marketplace:hover { text-decoration-color: #fff; }
.cinematic-reassurance { margin: 18px 0 0; font-size: 12px; color: rgba(255,255,255,.94); }
.cinematic-motion { position: absolute; z-index: 2; bottom: max(20px, env(safe-area-inset-bottom, 0px)); right: max(20px, env(safe-area-inset-right, 0px)); display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid rgba(255,255,255,.35); border-radius: 50%; color: #fff; background: rgba(0,0,0,.25); cursor: pointer; }
.cinematic-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 639px) {
  [data-home-hero="cinematic"] { min-height: calc(100svh - 64.6px); padding-block: 64px calc(76px + env(safe-area-inset-bottom, 0px)); }
  .cinematic-poster, .cinematic-video { object-position: var(--hero-video-position-mobile, 50% 50%); }
  .cinematic-heading { font-size: clamp(40px, 10.9vw, 56px); letter-spacing: -.055em; }
  .cinematic-eyebrow { font-size: 11px; margin-bottom: 24px; letter-spacing: .03em; }
  .cinematic-description { font-size: 15px; max-width: 340px; margin-top: 24px; }
  .cinematic-signup { max-width: 360px; grid-template-columns: minmax(0,1fr); margin-top: 28px; gap: 12px; }
  .cinematic-signup input, .cinematic-signup button { height: 54px; font-size: 16px; }
  .cinematic-marketplace { margin-top: 22px; }
  .cinematic-reassurance { margin-top: 16px; }
}
@media (max-height: 540px) and (orientation: landscape) {
  [data-home-hero="cinematic"] { padding-top: 44px; padding-bottom: 64px; min-height: 0; }
  .cinematic-heading { font-size: clamp(40px, 7.5vw, 72px); }
}
@media (prefers-reduced-motion: reduce) {
  .cinematic-video { transition: none; }
  .cinematic-phrase { animation: none !important; }
  .cinematic-signup button { transition: none; }
}
`
