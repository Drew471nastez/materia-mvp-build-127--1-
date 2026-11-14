"use client"

/**
 * ===========================================================================
 *  SELL ANYWHERE: ONE STORE, PRICED FOR EVERY COUNTRY (home, section 12)
 * ===========================================================================
 * LANDING ROUND, THE OWNER: the size and calm of a normal width card with
 * modest height; a clean, accurate dotted map whose markers never sit on top
 * of each other; an autoplay with no lag.
 *
 * LANDING ROUND 5, THE OWNER: "a mix of digital products and physical
 * products, not only physical. And don't add the pill shape there with the
 * example." Three of the six are digital now (a LUT pack, a drone filming
 * course, an e-book), each saying under its name how it arrives, and the
 * Example tag is gone.
 *
 * LANDING ROUND 4, THE OWNER (this reverses the first round's "never the
 * words on the button"): as the country changes, the PRODUCT changes too, a
 * real photograph of a physical product, and the Buy now button speaks that
 * country's language. Wider on a phone, smoother, and a quiet dot grid on
 * the dark card.
 *
 * THE CARD. A column of flags, one product card (photo, name, price and the
 * storefront's buy button in the buyer's language) and the map beside them,
 * one title and one line under the product. Every few seconds the next
 * country is chosen: its flag lights, the product, its price in that money
 * and the button's words cross fade to the next, and its city on the map
 * shows the order. The country before it says Shipped as it fades.
 *
 * THE COUNTRIES are ones whose money Storelib's checkout charges in
 * (lib/payments/fees/currency-rules: USD, EUR, JPY, CAD, AUD), each written
 * the way that country writes it, and the button in the words a storefront
 * there uses. The store is Hollow Pines, the fictional outdoor channel of
 * section 10, and its merch: a tee, an enamel camp mug, a steel bottle, a
 * beanie, a canvas tote and a washed cap (Unsplash photographs, cropped 4:5,
 * public/home/sell-map).
 *
 * THE MAP is a land mask of 240 x 90 cells (1.5 degrees each, latitude 80 to
 * -55), packed into 2,700 bytes of base64 below. It was made once from
 * Natural Earth's public domain 1:50m land polygons, a cell counting as land
 * when at least three of nine points in it are. On the first frame the
 * section is near the screen the dots become ONE svg <path> (a zero length
 * segment per dot, round caps): one element, nothing in the HTML, no geo
 * library. Every marker sits on the centre of a land dot, and no two markers
 * or labels are close enough to touch (tests/home-landing-lower.test.ts).
 *
 * ON A PHONE the map is not shrunk to a strip: it is drawn about twice the
 * card's width inside a window, and glides (one transform) to centre the
 * country in turn, so the orders read at a size a thumb can see.
 *
 * The flags are the one real control: pressing one chooses that country and
 * the turn carries on from there. Nothing else in the card answers the
 * pointer.
 *
 * MOTION. One small render per country (a few attributes), every 3.6s while
 * the section is on screen and the tab is visible. Everything that moves
 * (the highlight, the product, the price, the words, the labels, the ring,
 * the phone's pan, the dot grid) moves by transform and opacity, on the
 * compositor. The loops run only while live (the data-commerce-live
 * attribute). Reduced motion: the first country, still.
 */
import type { SectionStyle } from "./lazy-section"
import { useEffect, useState, type CSSProperties } from "react"
import { StoryHeading } from "../story-heading"
import { useCommerceLive } from "./commerce-kit"

const IMG = "/home/sell-map"


