"use client"

/**
 * ===========================================================================
 *  SELL EVERYWHERE: ONE STORE, EVERY COUNTRY (home, section 12, wave 13)
 * ===========================================================================
 * The owner: not a full-width black band but a black card inside the page's
 * width, with a soft violet glow; a dotted world map with orders and
 * "Shipped" signals coming and going across it; a column of flags on the
 * left (the active one lit), a product card whose button is in that
 * country's own language, and a pill with the order in that country's
 * money; a short title and one sentence at the bottom left.
 *
 * THE COUNTRIES are ones whose language Storelib's storefront speaks (the
 * "Buy now" of lib/i18n/catalog/<lang>.ts, word for word) and whose money its
 * checkout charges in (lib/payments/fees/currency-rules: EUR, GBP, USD).
 * Brazil pays in US dollars, as checkout would charge it, written the
 * Brazilian way. The store is Hollow Pines, the same fictional outdoor
 * channel as the email in section 10, with its merch.
 *
 * THE MAP is a land mask of 160 x 61 cells (2.25 degrees each, latitude 80 to
 * -58, Antarctica left out) packed into 1,220 bytes of base64 below. It was
 * made once from Natural Earth's public domain 1:110m countries. On the first
 * frame the section is near the screen, the dots become ONE svg <path> (a
 * zero length segment per dot with round caps): one element instead of three
 * thousand, nothing sent in the HTML, no geo library.
 *
 * MOTION. The country changes every 3.2s while the section is on screen (one
 * small render: a few inline transforms and two words). Cards, flags and the
 * pill move by transform and opacity only, on the compositor. The signals
 * on the map are CSS loops, paused while the section is off screen or the
 * tab is hidden (the data-commerce-live attribute). Reduced motion: one still country,
 * a few signals shown, nothing moving.
 */
import type { SectionStyle } from "./lazy-section"
import { useEffect, useState, type CSSProperties } from "react"
import { StoryHeading } from "../story-heading"
import { COMMERCE_KIT_STYLE, CommerceKitStyle, useCommerceLive } from "./commerce-kit"

const PHOTO_DIR = "/home/sell-map"

export const COMMERCE_LAND = {
  cols: 160,
  rows: 61,
  top: 80,
  step: 2.25,
  b64: "AAAAAGO8f//+AAeAAAAAFgAAAAAAAAAxBvh///wAAAAABgAHwAAAAAAAAEAAAAH//gAAAABAA/+AAAAAAAAA/5j+Af/4AAAAAYF///+DwAAA/4eP7h/A//wAAHwAA3/////+CMH///7/8uD/gAAD/8v/f///////I/////+B0HwDwAffP/////////8I/////wDgeAAAHz///////////wH////8B4AYAAA/f/////////nwADAf//4H8AAAABY////////+AQAAQAf//4P4AAAGCn////////gHAAAAA///5/4AAAkN////////+AYAAAAB///3/gAAA7//////////BAAAAAB////CAAAA//////////0AAAAAAD///+GAAAH//////////QAAAAAAf///2AAAAfn5+f/////4AAAAAAB///+AAAAPhPA5/////8MAAAAAAH///gAAAA8BZ/3/////ggAAAAAAf//+AAAADwBv/P////CCAAAAAAA///wAAAAE+AL//////M4AAAAAAB//+AAAAAf4AP/////8GAAAAAAAD//wAAAAD/5h//////wAAAAAAAAD/RAAAAAP//z7/////AAAAAAAAAX4EAAAAD///vz////8AAAAAAAAAvgAAAAAf///foP///gAAAAAAAAAeAgAAAB///9/wf9/5AAAAAAAAAB4ggAAAH///z/A/n4AAAAAAAAAAD+EIAAAf///v4D4PgAAAAAAAAAAAwAAAAB///+eAHA/BAAAAAAAAAAA4AAAAH////gAcA+CAAAAAAAAAAAhAAAAf///4gAgAwMAAAAAAAAAAAv4AAA////8ACAACAAAAAAAAAAAA/wAAB////wAEAgBAAAAAAAAAAAD/4AACD//+AAAFBgAAAAAAAAAAAf/gAAAD//wAAAccAAAAAAAAAAAD//AAAAP/+AAAAzwAAAAAAAAAAAP//AAAA//wAAABnQUAAAAAAAAAA///gAAB//AAAACBg+QAAAAAAAAD///AAAD/4AAAAFAA8AAAAAAAAAH//8AAAP/wAAAAAgBQQAAAAAAAAf//wAAA//AAAAAAAAAAAAAAAAAA//+AAAD/8AAAAAAMQAAAAAAAAAB//4AAAf/xAAAAAH5gAAAAAAAAAD//gAAB/8MAAAAA/+AAAAAAAAAAH/8AAAD/gwAAAAH/8AAAAAAAAAAf/gAAAP/GAAAAB//4AAAAAAAAAB/4AAAA/4YAAAAP//wAAAAAAAAAH/AAAAB/gAAAAAf//AAAAAAAAAA/8AAAAH8AAAAAB//8AAAAAAAAAD/gAAAAPgAAAAAH//wAAAAAAAAAP8AAAAA8AAAAAAeD+AAAAAAAAAA/gAAAAAAAAAAAAAD4AQAAAAAAAH8AAAAAAAAAAAAAAHAAgAAAAAAAfAAAAAAAAAAAAAAAAACAAAAAAAA8AAAAAAAAAAAAAAAQAgAAAAAAAHgAAAAAAAAAAAAAAAAMAAAAAAAAeAAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAAAAAAAAAAAAAAGEAAAAAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
} as const

