"use client"

/**
 * ===========================================================================
 *  SELL EVERYWHERE: THE DOTTED WORLD (home, section 12)
 * ===========================================================================
 * Black, one large dotted map, and orders arriving: small cards for a tee in
 * Berlin, presets in Tokyo, a course in London, a membership in Sydney, each
 * in the price its buyer reads, gliding over the map while the city pulses.
 *
 * THE MAP is a land mask of 160 x 61 cells (2.25 degrees each, latitude 80 to
 * -58, Antarctica left out) packed into 1,220 bytes of base64 below. It was
 * made once from Natural Earth's public domain 1:110m countries. On the first
 * frame the section is near the screen, the dots become ONE svg <path> (a
 * zero length segment per dot with round caps): one element instead of three
 * thousand, nothing sent in the HTML, no geo library.
 *
 * MOTION. Cards and pulses are CSS loops of transform and opacity, paused
 * while the section is offscreen or the tab is hidden. On a phone the map is
 * wider than the screen and pans slowly from the Americas to Asia, so every
 * card passes by. Reduced motion: still map, four cards shown, no pan.
 *
 * PRICES. Each is in a currency checkout charges in
 * (lib/payments/fees/currency-rules), except where the truth is dollars:
 * memberships bill in US dollars wherever the member is
 * (lib/money/product-currency PLAN_CURRENCY), and São Paulo pays in dollars.
 */
import type { SectionStyle } from "./lazy-section"
import { useEffect, useState } from "react"
import { StoryHeading } from "../story-heading"
import { COMMERCE_CURRENCY_COUNT, COMMERCE_KIT_STYLE, CommerceKitStyle, useCommerceLive } from "./commerce-kit"

const IMG = "/home/commerce"

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

/** Longitude and latitude to the map's cells. */
function at(lat: number, lng: number) {
  const { cols, rows, top, step } = COMMERCE_LAND
  return { x: (lng + 180) / step, y: (top - lat) / step, px: ((lng + 180) / step / cols) * 100, py: ((top - lat) / step / rows) * 100 }
}

const ORDERS = [
  { city: "Berlin", lat: 52.52, lng: 13.41, kind: "Fashion", title: "Heavyweight tee", price: "€24", img: "product-tee.webp", side: "r" },
  { city: "Austin", lat: 30.27, lng: -97.74, kind: "Online store", title: "Maya Ellis Studio", price: "$49", img: "creator-maya.webp", side: "l" },
  { city: "Sydney", lat: -33.87, lng: 151.21, kind: "Membership", title: "Inner Circle", price: "$12/mo", img: "float-member.webp", side: "l" },
  { city: "London", lat: 51.51, lng: -0.13, kind: "Course", title: "Shoot in manual", price: "£79", img: "course-camera.webp", side: "l" },
  { city: "Tokyo", lat: 35.68, lng: 139.69, kind: "Digital download", title: "Golden Hour presets", price: "¥2,900", img: "art-golden.webp", side: "l" },
  { city: "São Paulo", lat: -23.55, lng: -46.63, kind: "Digital album", title: "Night Swim", price: "$9", img: "art-waves.webp", side: "r" },
  { city: "Toronto", lat: 43.65, lng: -79.38, kind: "Fashion", title: "Washed dad cap", price: "C$38", img: "float-cap.webp", side: "r" },
] as const
const CYCLE = 14

/* Arcs between buyers, drawn faintly; they brighten in turn. */
const ARCS: [number, number][] = [
  [1, 3],
  [3, 0],
  [0, 4],
  [6, 0],
  [5, 3],
  [4, 2],
]