export const SELL_MAP = {
  cols: 240,
  rows: 90,
  top: 80,
  step: 1.5,
  b64: "AAAAAAAAOP/+P/////AAAf+AAAAAAAHcAAAAAAAAAAAAAABkCZf4/////+AAADsAAAAAAAAcAAAAAAAAAAAAAAH5nv/wP////+AAAAAAAAH8AAP/8AALAAAAAAAAAAd/oP/gAD///+AAAAAAAAcAAD//8AAOIAAAAAAAAAfwxu/4AB///8AAAAAAABwDA/////wDAAAAgAAAAAd/x8//AB///8AAAAAAABgH//////7v+AAAAA//gLI/+Of/4B///4AAAAP8AAWH/////////+C4gH//////83nH8AP//gAAAH//wLf/////////////6D/////////N/g//wAAAAH//5////////////////n////////8H7A//AP4AAP/+f///////////////AH/////////N+Af4AHwAAfz////////////////+AD///////+CM+APwAAAAD/P/////////////////AH///////8APgAHwAAAAH/P//////////////5/wAB/8/////4APzAAAAAAAH/n//////////////hwAAAHgD////8AP/AAAAAAMDeD////////////8AHgAAAZAA/////gH/gAAAAAOBuP////////////4APgAABgAAf////+f/4AAAAAeB4P////////////gAfAAAAAAAH////+f/+AAAAB3D//////////////9AOAAAAAAAD/////f/+AAAAB3n///////////////AMAAAAAAAD///////6AAAAAH////////////////AIAAAAAAAA//////+HAAAAAB////////////////AAAAAAAAAAf/////+PgAAAAH///////////////6AAAAAAAAAAf//////QAAAAAB////f5/////////wAAAAAAAAAAf//////gAAAAAB/3/zfz/////////jAAAAAAAAAAf/////gAAAAAA/+Z/gHz/////////DgAAAAAAAAAf/////gAAAAAA/wOfnH5////////4AAAAAAAAAAAf////+AAAAAAA/hjd//5////////wGAAAAAAAAAAf////8AAAAAAA/ACN//4///////hwGAAAAAAAAAAP////4AAAAAAA+LkI//8///////4wcAAAAAAAAAAH////8AAAAAAAJ/gCC/////////w78AAAAAAAAAAD////4AAAAAAAf/wAA/////////wHgAAAAAAAAAAA////gAAAAAAA//8IB/////////4MAAAAAAAAAAAA////AAAAAAAB///f//////////4AAAAAAAAAAAAAf//nAAAAAAAB//////////////4AAAAAAAAAAAAAf/wBgAAAAAAD//////7///////4AAAAAAAAAAAAAP/gBgAAAAAAH////+/5///////wAAAAAAAAAAAAAF/gAgAAAAAAP////+/+X//////wAAAAAAAAAAAAAC/gAAAAAAAAf/////f/4H/////oAAAAAAAAAAAAAAfgDwAAAAAAf/////v/8D////8IAAAAAAAAAAAAAAPgwMAAAAAAf/////v/4B/8f/AAAAAAAAAACAAAAAPxwBwAAAAAf/////n/4A/4P+wAAAAAAAAAAAAAAAD/gJAAAAAAf/////z/gA/wH+AMAAAAAAAAAAAAAAA/sAAAAAAAf/////z+AAfgF/AMAAAAAAAAAAAAAAAD+AAAAAAA///////8AAfAB/gIAAAAAAAAAAAAAAAA+AAAAAAAf//////gAAPAB/gKAAAAAAAAAAAAAAAAMBwAAAAAf/////+EAAPABvgHAAAAAAAAAAAAAAAAGH/gAAAAP//////8AAGABHACAAAAAAAAAAAAAAAAD//wAAAAH//////8AAHABgADAAAAAAAAAAAAAAAAAv/4AAAAD//////4AABgAgADAAAAAAAAAAAAAAAAAP//gAAAB/n////4AAAAAYBhAAAAAAAAAAAAAAAAAP//wAAAAAD////wAAAADYDgAAAAAAAAAAAAAAAAAP//wAAAAAA////gAAAABoPgAAAAAAAAAAAAAAAAAf//4AAAAAA////AAAAAA4fuQAAAAAAAAAAAAAABA///8AAAAAA///+AAAAAA4fgSAAAAAAAAAAAAAAAA////AAAAAA///8AAAAAAcfcCYAAAAAAAAAAAAAAA////8AAAAAf//4AAAAAAOPcr/AAAAAAAAAAAAAAA/////AAAAAP//wAAAAAAGAcA/hAAAAAAAAAAAAAA/////gAAAAP//wAAAAAADAABP2QAAAAAAAAAAAAAf////gAAAAH//4AAAAAAB+CAP4IAAAAAAAAAAAAAf////gAAAAH//4AAAAAAAArADMBAAAAAAAAAAAAAP////AAAAAH//4AAAAAAAAAAAAAAAAAAAAAAAAAAH///+AAAAAH//4AAAAAAAAAHjAAAAAAAAAAAAAAAH///8AAAAAP//4MAAAAAAAAvjAAAAAAAAAAAAAAAD///8AAAAAP//4cAAAAAAAB/jgAAAAAAAAAAAAAAB///8AAAAAP//54AAAAAAAH/7gAAAAAAAAAAAAAAAf//8AAAAAP//h4AAAAAAAH//wAAAAAAAAAAAAAAAf//8AAAAAP/+B4AAAAAAAP//4AAAAAAAAAAAAAAAf//4AAAAAH//BwAAAAAAB///8AIAAAAAAAAAAAAAf//wAAAAAH//BwAAAAAAD///+AAAAAAAAAAAAAAAf/+AAAAAAH//BwAAAAAAH////AAAAAAAAAAAAAAAf/8AAAAAAD/8AAAAAAAAD////AAAAAAAAAAAAAAA//8AAAAAAD/8AAAAAAAAD////AAAAAAAAAAAAAAA//8AAAAAAB/8AAAAAAAAD////gAAAAAAAAAAAAAA//4AAAAAAB/4AAAAAAAAD////AAAAAAAAAAAAAAA//wAAAAAAA/wAAAAAAAAB////AAAAAAAAAAAAAAA//gAAAAAAA/gAAAAAAAAB+B/+AAAAAAAAAAAAAAA//AAAAAAAAQAAAAAAAAABgAv+AAAAAAAAAAAAAAB/8AAAAAAAAAAAAAAAAAAAAAH8AAIAAAAAAAAAAAB/8AAAAAAAAAAAAAAAAAAAAAH8AAOAAAAAAAAAAAB/wAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAB/AAAAAAAAAAAAAAAAAAAAAAA4AAMAAAAAAAAAAAB/AAAAAAAAAAAAAAAAAAAAAAAYAAwAAAAAAAAAAAB+AAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAB8AAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAD8AAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AAAAAAAAAAAAAAAAAAAAAAAAAAA",
} as const