/** The dots as one path: "M x y h0" per land cell. */
export function commerceLandPath(): string {
  const { cols, rows, b64 } = COMMERCE_LAND
  const bin = atob(b64)
  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const byte = bin.charCodeAt(r * (cols / 8) + (c >> 3))
      if (byte & (0x80 >> (c & 7))) out.push(`M${c + 0.5} ${r + 0.5}h0`)
    }
  }
  return out.join("")
}

/** Longitude and latitude to the map, as percentages of its box. */
function at(lat: number, lng: number) {
  const { cols, rows, top, step } = COMMERCE_LAND
  return { px: ((lng + 180) / step / cols) * 100, py: ((top - lat) / step / rows) * 100 }
}

/** The countries the card cycles through: the storefront's own "Buy now", the order in the buyer's money. */
export const SELL_COUNTRIES = [
  { code: "GB", country: "United Kingdom", lang: "en-GB", buy: "Buy now", total: "£56.00", photo: "ridge-hoodie.webp", product: "Ridge hoodie" },
  { code: "DE", country: "Germany", lang: "de", buy: "Jetzt kaufen", total: "32,00 €", photo: "705-tee.webp", product: "705 tee" },
  { code: "FR", country: "France", lang: "fr", buy: "Acheter", total: "28,00 €", photo: "trail-cap.webp", product: "Trail cap" },
  { code: "BR", country: "Brazil", lang: "pt-BR", buy: "Comprar agora", total: "US$ 26,00", photo: "everyday-tee.webp", product: "Everyday tee" },
  { code: "IT", country: "Italy", lang: "it", buy: "Acquista ora", total: "64,00 €", photo: "ridge-hoodie.webp", product: "Ridge hoodie" },
  { code: "ES", country: "Spain", lang: "es", buy: "Comprar ahora", total: "32,00 €", photo: "705-tee.webp", product: "705 tee" },
] as const
const N = SELL_COUNTRIES.length
const STEP_MS = 3200

/* Signals on the map: a dot each, some with a word that comes and goes. */
const PINS: Array<{ lat: number; lng: number; say?: "Shipped" | "New order"; left?: boolean }> = [
  { lat: 52.52, lng: 13.41, say: "Shipped" },
  { lat: 48.86, lng: 2.35 },
  { lat: 51.5, lng: -0.13, say: "New order", left: true },
  { lat: 40.4, lng: -3.7 },
  { lat: 45.46, lng: 9.19 },
  { lat: 40.7, lng: -74, say: "Shipped" },
  { lat: 34.05, lng: -118.24 },
  { lat: 43.65, lng: -79.38, say: "New order", left: true },
  { lat: 19.4, lng: -99.1 },
  { lat: -23.55, lng: -46.63, say: "Shipped" },
  { lat: 6.5, lng: 3.4 },
  { lat: -33.9, lng: 18.4, say: "New order" },
  { lat: 25.2, lng: 55.3 },
  { lat: 19.1, lng: 72.9, say: "Shipped" },
  { lat: 1.35, lng: 103.8 },
  { lat: 37.6, lng: 127 },
  { lat: 35.68, lng: 139.69, say: "New order", left: true },
  { lat: -33.87, lng: 151.21, say: "Shipped", left: true },
]

