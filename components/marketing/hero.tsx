import { HERO_MEDIA_BOOT } from "@/lib/marketing/hero-startup"
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
      <link
        rel="preconnect"
        href="https://skgtqglupjcnfhfscink.supabase.co"
        crossOrigin="anonymous"
      />
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
          The e-commerce platform for creators &amp; entrepreneurs. Sell
          products, manage links &amp; grow an audience.
        </p>
        <HeroCta />
      </div>
      <script dangerouslySetInnerHTML={{ __html: HERO_MEDIA_BOOT }} />
    </section>
  )
}

const HERO_CSS = `
[data-home-hero="cinematic"] {
  --hero-grain-opacity: .035;
  --hero-tint-opacity: .60;
  position: relative; isolation: isolate; width: 100%; overflow: hidden;
  background: #141516; color: #fff;
  min-height: min(820px, calc(100svh - 70.35px));
  display: grid; place-items: start center;
  padding: clamp(96px, 8vw, 152px) 24px calc(clamp(92px, 7vw, 128px) + env(safe-area-inset-bottom, 0px));
  padding-left: max(24px, env(safe-area-inset-left, 0px));
  padding-right: max(24px, env(safe-area-inset-right, 0px));
}
[data-home-hero="cinematic"] *, [data-home-hero="cinematic"] *::before { box-sizing: border-box; }
.cinematic-media, .cinematic-poster, .cinematic-video, .cinematic-tint, .cinematic-grain, .cinematic-fade { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cinematic-media { z-index: -5; }
.cinematic-poster, .cinematic-video { object-fit: cover; object-position: var(--hero-video-position, 50% 50%); }
.cinematic-video { opacity: 0; transition: opacity 240ms ease; }
.cinematic-video[data-ready="true"] { opacity: 1; }
.cinematic-tint { z-index: -4; background: #000; opacity: var(--hero-tint-opacity); }
.cinematic-grain { z-index: -3; opacity: var(--hero-grain-opacity); background: url('/marketing/hero/cinematic-grain.png') repeat; }
.cinematic-fade { z-index: -2; background: linear-gradient(to bottom, transparent 62%, rgba(0,0,0,.15) 78%, rgba(0,0,0,.68) 100%); }
.cinematic-copy { position: relative; width: 100%; max-width: 1040px; text-align: center; display: flex; flex-direction: column; align-items: center; }
.cinematic-eyebrow { margin: 0 0 28px; padding: 8px 14px; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; background: rgba(255,255,255,.08); font-size: 12px; font-weight: 500; letter-spacing: .045em; color: rgba(255,255,255,.94); }
.cinematic-heading { width: 100%; margin: 0; font-size: clamp(82px, 8vw, 116px); line-height: 1.04; letter-spacing: -.055em; font-weight: 600; color: #fff; }
.cinematic-heading-fixed { display: block; font-weight: 500; }
.cinematic-phrases { display: grid; position: relative; margin-top: .03em; color: #f1f1f3; perspective: 900px; }
.cinematic-phrase { grid-area: 1 / 1; display: block; white-space: nowrap; visibility: hidden; }
.cinematic-phrase[data-active="true"], .cinematic-phrase[data-exiting="true"] { visibility: visible; }
.cinematic-phrases[data-animate="true"] .cinematic-phrase[data-active="true"] { animation: cinematic-in 460ms cubic-bezier(.22,1,.36,1) both; }
.cinematic-phrase[data-exiting="true"] { animation: cinematic-out 460ms cubic-bezier(.22,1,.36,1) both; }
@keyframes cinematic-in { from { opacity: 0; transform: translate3d(0,14px,0) rotateX(-3deg) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes cinematic-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translate3d(0,-12px,0) rotateX(3deg) scale(.99); } }
.cinematic-description { margin: 28px 0 0; max-width: 460px; font-size: 17px; line-height: 1.6; color: rgba(255,255,255,.94); text-wrap: pretty; }
.cinematic-period { color: #a98bff; }
.cinematic-actions { display: grid; grid-template-columns: auto minmax(0,290px); justify-content: center; gap: 14px; width: 100%; max-width: 600px; min-height:54px; margin-top: 32px; }
.cinematic-signup[hidden], .cinematic-desktop-signup[hidden] { display: none !important; }
.cinematic-signup { display: none; position: relative; }
.cinematic-primary, .cinematic-signup button { min-width: 160px; display: flex; align-items: center; justify-content: center; height: 54px; padding: 0 28px; border: 0; border-radius: 999px; background: #7c3aed; color: #fff; font: inherit; font-size: 15px; font-weight: 600; text-decoration: none; cursor: pointer; transition: background 160ms, transform 160ms; }
.cinematic-primary:hover, .cinematic-signup button:hover { background: #6d28d9; }
.cinematic-primary:active, .cinematic-signup button:active { transform: scale(.985); }
.cinematic-actions input { width: 100%; min-width: 0; height: 54px; padding: 0 20px; border: 1px solid rgba(255,255,255,.42); border-radius: 12px; background: rgba(255,255,255,.12); color: #fff; font: inherit; font-size: 15px; outline: none; -webkit-backdrop-filter: blur(16px) saturate(135%); backdrop-filter: blur(16px) saturate(135%); box-shadow: inset 0 1px 0 rgba(255,255,255,.1); }
.cinematic-actions input::placeholder { color: rgba(255,255,255,.9); opacity: 1; }
.cinematic-search { position: relative; min-width: 0; }
.cinematic-search input { padding-right: 48px; }
.cinematic-search button { position: absolute; right: 0; top: 0; width: 48px; height: 54px; background: transparent; border: 0; color: #fff; cursor: pointer; display: grid; place-items: center; border-radius: 12px; }
.cinematic-actions input:focus-visible, .cinematic-actions button:focus-visible, .cinematic-primary:focus-visible, .cinematic-marketplace:focus-visible, .cinematic-motion:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }
.cinematic-error { font-size: 13px; color: #fff; margin: 2px 0 0; text-align: left; }
.cinematic-marketplace { display: none; color: rgba(255,255,255,.94); font-size: 14px; text-decoration: underline; text-underline-offset: 5px; text-decoration-color: rgba(255,255,255,.4); }
.cinematic-motion { position: absolute; z-index: 2; bottom: max(58px, calc(env(safe-area-inset-bottom, 0px) + 38px)); right: max(20px, env(safe-area-inset-right, 0px)); display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid rgba(255,255,255,.35); border-radius: 50%; color: #fff; background: rgba(0,0,0,.25); cursor: pointer; }
.cinematic-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
body:has([data-home-hero="cinematic"]) #platform-header-root[data-header-tone="dark"], body:has([data-home-hero="cinematic"]) #platform-header-root[data-header-tone="dark"] > header { background-color: #121214; }
body:has([data-home-hero="cinematic"]) #platform-header-root { --bar-depth-dark: 0 1px 2px rgba(0,0,0,.21), 0 5px 14px -14px rgba(0,0,0,.33); --bar-depth-dark-raised: 0 1px 2px rgba(0,0,0,.26), 0 8px 21px -10px rgba(0,0,0,.44); }
@media (max-width: 767px) {
  .cinematic-actions { max-width: 360px; min-height:164px; align-content:start; grid-template-columns: minmax(0,1fr); gap: 12px; margin-top: 26px; }
  .cinematic-signup { display: grid; gap: 12px; }
  .cinematic-desktop-signup { display: none; }
  .cinematic-actions input, .cinematic-signup button { height: 54px; font-size: 16px; }
  .cinematic-signup button { background: #7c3aed; color: #fff; }
  .cinematic-actions[data-audience="guest"] .cinematic-search { display: none; }
  .cinematic-actions[data-audience="guest"] .cinematic-marketplace { display: block; margin-top: 10px; }
  .cinematic-actions:not([data-audience="guest"]) .cinematic-account { grid-row: 2; }
  [data-home-hero="cinematic"] { min-height: 0; padding-block: 40px calc(88px + env(safe-area-inset-bottom, 0px)); }
}
@media (max-width: 639px) {
  .cinematic-poster, .cinematic-video { object-position: var(--hero-video-position-mobile, 50% 50%); }
  .cinematic-heading { font-size: clamp(42px, 11.4vw, 60px); letter-spacing: -.055em; }
  .cinematic-eyebrow { font-size: 10px; margin-bottom: 22px; letter-spacing: .03em; }
  .cinematic-description { font-size: 15px; max-width: 340px; margin-top: 24px; }
}
@media (max-width: 1023px) and (hover: none) and (pointer: coarse) and (orientation: landscape) {
  [data-home-hero="cinematic"] { padding-top: 44px; padding-bottom: 64px; min-height: 0; }
  .cinematic-heading { font-size: clamp(40px, 7.5vw, 72px); }
}
@media (hover: none) and (pointer: coarse) {
  [data-home-hero="cinematic"] { min-height: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cinematic-video { transition: none; }
  .cinematic-phrase { animation: none !important; }
  .cinematic-signup button, .cinematic-primary { transition: none; }
}
`