let bits: Uint8Array | null = null
/** Is the cell at column c, row r land? */
export function sellMapLand(c: number, r: number): boolean {
  const { cols, rows, b64 } = SELL_MAP
  if (c < 0 || r < 0 || c >= cols || r >= rows) return false
  if (!bits) {
    const bin = atob(b64)
    bits = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i)
  }
  return (bits[r * (cols / 8) + (c >> 3)] & (0x80 >> (c & 7))) !== 0
}

/**
 * The dots as one path in the map's own units (one unit per cell): "M x y h0"
 * per dot. `block` 2 draws one dot per 2 x 2 block that is at least half land.
 */
export function sellMapPath(block: 1 | 2 = 1): string {
  const { cols, rows } = SELL_MAP
  const out: string[] = []
  for (let r = 0; r < rows; r += block) {
    for (let c = 0; c < cols; c += block) {
      let land = 0
      for (let dr = 0; dr < block; dr++) for (let dc = 0; dc < block; dc++) if (sellMapLand(c + dc, r + dr)) land++
      if (land * 2 >= block * block) out.push(`M${c + block / 2} ${r + block / 2}h0`)
    }
  }
  return out.join("")
}


/**
 * The countries, in the order the card visits them: one after another they
 * are far apart on the map, so the new order's label and the last one's
 * Shipped never meet. `cell` is the land dot of the city; `buy` the button
 * in that country's language (`lang` for the page's own markup).
 */