const flagSrc = (code: string) => `/flags/${code}.svg`

export function SellEverywhereMap() {
  const [ref, live] = useCommerceLive<HTMLElement>("300px 0px")
  const [dots, setDots] = useState("")
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (live && !dots) setDots(commerceLandPath())
  }, [live, dots])
  useEffect(() => {
    if (!live) return
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => setActive((a) => (a + 1) % N), STEP_MS)
    return () => window.clearInterval(id)
  }, [live])

  /* The pill: two slots that take turns, so a new order fades in over the last. */
  const slotA = active % 2 === 0 ? active : (active + N - 1) % N
  const slotB = active % 2 === 1 ? active : (active + N - 1) % N

  return (
    <section ref={ref} className="cmm" data-story-section="sell-everywhere" aria-labelledby="cmm-title">
      <CommerceKitStyle />
      <style href="w12-commerce-map" precedence="default">
        {MAP_CSS}
      </style>
      <div className="cmm-wrap">
        <div className="cmm-head">
          <StoryHeading id="cmm-title" text="Your store never closes. Fans buy from anywhere." accent={["anywhere"]} />
        </div>

        <div className="cmm-card">
          <div
            className="cmm-world"
            role="img"
            aria-label={`A world map with orders arriving and shipping across it, and one Storelib product page in ${N} countries, its button in each country's language (${SELL_COUNTRIES.map((c) => c.buy).join(", ")}) and each order in local money (${SELL_COUNTRIES.map((c) => c.total).join(", ")}).`}
          >
            <div className="cmm-map" aria-hidden="true">
              <svg className="cmm-svg" viewBox={`0 0 ${COMMERCE_LAND.cols} ${COMMERCE_LAND.rows}`} preserveAspectRatio="xMidYMid meet">
                <path d={dots} fill="none" stroke="#5a4c86" strokeWidth=".62" strokeLinecap="round" />
              </svg>
              {PINS.map((p, i) => {
                const { px, py } = at(p.lat, p.lng)
                return (
                  <span key={i} className="cmm-pin" data-left={p.left || undefined} data-say={p.say ? "" : undefined} style={{ left: `${px}%`, top: `${py}%`, "--d": `${(i * 0.83) % 9}s` } as CSSProperties}>
                    <i />
                    {p.say ? <b>{p.say}</b> : null}
                  </span>
                )
              })}
            </div>
          </div>

          <ul className="cmm-flags" aria-hidden="true" style={{ "--a": active } as CSSProperties}>
            {SELL_COUNTRIES.map((c, i) => (
              <li key={c.code} data-on={i === active || undefined}>
                <img src={flagSrc(c.code)} alt="" width={36} height={27} loading="lazy" decoding="async" />
              </li>
            ))}
          </ul>

          <div className="cmm-stage" aria-hidden="true">
            {SELL_COUNTRIES.map((c, i) => {
              let rel = (i - active + N) % N
              if (rel > N / 2) rel -= N
              const pos = rel === 0 ? "c" : rel === 1 ? "r" : rel === -1 ? "l" : rel > 0 ? "rr" : "ll"
              return (
                <div key={c.code} className="cmm-prod" data-pos={pos} lang={c.lang}>
                  <img src={`${PHOTO_DIR}/${c.photo}`} alt="" width={480} height={600} loading="lazy" decoding="async" />
                  <span className="cmm-buy">{c.buy}</span>
                </div>
              )
            })}
            <div className="cmm-pill">
              {[slotA, slotB].map((k, i) => (
                <span key={i} className="cmm-pill-in" data-on={k === active || undefined}>
                  <img src={flagSrc(SELL_COUNTRIES[k].code)} alt="" width={20} height={15} loading="lazy" decoding="async" />
                  Order for {SELL_COUNTRIES[k].total}
                </span>
              ))}
            </div>
          </div>

          <div className="cmm-copy">
            <h3>Checkout in their language</h3>
            <p>Fans buy in their own language and currency, with cards, Apple Pay and Google Pay. Digital orders arrive the second they pay, whatever the time zone.</p>
          </div>
          <p className="cmm-fine">Example store and orders</p>
        </div>
      </div>
    </section>
  )
}

