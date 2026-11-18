import { HERO_GEOMETRY_BOOT } from "@/lib/marketing/hero-geometry"
import { HERO_MEDIA_BOOT } from "@/lib/marketing/hero-startup"
import { HeroHeadline } from "./hero-headline"
import { HeroVideo } from "./hero-video"
import { HeroCta, HERO_AUDIENCE_BOOT } from "./hero-cta"
import { HERO_VIDEO } from "@/lib/marketing/hero-video"
import type { CSSProperties } from "react"

/** The copy and signup form are server-rendered; media never gates the page. */
export function Hero() {
  return (
    <section
      data-home-hero="cinematic"
      suppressHydrationWarning
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
      {/* Landing round 9: the first frame of the film is asked for from the head, ahead of everything, the phone cut on a phone (React lifts a preload link into <head>). The film is on this site, so no second host to open. */}
      <link rel="preload" as="image" href={HERO_VIDEO.poster} media="(min-width: 640px)" fetchPriority="high" />
      <link rel="preload" as="image" href={HERO_VIDEO.phonePoster} media={HERO_VIDEO.phoneMedia} fetchPriority="high" />
      <HeroVideo />
      <div className="cinematic-tint" aria-hidden="true" />
      <div className="cinematic-grain" aria-hidden="true" />
      <div className="cinematic-fade" aria-hidden="true" />
      {/* Landing round 12: who is here, before the buttons are painted (hero-cta). */}
      <script dangerouslySetInnerHTML={{ __html: HERO_AUDIENCE_BOOT }} />
      <div className="cinematic-copy">
        <p className="cinematic-eyebrow">
          The all-in-one platform for creators
        </p>
        <HeroHeadline />
        <p className="cinematic-description">
          <span>Everything you need to create, sell,</span>{" "}
          <span>and grow your business. All in one place</span>
        </p>
        <HeroCta />
      </div>
      <script dangerouslySetInnerHTML={{ __html: HERO_GEOMETRY_BOOT + HERO_MEDIA_BOOT }} />
    </section>
  )
}