export const SELL_COUNTRIES = [
  { code: "US", country: "the United States", city: "New York", cell: [70, 26], total: "$32.00", product: "705 tee", photo: "705-tee.webp", kind: "physical", lang: "en", buy: "Buy now" },
  { code: "DE", country: "Germany", city: "Berlin", cell: [128, 18], total: "19,00 €", product: "Pines LUT pack", photo: "pines-lut-pack.webp", kind: "digital", lang: "de", buy: "Jetzt kaufen" },
  { code: "JP", country: "Japan", city: "Tokyo", cell: [213, 29], total: "¥4,800", product: "Steel bottle", photo: "steel-bottle.webp", kind: "physical", lang: "ja", buy: "今すぐ購入" },
  { code: "CA", country: "Canada", city: "Vancouver", cell: [37, 20], total: "C$89.00", product: "Drone filming course", photo: "drone-course.webp", kind: "digital", lang: "en", buy: "Buy now" },
  { code: "FR", country: "France", city: "Paris", cell: [121, 20], total: "24,00 €", product: "Canvas tote", photo: "canvas-tote.webp", kind: "physical", lang: "fr", buy: "Acheter" },
  { code: "AU", country: "Australia", city: "Sydney", cell: [220, 75], total: "A$22.00", product: "Wild Camp e-book", photo: "wild-camp-ebook.webp", kind: "digital", lang: "en", buy: "Buy now" },
] as const satisfies ReadonlyArray<{ code: string; country: string; city: string; cell: readonly [number, number]; total: string; product: string; photo: string; kind: "physical" | "digital"; lang: string; buy: string }>

/** What each kind says under its name: a parcel ships, a download is there at once. */
export const SELL_KIND_NOTE = { physical: "Ships in 2 to 4 days", digital: "Instant download" } as const

/** Earlier orders, quiet dots with no words: São Paulo, Mexico City, Los Angeles, Lagos, Johannesburg, Dubai, Mumbai, Singapore. */
export const SELL_PAST_ORDERS: ReadonlyArray<readonly [number, number]> = [
  [88, 69],
  [53, 40],
  [41, 30],
  [122, 48],
  [138, 70],
  [155, 35],
  [168, 40],
  [188, 51],
]

const N = SELL_COUNTRIES.length
const STEP_MS = 3600

const pos = ([c, r]: readonly [number, number]): CSSProperties => ({
  left: `${((c + 0.5) / SELL_MAP.cols) * 100}%`,
  top: `${((r + 0.5) / SELL_MAP.rows) * 100}%`,
})
const flagSrc = (code: string) => `/flags/${code}.svg`

/**
 * THE PHONE'S PAN. On a phone the map is ZOOM times the window's width, and
 * the window is VIEW_H of its width tall; this is how far (in % of the map's
 * own size, so a transform) the map moves to put a cell in the middle of the
 * window, never past the map's edges.
 */
const ZOOM = 1.9
const VIEW_H = 0.62
export function sellMapPan([c, r]: readonly [number, number]): { x: string; y: string } {
  const kx = 1 / ZOOM
  const ky = VIEW_H / ((ZOOM * SELL_MAP.rows) / SELL_MAP.cols)
  const fx = (c + 0.5) / SELL_MAP.cols
  const fy = (r + 0.5) / SELL_MAP.rows
  const clamp = (v: number, lo: number) => Math.min(0, Math.max(lo, v))
  return { x: `${(clamp(kx / 2 - fx, kx - 1) * 100).toFixed(2)}%`, y: `${(clamp(ky / 2 - fy, ky - 1) * 100).toFixed(2)}%` }
}