const MAP_CSS = `
.cmm{position:relative;background:#fff;color:#0f0e13;padding:clamp(72px,9vw,128px) 0}
.cmm-wrap{max-width:1400px;margin:0 auto;padding:0 var(--landing-gutter,22px)}
.cmm-head{max-width:920px;margin-bottom:clamp(36px,4.5vw,56px)}
.cmm-card{position:relative;isolation:isolate;overflow:hidden;border-radius:32px;color:#fff;background:radial-gradient(38% 60% at 20% 46%,rgba(124,58,237,.34) 0%,rgba(124,58,237,0) 70%),radial-gradient(40% 50% at 78% 108%,rgba(139,92,246,.2) 0%,rgba(139,92,246,0) 70%),radial-gradient(30% 40% at 70% 10%,rgba(91,33,182,.14) 0%,rgba(91,33,182,0) 70%),#0a090d;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);height:680px}
.cmm-world{position:absolute;z-index:0;right:24px;top:118px;width:65%}
.cmm-map{position:relative;aspect-ratio:160/61}
.cmm-svg{position:absolute;inset:0;width:100%;height:100%}
.cmm-pin{position:absolute;width:0;height:0}
.cmm-pin i{position:absolute;left:-3.5px;top:-3.5px;width:7px;height:7px;border-radius:50%;background:#a78bfa;box-shadow:0 0 0 3px rgba(167,139,250,.16);opacity:.85}
.cmm-pin i::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:1.5px solid rgba(196,181,253,.7);opacity:0;animation:cmm-ping 9s ease-out infinite;animation-delay:var(--d);animation-play-state:paused}
@keyframes cmm-ping{0%{opacity:.9;transform:scale(.3)}12%,100%{opacity:0;transform:scale(1.7)}}
.cmm-pin b{position:absolute;top:-9px;left:12px;font-size:13px;font-weight:500;line-height:18px;color:#ede9fe;white-space:nowrap;opacity:0;transform:translate3d(-4px,0,0);animation:cmm-say 9s cubic-bezier(.2,.8,.2,1) infinite;animation-delay:var(--d);animation-play-state:paused}
.cmm-pin[data-left] b{left:auto;right:12px;transform:translate3d(4px,0,0)}
@keyframes cmm-say{0%{opacity:0;transform:translate3d(-4px,0,0)}5%,32%{opacity:1;transform:none}38%,100%{opacity:0;transform:none}}
[data-commerce-live] .cmm-pin i::after,[data-commerce-live] .cmm-pin b{animation-play-state:running}
.cmm-flags{position:absolute;z-index:2;left:36px;top:48px;width:76px;height:420px;margin:0;padding:0;list-style:none;overflow:hidden;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 22%,#000 78%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 22%,#000 78%,transparent 100%)}
.cmm-flags li{position:absolute;left:4px;top:0;width:68px;height:68px;display:flex;align-items:center;justify-content:center;border-radius:16px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);opacity:.5;transition:transform .9s cubic-bezier(.22,1,.36,1),opacity .5s ease-out}
.cmm-flags li[data-on]{opacity:1;background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 10px 24px -12px rgba(0,0,0,.8)}
.cmm-flags img{width:36px;height:27px;border-radius:4px;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.2)}
${SELL_COUNTRIES.map((_, i) => `.cmm-flags li:nth-child(${i + 1}){transform:translate3d(0,calc((${i} - var(--a)) * 84px + 176px),0)}`).join("\n")}
.cmm-stage{position:absolute;z-index:1;left:176px;top:64px;width:244px;height:360px}
.cmm-prod{position:absolute;inset:0 0 auto 0;padding:14px;border-radius:14px;background:#fff;box-shadow:0 30px 60px -24px rgba(0,0,0,.75);transition:transform .9s cubic-bezier(.22,1,.36,1),opacity .6s ease-out}
.cmm-prod img{display:block;width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:6px;background:#f2f2f0}
.cmm-buy{display:flex;align-items:center;justify-content:center;height:46px;margin-top:12px;border-radius:8px;background:#141217;color:#fff;font-size:15px;font-weight:500;letter-spacing:.005em;box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}
.cmm-prod::after{content:"";position:absolute;inset:0;border-radius:inherit;background:#0e0c14;opacity:.62;transition:opacity .9s cubic-bezier(.22,1,.36,1)}
.cmm-prod[data-pos=c]{z-index:3;transform:none;opacity:1}
.cmm-prod[data-pos=c]::after{opacity:0}
.cmm-prod[data-pos=l]{z-index:2;transform:translate3d(-34%,4%,0) scale(.86);opacity:1}
.cmm-prod[data-pos=r]{z-index:2;transform:translate3d(34%,4%,0) scale(.86);opacity:1}
.cmm-prod[data-pos=ll]{z-index:1;transform:translate3d(-60%,8%,0) scale(.74);opacity:0}
.cmm-prod[data-pos=rr]{z-index:1;transform:translate3d(60%,8%,0) scale(.74);opacity:0}
.cmm-pill{position:absolute;z-index:4;left:184px;top:150px;display:grid;width:max-content}
.cmm-pill-in{grid-area:1/1;display:inline-flex;align-items:center;gap:12px;height:56px;padding:0 24px 0 8px;border-radius:999px;background:#fff;color:#141217;font-size:16px;font-weight:500;white-space:nowrap;box-shadow:0 18px 40px -16px rgba(0,0,0,.7),0 0 0 1px rgba(0,0,0,.04);opacity:0;transform:translate3d(-10px,8px,0) scale(.96);transition:opacity .45s ease-out,transform .7s cubic-bezier(.22,1,.36,1)}
.cmm-pill-in[data-on]{opacity:1;transform:none;transition-delay:.25s}
.cmm-pill-in img{width:40px;height:40px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.cmm-copy{position:absolute;z-index:2;left:48px;bottom:44px;max-width:600px}
.cmm-fine{position:absolute;z-index:2;right:28px;bottom:24px;margin:0;font-size:12px;color:#6f6a80}
.cmm-copy h3{margin:0;font-size:clamp(22px,2vw,28px);font-weight:500;letter-spacing:-.02em;line-height:1.2}
.cmm-copy p{margin:10px 0 0;font-size:clamp(15px,1.25vw,17px);line-height:1.55;color:#a7a3b5}
@media (max-width:1023px){
  .cmm-card{height:auto;display:flex;flex-direction:column;padding:28px 0 30px;border-radius:26px}
  .cmm-world{position:relative;right:auto;top:auto;width:auto;order:1;height:clamp(150px,40vw,300px);overflow:hidden}
  .cmm-map{position:absolute;left:50%;top:50%;width:112%;transform:translate3d(-50%,-50%,0)}
  .cmm-pin b{font-size:11px;top:-8px;left:9px}
  .cmm-pin[data-left] b{right:9px}
  .cmm-pin i{width:5px;height:5px;left:-2.5px;top:-2.5px}
  .cmm-flags{position:relative;order:2;left:auto;top:auto;width:auto;height:auto;margin:14px auto 0;display:flex;gap:8px;overflow:visible;-webkit-mask-image:none;mask-image:none}
  .cmm-flags li{position:relative;left:auto;width:44px;height:44px;border-radius:12px;transform:none!important}
  .cmm-flags img{width:26px;height:19px;border-radius:3px}
  .cmm-stage{position:relative;order:3;left:auto;top:auto;width:220px;height:372px;margin:22px auto 0}
  .cmm-prod{padding:11px;border-radius:12px}
  .cmm-buy{height:40px;margin-top:10px;font-size:14px}
  .cmm-prod[data-pos=l]{transform:translate3d(-30%,5%,0) scale(.84)}
  .cmm-prod[data-pos=r]{transform:translate3d(30%,5%,0) scale(.84)}
  .cmm-pill{left:50%;top:auto;bottom:0;transform:translate3d(-50%,0,0)}
  .cmm-pill-in{height:46px;gap:10px;padding:0 18px 0 6px;font-size:14.5px}
  .cmm-pill-in img{width:34px;height:34px}
  .cmm-copy{position:relative;order:4;left:auto;bottom:auto;margin:22px 24px 0;max-width:none}
  .cmm-fine{position:relative;order:5;right:auto;bottom:auto;margin:14px 24px 0}
}
@media (max-width:639px){
  .cmm-card{border-radius:22px;padding:22px 0 24px}
  .cmm-copy{margin:20px 20px 0}
  .cmm-fine{margin:12px 20px 0}
}
@media (prefers-reduced-motion:reduce){
  .cmm-pin i::after,.cmm-pin b{animation:none!important}
  .cmm-pin[data-say]:nth-child(4n+1) b{opacity:1;transform:none}
  .cmm-flags li,.cmm-prod,.cmm-prod::after,.cmm-pill-in{transition:none}
}
`

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const SELL_EVERYWHERE_STYLES: readonly SectionStyle[] = [COMMERCE_KIT_STYLE, { href: "w12-commerce-map", precedence: "default", css: MAP_CSS }]