const HERO_CSS = `
[data-home-hero="cinematic"] {
  --hero-grain-opacity: .03675;
  --hero-control-radius: 12px;
  --hero-tint-opacity: .60;
  position: relative; isolation: isolate; width: 100%; overflow: clip;
  background: #141516; color: #fff;
  min-height: min(861px, calc((100svh - 68.96px)*1.05));
  display: grid; place-items: start center;
  padding: clamp(96px, 8vw, 152px) 24px calc(clamp(92px, 7vw, 128px) + 32px + var(--home-safe-bottom));
  padding-left: max(24px, env(safe-area-inset-left, 0px));
  padding-right: max(24px, env(safe-area-inset-right, 0px));
}
[data-home-hero="cinematic"] *, [data-home-hero="cinematic"] *::before { box-sizing: border-box; }
.cinematic-media, .cinematic-poster, .cinematic-video, .cinematic-tint, .cinematic-grain, .cinematic-fade { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.cinematic-media { z-index: 0; }
.cinematic-poster, .cinematic-video { object-fit: cover; object-position: var(--hero-video-position, 50% 50%); }
.cinematic-video { opacity: 0; }
.cinematic-video[data-ready="true"] { opacity: 1; }
.cinematic-tint { z-index: 1; background: #000; opacity: var(--hero-tint-opacity); }
.cinematic-grain { z-index: 2; opacity: var(--hero-grain-opacity); background: url('/marketing/hero/cinematic-grain.png') repeat; }
.cinematic-fade { z-index: 3; background: linear-gradient(to bottom, transparent 62%, rgba(0,0,0,.15) 78%, rgba(0,0,0,.68) 100%); }
.cinematic-copy { position: relative; z-index:4; width: 100%; max-width: 1040px; text-align: center; display: flex; flex-direction: column; align-items: center; }
.cinematic-eyebrow { margin: 0 0 28px; padding: 8px 14px; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; background: rgba(255,255,255,.08); font-size: 12px; font-weight: 500; letter-spacing: .045em; color: rgba(255,255,255,.94); }
.cinematic-heading { width: 100%; margin: 0; font-size: clamp(82px, 8vw, 116px); line-height: 1.04; letter-spacing: -.055em; font-weight: 600; color: #fff; }
.cinematic-heading-fixed { display: block; font-weight: 500; }
.cinematic-phrases { display: grid; position: relative; margin-top: .03em; color: #f1f1f3; perspective: 900px; }
.cinematic-phrase { grid-area: 1 / 1; display: block; white-space: nowrap; visibility: hidden; }
.cinematic-phrase[data-active="true"], .cinematic-phrase[data-exiting="true"] { visibility: visible; }
.cinematic-phrases[data-animate="true"] .cinematic-phrase[data-active="true"] { animation: cinematic-in 500ms cubic-bezier(.2,.85,.25,1) both; }
.cinematic-phrase[data-exiting="true"] { animation: cinematic-out 500ms cubic-bezier(.2,.85,.25,1) both; }
@keyframes cinematic-in { from { opacity: 0; transform: translate3d(0,12px,0) rotateX(-4deg) scale(.992); } to { opacity: 1; transform: none; } }
@keyframes cinematic-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translate3d(0,-10px,0) rotateX(3deg) scale(.996); } }
.cinematic-description { margin: 28px 0 0; max-width: 460px; font-size: 17px; line-height: 1.6; color: rgba(255,255,255,.94); text-wrap: pretty; }
.cinematic-period { color: inherit; }
.cinematic-actions { display: grid; grid-template-columns: auto minmax(0,290px); justify-content: center; gap: 14px; width: 100%; max-width: 600px; min-height:54px; margin-top: 32px; }
/* Landing round 12: who is here is html[data-sl-aud] (set before the first paint); a guest unless it says otherwise. */
html[data-sl-aud="creator"] .cinematic-signup, html[data-sl-aud="buyer"] .cinematic-signup,
html[data-sl-aud="creator"] .cinematic-desktop-signup, html[data-sl-aud="buyer"] .cinematic-desktop-signup { display: none !important; }
.cinematic-actions .cinematic-account { display: none; }
html[data-sl-aud="creator"] .cinematic-actions .cinematic-account[data-for="creator"],
html[data-sl-aud="buyer"] .cinematic-actions .cinematic-account[data-for="buyer"] { display: flex; }
.cinematic-signup { display: none; position: relative; }
.cinematic-primary, .cinematic-signup button { min-width: 160px; display: flex; align-items: center; justify-content: center; height: 54px; padding: 0 28px; border: 0; border-radius: var(--hero-control-radius); background: #7c3aed; color: #fff; font: inherit; font-size: 15px; font-weight: 600; text-decoration: none; cursor: pointer; transition: background 160ms, transform 160ms; }
.cinematic-primary:hover, .cinematic-signup button:hover { background: #6d28d9; }
.cinematic-primary:active, .cinematic-signup button:active { transform: scale(.985); }
.cinematic-actions input { width: 100%; min-width: 0; height: 54px; padding: 0 20px; border: 1px solid rgba(255,255,255,.26); border-radius: var(--hero-control-radius); background: rgba(255,255,255,.12); color: #fff; font: inherit; font-size: 15px; outline: none; -webkit-backdrop-filter: blur(16px) saturate(135%); backdrop-filter: blur(16px) saturate(135%); box-shadow: inset 0 1px 0 rgba(255,255,255,.1); }
.cinematic-actions input::placeholder { color: rgba(255,255,255,.9); opacity: 1; }
.cinematic-search { position: relative; min-width: 0; }
.cinematic-search input { padding-right: 48px; }
.cinematic-search button { position: absolute; right: 0; top: 0; width: 48px; height: 54px; background: transparent; border: 0; color: #fff; cursor: pointer; display: grid; place-items: center; border-radius: var(--hero-control-radius); }
.cinematic-actions button:focus-visible, .cinematic-primary:focus-visible, .cinematic-marketplace:focus-visible, .cinematic-motion:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }
.cinematic-actions input:focus, .cinematic-actions input:focus-visible { outline:none; border-color:rgba(255,255,255,.38); box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 3px 10px rgba(0,0,0,.16); }
.cinematic-error { font-size: 13px; color: #fff; margin: 2px 0 0; text-align: left; }
.cinematic-marketplace { display: none; color: rgba(255,255,255,.94); font-size: 14px; text-decoration: underline; text-underline-offset: 5px; text-decoration-color: rgba(255,255,255,.4); }
.cinematic-motion { position: absolute; z-index: 5; bottom: max(58px, calc(var(--home-safe-bottom) + 38px)); right: max(20px, env(safe-area-inset-right, 0px)); display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid rgba(255,255,255,.35); border-radius: 50%; color: #fff; background: rgba(0,0,0,.25); cursor: pointer; }
.cinematic-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
body:has([data-home-hero="cinematic"]) { --home-env-top:env(safe-area-inset-top,0px); --home-env-bottom:env(safe-area-inset-bottom,0px); --home-safe-bottom:var(--hero-stable-safe-bottom,var(--home-env-bottom)); --home-header-height:var(--hero-stable-header-height,68.96px); }
body:has([data-home-hero="cinematic"]) #platform-header-root { --bar-depth-dark:0 1px 2px rgba(0,0,0,.21),0 5px 14px -14px rgba(0,0,0,.33); --bar-depth-dark-raised:0 1px 2px rgba(0,0,0,.26),0 8px 21px -10px rgba(0,0,0,.44); transition:background-color 320ms ease,box-shadow 320ms ease,backdrop-filter 320ms ease; }
body:has([data-home-hero="cinematic"]) #platform-header-root[data-header-tone="dark"] { background-color:transparent; }
body:has([data-home-hero="cinematic"]) #platform-header-root[data-header-tone="dark"] > header { background-color:transparent; border-bottom-color:transparent; transition:border-color 320ms ease; }
body:has([data-home-hero="cinematic"]) #platform-header-root:not([data-scrolled]) { box-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none; }
body:has([data-home-hero="cinematic"]) #platform-header-root[data-header-tone="dark"][data-scrolled] { background-color:#0d0d0f; }
body:has([data-home-hero="cinematic"]) #platform-header-root[data-header-tone="dark"]::before { content:""; position:absolute; inset:0; z-index:-1; pointer-events:none; background:linear-gradient(180deg,rgba(0,0,0,.22),rgba(0,0,0,.07) 70%,rgba(0,0,0,0)); transition:opacity 320ms ease; }
body:has([data-home-hero="cinematic"]) #platform-header-root[data-scrolled]::before { opacity:0; }
/* Scrolled, the bar is opaque: a backdrop blur behind an opaque colour shows nothing and is still re-rendered on every scroll frame. */
body:has([data-home-hero="cinematic"]) #platform-header-root[data-scrolled] { backdrop-filter:none; -webkit-backdrop-filter:none; }
body:has([data-home-hero="cinematic"]) #platform-header-root[data-scrolled] > header { border-bottom-color:rgba(0,0,0,.096); }
/* Landing round 14, the owner: on a computer Sign up stands next to Log in from the top of the page, always; only the phone's Start now still waits for the hero's buttons. */
/* Landing round 5: the bar's Start now (phone) and Sign up (computer) wait, faded where they stand, until the hero's own buttons have gone under the bar (platform-header-client writes data-home-cta; landing round 9: on a phone, until the showcase has). Opacity and translate only, so the bar never moves or changes height. Landing round 9, the owner: "very smooth and clean, unobservable": a longer, softer fade (560ms, it was 320) over a 4px rise (it was 7), and it leaves the same way. */
body:has([data-home-hero="cinematic"]) #platform-header-root [data-home-phone-start] { transition:opacity 560ms cubic-bezier(.33,0,.2,1),translate 640ms cubic-bezier(.22,1,.36,1),background-color 150ms,visibility 0s linear 0s; }
body:has([data-home-hero="cinematic"]) #platform-header-root:not([data-home-cta="shown"]) [data-home-phone-start] { opacity:0; translate:0 4px; visibility:hidden; pointer-events:none; transition:opacity 280ms ease-out,translate 280ms ease-out,background-color 150ms,visibility 0s linear 280ms; }
@media (min-width:1024px) {
  [data-home-hero="cinematic"] { --hero-tint-opacity:.57; min-height:min(886.83px,calc((100svh - 68.96px)*1.0815)); }
  .cinematic-heading {font-size:clamp(77.9px,7.6vw,110.2px)}
  .cinematic-description {font-size:16.15px}
  .cinematic-eyebrow {font-size:11.4px}
  .cinematic-primary,.cinematic-actions input,.cinematic-signup button {font-size:14.25px}
  .cinematic-marketplace {font-size:13.3px}
}
@media (max-width: 767px) {
  .cinematic-actions { max-width: 360px; min-height:164px; align-content:start; grid-template-columns: minmax(0,1fr); gap: 12px; margin-top: 26px; }
  .cinematic-signup { display: grid; gap: 12px; }
  .cinematic-desktop-signup { display: none; }
  .cinematic-actions input, .cinematic-signup button { height: 54px; font-size: 16px; }
  .cinematic-signup button { background: #7c3aed; color: #fff; }
  html:not([data-sl-aud="creator"]):not([data-sl-aud="buyer"]) .cinematic-actions .cinematic-search { display: none; }
  html:not([data-sl-aud="creator"]):not([data-sl-aud="buyer"]) .cinematic-actions .cinematic-marketplace { display: block; margin-top: 10px; }
  html[data-sl-aud="creator"] .cinematic-actions .cinematic-account, html[data-sl-aud="buyer"] .cinematic-actions .cinematic-account { grid-row: 2; }
  [data-home-hero="cinematic"] { min-height: 0; padding-block: 40px calc(120px + var(--home-safe-bottom)); }
}
@media (max-width: 639px) {
  .cinematic-poster, .cinematic-video { object-position: var(--hero-video-position-mobile, 50% 50%); }
  .cinematic-heading { font-size: clamp(44px, 12vw, 63px); letter-spacing: -.055em; }
  .cinematic-description span {display:block;white-space:nowrap}
  .cinematic-eyebrow { font-size: 10px; margin-bottom: 22px; letter-spacing: .03em; }
  .cinematic-description { font-size:clamp(14px,3.7vw,15px); max-width:none; width:100%; margin-top:clamp(36px,11.3vw,48px); line-height:1.65; }
}
@media (max-width: 1023px) and (hover: none) and (pointer: coarse) and (orientation: landscape) {
  [data-home-hero="cinematic"] { padding-top: 44px; padding-bottom: 96px; min-height: 0; }
  .cinematic-heading { font-size: clamp(40px, 7.5vw, 72px); }
}
@media (hover: none) and (pointer: coarse) {
  [data-home-hero="cinematic"] { min-height: 0; }
}
[data-home-hero="cinematic"] { border-radius:0; margin-top:calc(-1 * var(--home-header-height)); padding-top:calc(clamp(96px,8vw,152px) + var(--home-header-height)); }
@media(max-width:767px){body:has([data-home-hero="cinematic"]){--home-header-height:var(--hero-stable-header-height,max(63.3px,calc(var(--home-env-top) + 52.65px)))}[data-home-hero="cinematic"]{padding-top:calc(40px + var(--home-header-height))}}
@media(max-width:1023px) and (hover:none) and (pointer:coarse) and (orientation:landscape){[data-home-hero="cinematic"]{padding-top:calc(44px + var(--home-header-height))}}
[data-home-hero="cinematic"][data-stable-touch] {min-height:0}
@media(max-width:767px){html:not(.capacitor) body:has([data-home-hero="cinematic"]) #platform-header-root .platform-header-row{padding-top:var(--hero-stable-row-top,max(var(--home-env-top),10.65px))}}
@media (prefers-reduced-motion: reduce) {
  body:has([data-home-hero="cinematic"]) #platform-header-root, body:has([data-home-hero="cinematic"]) #platform-header-root > header {transition:none}
  body:has([data-home-hero="cinematic"]) #platform-header-root [data-home-phone-start] {translate:none !important; transition:opacity 150ms linear,visibility 0s linear 0s !important}
  body:has([data-home-hero="cinematic"]) #platform-header-root:not([data-home-cta="shown"]) [data-home-phone-start] {transition:opacity 150ms linear,visibility 0s linear 150ms !important}
  .cinematic-video { transition: none; }
  .cinematic-phrase { animation: none !important; }
  .cinematic-signup button, .cinematic-primary { transition: none; }
}
`