export function SellEverywhereMap() {
  const [ref, live] = useCommerceLive<HTMLElement>("300px 0px")
  const [dots, setDots] = useState<string | null>(null)
  /* The country in turn and the one before it (which says Shipped as it fades), whether the turn or a press chose the next. */
  const [turn, setTurn] = useState({ active: 0, prev: N - 1 })
  const { active, prev } = turn
  const [moved, setMoved] = useState(false)
  /* Counts the flags pressed by hand: the turn starts again from the chosen country. */
  const [picks, setPicks] = useState(0)

  /* The dots, once the section is near. */
  useEffect(() => {
    if (live && !dots) setDots(sellMapPath(1))
  }, [live, dots])

  useEffect(() => {
    if (!live) return
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => {
      setMoved(true)
      setTurn((t) => ({ active: (t.active + 1) % N, prev: t.active }))
    }, STEP_MS)
    return () => window.clearInterval(id)
  }, [live, picks])

  const choose = (i: number) => {
    if (i === active) return
    setMoved(true)
    setTurn({ active: i, prev: active })
    setPicks((p) => p + 1)
  }
  const pan = sellMapPan(SELL_COUNTRIES[active].cell)

  return (
    <section ref={ref} className="cmm" data-story-section="sell-everywhere" aria-labelledby="cmm-title">
      <style href="w13-sell-map" precedence="default">
        {MAP_CSS}
      </style>
      <div className="cmm-wrap">
        <div className="cmm-head">
          <StoryHeading id="cmm-title" text="Your store never closes. Sell anywhere." accent={["anywhere"]} />
        </div>

        <div className="cmm-card" style={{ "--a": active, "--pan-x": pan.x, "--pan-y": pan.y } as CSSProperties}>
          <span className="cmm-grid" aria-hidden="true" />
          <div
            className="cmm-world"
            role="img"
            aria-label={`A world map with orders from ${SELL_COUNTRIES.map((c) => c.city).join(", ")}, each buyer seeing a product, physical or digital, priced in their own money (${SELL_COUNTRIES.map((c) => c.total).join(", ")}) with the buy button in their language.`}
          >
            <div className="cmm-map" aria-hidden="true">
              <svg className="cmm-svg" viewBox={`0 0 ${SELL_MAP.cols} ${SELL_MAP.rows}`} preserveAspectRatio="xMidYMid meet" focusable="false">
                {dots ? <path d={dots} fill="none" stroke="#ffffff" strokeOpacity={0.28} strokeWidth={0.6} strokeLinecap="round" /> : null}
              </svg>
              {SELL_PAST_ORDERS.map((cell, i) => (
                <span key={i} className="cmm-dot" style={pos(cell)} />
              ))}
              {SELL_COUNTRIES.map((c, i) => (
                <span key={c.code} className="cmm-pin" data-on={i === active || undefined} data-was={(moved && i === prev) || undefined} style={pos(c.cell)}>
                  <i className="cmm-ring" />
                  <i className="cmm-core" />
                  <b className="cmm-say cmm-say-new">
                    <em>New order</em> <span>{c.total}</span>
                  </b>
                  <b className="cmm-say cmm-say-shipped">Shipped</b>
                </span>
              ))}
            </div>
          </div>

          <div className="cmm-side">
            <div className="cmm-flags" role="group" aria-label="Buyer's country">
              <span className="cmm-flag-lit" aria-hidden="true" />
              {SELL_COUNTRIES.map((c, i) => (
                <button key={c.code} type="button" className="cmm-flag" aria-pressed={i === active} aria-label={c.country.replace(/^the /, "")} data-on={i === active || undefined} onClick={() => choose(i)}>
                  <img src={flagSrc(c.code)} alt="" width={24} height={17} loading="lazy" decoding="async" />
                </button>
              ))}
            </div>

            {/* One product per country: every layer is in the page, the one in turn faded in. */}
            <div className="cmm-prod" aria-hidden="true">
              <span className="cmm-photos">
                {SELL_COUNTRIES.map((c, i) => (
                  <img key={c.code} src={`${IMG}/${c.photo}`} alt="" width={480} height={600} loading="lazy" decoding="async" data-on={i === active || undefined} />
                ))}
              </span>
              <div className="cmm-prod-row">
                <span className="cmm-swap cmm-prod-name">
                  {SELL_COUNTRIES.map((c, i) => (
                    <span key={c.code} data-on={i === active || undefined}>
                      {c.product}
                    </span>
                  ))}
                </span>
                <span className="cmm-swap cmm-prices">
                  {SELL_COUNTRIES.map((c, i) => (
                    <span key={c.code} data-on={i === active || undefined}>
                      {c.total}
                    </span>
                  ))}
                </span>
              </div>
              <span className="cmm-swap cmm-kind">
                {SELL_COUNTRIES.map((c, i) => (
                  <span key={c.code} data-on={i === active || undefined}>
                    {SELL_KIND_NOTE[c.kind]}
                  </span>
                ))}
              </span>
              <span className="cmm-buy">
                {SELL_COUNTRIES.map((c, i) => (
                  <span key={c.code} lang={c.lang} data-on={i === active || undefined}>
                    {c.buy}
                  </span>
                ))}
              </span>
            </div>
          </div>

          <div className="cmm-copy">
            <h3>Their money, their language</h3>
            <p>Buyers see your prices in their own currency and pay by card, Apple Pay or Google Pay, day or night.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

const EASE = "cubic-bezier(.22,1,.36,1)"
const MAP_CSS = `
.cmm{position:relative;background:#fff;color:#0f0e13;padding:clamp(72px,9vw,128px) 0}
.cmm-wrap{max-width:1400px;margin:0 auto;padding:0 var(--landing-gutter,22px)}
.cmm-head{max-width:920px;margin-bottom:clamp(32px,4vw,52px)}
.cmm-card{position:relative;isolation:isolate;overflow:hidden;border-radius:31px;color:#fff;background:#0f0f12;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);height:500px}
.cmm-grid,.cmm-world,.cmm-prod,.cmm-copy{pointer-events:none}
.cmm-grid{position:absolute;z-index:0;inset:-24px;background-image:radial-gradient(rgba(255,255,255,.13) 1px,transparent 1.6px);background-size:24px 24px;-webkit-mask-image:radial-gradient(90% 90% at 0% 0%,#000 0%,rgba(0,0,0,.45) 45%,transparent 80%);mask-image:radial-gradient(90% 90% at 0% 0%,#000 0%,rgba(0,0,0,.45) 45%,transparent 80%);animation:cmm-grid 10s linear infinite;animation-play-state:paused}
[data-commerce-live] .cmm-grid{animation-play-state:running}
@keyframes cmm-grid{from{transform:translate3d(0,0,0)}to{transform:translate3d(24px,24px,0)}}
.cmm-world{position:absolute;z-index:0;right:clamp(28px,3vw,48px);top:50%;width:calc(100% - clamp(330px,32vw,440px) - clamp(28px,3vw,48px));transform:translate3d(0,-50%,0)}
.cmm-map{position:relative;aspect-ratio:240/90}
.cmm-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cmm-dot,.cmm-pin{position:absolute;width:0;height:0}
.cmm-dot::before{content:"";position:absolute;left:-2.5px;top:-2.5px;width:5px;height:5px;border-radius:50%;background:#a78bfa;opacity:.55}
.cmm-core{position:absolute;left:-3.5px;top:-3.5px;width:7px;height:7px;border-radius:50%;background:#c4b5fd;box-shadow:0 0 0 2px #0f0f12;opacity:.7;transform:scale(.8);transition:transform .7s ${EASE},opacity .5s ease-out}
.cmm-pin[data-on] .cmm-core{opacity:1;transform:scale(1.15)}
.cmm-ring{position:absolute;left:-10px;top:-10px;width:20px;height:20px;border-radius:50%;border:1.5px solid rgba(196,181,253,.8);opacity:0;transform:scale(.4)}
.cmm-pin[data-on] .cmm-ring{animation:cmm-ring 2.4s ease-out infinite;animation-play-state:paused}
[data-commerce-live] .cmm-pin[data-on] .cmm-ring{animation-play-state:running}
@keyframes cmm-ring{0%{opacity:.9;transform:scale(.4)}70%,100%{opacity:0;transform:scale(1.6)}}
.cmm-say{position:absolute;left:0;bottom:12px;display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;background:rgba(17,17,20,.92);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);font-size:12.5px;font-weight:500;line-height:1;color:#f4f3f7;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .25s ease-out,transform .7s ${EASE}}
.cmm-say em{font-style:normal}
.cmm-say span{color:#c4b5fd;font-variant-numeric:tabular-nums}
.cmm-say{transform:translate3d(-50%,4px,0)}
.cmm-pin[data-on] .cmm-say-new{opacity:1;transform:translate3d(-50%,0,0);transition:opacity .45s ease-out .2s,transform .7s ${EASE} .2s}
.cmm-pin[data-was] .cmm-say-shipped{opacity:0;animation:cmm-shipped 3s ${EASE} .3s both;animation-play-state:paused}
[data-commerce-live] .cmm-pin[data-was] .cmm-say-shipped{animation-play-state:running}
@keyframes cmm-shipped{0%{opacity:0;transform:translate3d(-50%,0,0)}12%,62%{opacity:.8;transform:translate3d(-50%,0,0)}100%{opacity:0;transform:translate3d(-50%,0,0)}}
.cmm-side{position:absolute;z-index:1;left:clamp(28px,3vw,40px);top:36px;display:flex;align-items:flex-start;gap:20px}
.cmm-flags{position:relative;display:grid;grid-auto-rows:40px;gap:8px;margin:0;padding:0;list-style:none}
.cmm-flag{position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:12px;background:transparent;opacity:.45;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:opacity .5s ease-out}
.cmm-flag[data-on]{opacity:1}
@media (hover:hover) and (pointer:fine){.cmm-flag:hover{opacity:1}}
.cmm-flag:focus-visible{outline:2px solid #c4b5fd;outline-offset:2px;opacity:1}
.cmm-flags img{width:24px;height:17px;border-radius:3px;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.cmm-flags .cmm-flag-lit{position:absolute;left:0;top:0;width:40px;height:40px;border-radius:12px;pointer-events:none;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);transform:translate3d(0,calc(var(--a) * 48px),0);transition:transform .7s ${EASE}}
.cmm-prod{width:200px;padding:12px;border-radius:15px;background:#18181d;color:#f4f3f7;box-shadow:inset 0 0 0 1px rgba(255,255,255,.09),0 24px 48px -24px rgba(0,0,0,.8)}
.cmm-photos{position:relative;display:block;aspect-ratio:1/1;border-radius:9px;overflow:hidden;background:#26262c}
.cmm-photos img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.06);transition:opacity .7s ease-out,transform 1.1s ${EASE}}
.cmm-photos img[data-on]{opacity:1;transform:none}
.cmm-prod-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:11px;font-size:14px;line-height:20px}
.cmm-swap{display:grid;min-width:0}
.cmm-swap span{grid-area:1/1;white-space:nowrap;opacity:0;transform:translate3d(0,-4px,0);transition:opacity .2s ease-out,transform .5s ${EASE}}
.cmm-swap span[data-on]{opacity:1;transform:none;transition:opacity .4s ease-out .22s,transform .7s ${EASE} .22s}
.cmm-prod-name{font-weight:500}
.cmm-prices{justify-items:end;font-variant-numeric:tabular-nums;color:#c9c7d1}
.cmm-kind{margin-top:2px;font-size:12.5px;line-height:18px;color:#8f8d99}
.cmm-buy{display:grid;place-items:center;height:40px;margin-top:11px;border-radius:9px;background:#f4f3f7;color:#141217;font-size:14px;font-weight:600;overflow:hidden}
.cmm-buy span{grid-area:1/1;opacity:0;transform:translate3d(0,-6px,0);transition:opacity .2s ease-out,transform .5s ${EASE}}
.cmm-buy span[data-on]{opacity:1;transform:none;transition:opacity .4s ease-out .26s,transform .7s ${EASE} .26s}
.cmm-copy{position:absolute;z-index:2;left:clamp(28px,3vw,40px);bottom:36px;max-width:clamp(270px,calc(32vw - 64px),380px)}
.cmm-copy h3{margin:0;font-size:clamp(20px,1.7vw,24px);font-weight:500;letter-spacing:-.02em;line-height:1.2}
.cmm-copy p{margin:8px 0 0;font-size:15px;line-height:1.55;color:#a3a1ad}
@media (max-width:1023px){
  .cmm-card{height:auto;display:flex;flex-direction:column;padding:10px 0 24px;border-radius:25px}
  .cmm-world{position:relative;right:auto;top:auto;width:auto;margin:0 10px;transform:none;order:1;aspect-ratio:1/${VIEW_H};overflow:hidden;border-radius:16px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
  .cmm-map{width:${ZOOM * 100}%;transform:translate3d(var(--pan-x,0),var(--pan-y,0),0);transition:transform 1.4s ${EASE}}
  .cmm-side{position:relative;left:auto;top:auto;order:2;flex-direction:column;align-items:stretch;gap:14px;margin:14px 14px 0}
  .cmm-flags{align-self:center;grid-auto-flow:column;grid-auto-rows:auto;grid-auto-columns:40px;gap:8px}
  .cmm-flags .cmm-flag-lit{transform:translate3d(calc(var(--a) * 48px),0,0)}
  .cmm-prod{display:grid;grid-template-columns:112px minmax(0,1fr);grid-template-rows:auto auto 1fr;column-gap:14px;width:auto;padding:10px}
  .cmm-photos{grid-row:1/4}
  .cmm-buy{align-self:end}
  .cmm-prod-row{flex-direction:column;align-items:flex-start;gap:2px;margin-top:4px;font-size:15px}
  .cmm-prices{justify-items:start}
  .cmm-buy{margin-top:10px}
  .cmm-copy{position:relative;left:auto;bottom:auto;order:3;margin:22px 22px 0;max-width:none}
  .cmm-say{height:22px;bottom:10px;padding:0 8px;font-size:11.5px;gap:5px}
  .cmm-core{left:-3px;top:-3px;width:6px;height:6px}
  .cmm-dot::before{left:-2px;top:-2px;width:4px;height:4px}
}
@media (min-width:640px) and (max-width:1023px){
  .cmm-world{aspect-ratio:240/110}
  .cmm-map{width:100%;transform:none}
  .cmm-side{flex-direction:row;align-items:center;justify-content:center;gap:22px}
  .cmm-flags{align-self:auto;grid-auto-flow:row;grid-auto-columns:auto;grid-auto-rows:40px}
  .cmm-flags .cmm-flag-lit{transform:translate3d(0,calc(var(--a) * 48px),0)}
  .cmm-prod{width:min(420px,70%)}
}
@media (max-width:767px){
  .cmm-say-shipped{display:none}
}
@media (max-width:639px){
  .cmm-card{border-radius:21px}
  .cmm-copy{margin:20px 18px 0}
  .cmm-copy p{font-size:14.5px}
}
@media (prefers-reduced-motion:reduce){
  .cmm-ring,.cmm-say-shipped{animation:none!important;opacity:0}
  .cmm-grid{animation:none}
  .cmm-core,.cmm-say,.cmm-flag,.cmm-flags .cmm-flag-lit,.cmm-swap span,.cmm-buy span,.cmm-photos img,.cmm-map{transition:none}
}
`

/** This section's stylesheet, as it draws it: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const SELL_EVERYWHERE_STYLES: readonly SectionStyle[] = [{ href: "w13-sell-map", precedence: "default", css: MAP_CSS }]