export function SellEverywhereMap() {
  const [ref, live] = useCommerceLive<HTMLElement>("300px 0px")
  const [dots, setDots] = useState("")
  useEffect(() => {
    if (live && !dots) setDots(commerceLandPath())
  }, [live, dots])

  const pts = ORDERS.map((o) => at(o.lat, o.lng))
  return (
    <section ref={ref} className="cmm" data-story-section="sell-everywhere" aria-labelledby="cmm-title">
      <CommerceKitStyle />
      <style href="w12-commerce-map" precedence="default">
        {MAP_CSS}
      </style>
      <div className="cmm-wrap">
        <div className="story-section-heading cmm-head">
          <p className="story-eyebrow">Sell everywhere</p>
          <StoryHeading id="cmm-title" text="Your store never closes. Fans buy from anywhere." accent={["anywhere"]} dark />
          <p>Prices in a fan&apos;s own currency, cards and wallets from around the world, and downloads delivered the second they pay, whatever the time zone.</p>
        </div>
      </div>

      <div className="cmm-map" role="img" aria-label="A world map with orders arriving: a tee in Berlin for €24, presets in Tokyo for ¥2,900, a course in London for £79, a membership in Sydney for $12 a month, and more.">
        <div className="cmm-pan" aria-hidden="true">
          <svg className="cmm-svg" viewBox={`0 0 ${COMMERCE_LAND.cols} ${COMMERCE_LAND.rows}`} preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="cmm-arc" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#a78bfa" stopOpacity="0" />
                <stop offset=".5" stopColor="#c4b5fd" stopOpacity=".9" />
                <stop offset="1" stopColor="#818cf8" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={dots} fill="none" stroke="#3b3b45" strokeWidth=".64" strokeLinecap="round" />
            {ARCS.map(([a, b], i) => {
              const p = pts[a]
              const q = pts[b]
              const mx = (p.x + q.x) / 2
              const my = (p.y + q.y) / 2 - Math.min(14, Math.abs(q.x - p.x) * 0.28 + 3)
              return <path key={i} className="cmm-arc" d={`M${p.x} ${p.y}Q${mx} ${my} ${q.x} ${q.y}`} style={{ "--i": i } as React.CSSProperties} />
            })}
            {pts.map((p, i) => (
              <g key={i} transform={`translate(${p.x} ${p.y})`}>
                <circle className="cmm-ring" r="2.4" style={{ "--i": i } as React.CSSProperties} />
                <circle r=".75" fill="#c4b5fd" />
              </g>
            ))}
          </svg>
          {ORDERS.map((o, i) => (
            <div key={o.city} className="cmm-card" data-side={o.side} data-still={i % 2 === 0 || undefined} style={{ left: `${pts[i].px}%`, top: `${pts[i].py}%`, "--i": i } as React.CSSProperties}>
              <div className="cmm-card-in">
                <img src={`${IMG}/${o.img}`} alt="" loading="lazy" decoding="async" width={88} height={88} />
                <span className="cmm-card-t">
                  <small>
                    {o.kind} · {o.city}
                  </small>
                  <b>{o.title}</b>
                </span>
                <span className="cmm-card-p">
                  <b>{o.price}</b>
                  <small>
                    <i />
                    New order
                  </small>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="cmm-wrap">
        <ul className="cmm-facts">
          <li>
            <b>{COMMERCE_CURRENCY_COUNT} currencies</b>
            <span>at checkout, so fans see a price they understand</span>
          </li>
          <li>
            <b>Cards and wallets</b>
            <span>Apple Pay, Google Pay and cards from around the world</span>
          </li>
          <li>
            <b>Instant delivery</b>
            <span>downloads, courses and memberships the moment they pay</span>
          </li>
        </ul>
        <p className="cmm-fine">Example orders. Memberships bill in US dollars wherever the member is.</p>
      </div>
    </section>
  )
}

const MAP_CSS = `
.cmm{position:relative;background:#000;color:#fff;border-radius:clamp(28px,4vw,56px);overflow:clip;isolation:isolate}
.cmm-wrap{max-width:1320px;margin:0 auto;padding:0 var(--landing-gutter,clamp(20px,5vw,72px))}
.cmm-head>p:last-child{color:#a1a1aa}
.cmm-head .story-eyebrow{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);color:#c4b5fd}
.cmm-map{position:relative;max-width:1480px;margin:clamp(28px,4vw,56px) auto 0;overflow:hidden;padding:0 clamp(0px,2vw,40px)}
.cmm-pan{position:relative;aspect-ratio:160/61}
.cmm-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cmm-arc{fill:none;stroke:url(#cmm-arc);stroke-width:.32;opacity:.12;animation:cmm-arc ${CYCLE}s ease-in-out infinite;animation-delay:calc(var(--i) * ${CYCLE / 6}s - ${CYCLE}s);animation-play-state:paused}
@keyframes cmm-arc{0%,100%{opacity:.12}12%,24%{opacity:.9}40%{opacity:.12}}
.cmm-ring{fill:none;stroke:#a78bfa;stroke-width:.3;transform-box:fill-box;transform-origin:center;opacity:0;animation:cmm-ring 3.2s ease-out infinite;animation-delay:calc(var(--i) * .7s);animation-play-state:paused}
@keyframes cmm-ring{0%{opacity:.9;transform:scale(.2)}70%,100%{opacity:0;transform:scale(1.6)}}
.cmm-card{position:absolute;z-index:2;width:0;height:0}
.cmm-card-in{position:absolute;bottom:10px;display:flex;align-items:center;gap:10px;width:max-content;max-width:320px;padding:8px 12px 8px 8px;border-radius:16px;background:rgba(20,20,24,.95);border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 40px -16px rgba(0,0,0,.8),0 0 0 1px rgba(0,0,0,.4);opacity:0;animation:cmm-card ${CYCLE}s cubic-bezier(.2,.8,.2,1) infinite;animation-delay:calc(var(--i) * ${CYCLE / ORDERS.length}s - ${CYCLE}s);animation-play-state:paused}
.cmm-card[data-side=l] .cmm-card-in{right:-14px}
.cmm-card[data-side=r] .cmm-card-in{left:-14px}
.cmm-card-in img{width:44px;height:44px;border-radius:10px;object-fit:cover;background:#f1f1f3;flex:none}
.cmm-card-t{min-width:0}
.cmm-card-t small{display:block;font-size:11px;color:#a1a1aa;white-space:nowrap}
.cmm-card-t b{display:block;font-size:13.5px;font-weight:600;white-space:nowrap}
.cmm-card-p{text-align:right;padding-left:10px;flex:none}
.cmm-card-p b{display:block;font-size:16px;font-weight:600;letter-spacing:-.01em;white-space:nowrap}
.cmm-card-p small{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:#86efac;white-space:nowrap}
.cmm-card-p i{width:6px;height:6px;border-radius:50%;background:#22c55e}
@keyframes cmm-card{0%{opacity:0;transform:translate3d(-12px,10px,0) scale(.94)}5%{opacity:1;transform:translate3d(-4px,0,0) scale(1)}26%{opacity:1;transform:translate3d(10px,-4px,0) scale(1)}31%,100%{opacity:0;transform:translate3d(18px,-8px,0) scale(.97)}}
[data-commerce-live] .cmm-arc,[data-commerce-live] .cmm-ring,[data-commerce-live] .cmm-card-in,[data-commerce-live] .cmm-pan{animation-play-state:running}
.cmm-facts{list-style:none;margin:clamp(28px,4vw,48px) 0 0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.cmm-facts li{padding:22px 24px;border-radius:24px;background:#111114;border:1px solid rgba(255,255,255,.07)}
.cmm-facts b{display:block;font-size:clamp(22px,2.2vw,30px);font-weight:400;letter-spacing:-.03em}
.cmm-facts span{display:block;margin-top:6px;font-size:14.5px;line-height:1.5;color:#a1a1aa}
.cmm-fine{margin:14px 4px 0;font-size:12.5px;color:#71717a}
@media (max-width:767px){
  .cmm-map{padding:56px 0 0}
  .cmm-pan{width:250vw;animation:cmm-pan 48s ease-in-out infinite alternate;animation-play-state:paused}
  @keyframes cmm-pan{from{transform:translate3d(0,0,0)}to{transform:translate3d(calc(-150vw + 4px),0,0)}}
  .cmm-card-in{max-width:230px;padding:7px 10px 7px 7px;gap:8px}
  .cmm-card-in img{width:38px;height:38px}
  .cmm-facts{grid-template-columns:1fr}
  .cmm-facts li{padding:18px 20px;border-radius:20px}
}
@media (prefers-reduced-motion:reduce){
  .cmm-pan,.cmm-arc,.cmm-ring,.cmm-card-in{animation:none!important}
  .cmm-pan{transform:none}
  .cmm-card[data-still] .cmm-card-in{opacity:1}
  .cmm-ring{opacity:.6}
}
`

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const SELL_EVERYWHERE_STYLES: readonly SectionStyle[] = [COMMERCE_KIT_STYLE, { href: "w12-commerce-map", precedence: "default", css: MAP_CSS }]
