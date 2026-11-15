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
 * example." Three of the six are digital now, each saying under its name
 * how it arrives, and the Example tag is gone.
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
 * there uses. The products are a few creators' own (round 8 below), on
 * Unsplash photographs or covers drawn from them (public/home/sell-map).
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
 * LANDING ROUND 7, THE OWNER: every section as wide as the showcase under
 * the hero, and nothing purple on the purple sheet, not even light purple.
 * The card sits in the page's one width (--home-edge and --home-max,
 * app/globals.css), its heading set in by --home-head-inset; the heading's
 * accent, the markers, the rings and the prices on the map are white.
 *
 * LANDING ROUND 8, THE OWNER: smoother, cleaner, more to touch; "the black
 * card should be more smooth and clean"; the e-book becomes an ancestral
 * nutrition cookbook, the course is a different one, the Cine Tones LUT
 * pack comes in, the canvas tote stays. So:
 *  - the products: the 705 tee, the Cine Tones LUT Pack (the same black
 *    cover the page shows elsewhere, drawn into its own picture), the steel
 *    bottle, a mobility course, the canvas tote and Ancestral Kitchen, a
 *    cookbook. Three physical, three digital, still alternating.
 *  - the turn is timed by the lit flag itself: a hairline under the flag
 *    fills in 3.6s (one transform) and when it ends the next country comes.
 *    No timer in JavaScript, so a paused section, a background tab or a
 *    pointer resting on the flags or the product simply holds the line where
 *    it is and the turn carries on from there, with no jump. Under reduced
 *    motion the line never runs, so the first country stays.
 *  - the cities on the map can be pressed too (a pointer target; the flags
 *    stay the switch for the keyboard and screen readers).
 *  - the product card is one calm surface: a slightly larger picture, the
 *    name on its own line, the price beside how it arrives, softer corners
 *    and shadow. Words leave upwards and the next ones arrive from below;
 *    the next picture fades in over the last one, which stays until it is
 *    covered (no dark dip between them).
 *  - the order's ring ripples twice, offset, a softer pulse.
 *
 * LANDING ROUND 9, THE OWNER: the section is on a WHITE sheet now ("keep the
 * card black"), "the autoplay is every 3 seconds", the product changing and
 * the whole section "more smooth and clean, buttery, without lag", and the
 * Buy now button must not sit against "Their money, their language". So:
 *  - the section draws its own white ground and dark heading whatever sheet
 *    it is in (its own classes, not the sheet's tone); the card stays black
 *    and has a soft shadow again, 34px long at the most: the section's own
 *    foot is never under 48px (--home-pad), so the lazy box never cuts it.
 *  - a country stays 3s (SELL_STEP_MS).
 *  - a turn renders nothing: the flag's line ends, and a handful of
 *    attributes are written straight to the layers already in the page
 *    (data-on, data-was, three custom properties on the card). React is not
 *    asked to render the section in the middle of its own transition, which
 *    was a task of 50 to 60ms at 4x CPU on every turn.
 *  - the product, its words and the button change on one clock: the picture
 *    fades in over the last one, the words leave and arrive together.
 *  - the flags, the product and the copy are laid out one under the other
 *    (the copy was pinned to the card's foot, 3px under the button at some
 *    widths): the copy always starts 44px under the product card.
 *  - on a phone the map's faded sides are two small gradients over it, not a
 *    mask over a layer that moves.
 *
 * MOTION. No render per country: a few attributes written every 3s while
 * the section is on screen and the tab is visible. Everything that moves
 * (the highlight, the product, the price, the words, the labels, the ring,
 * the phone's pan, the dot grid) moves by transform and opacity, on the
 * compositor. The loops run only while live (the data-commerce-live
 * attribute). Reduced motion: the first country, still.
 */
import type { SectionStyle } from "./lazy-section"
import { useEffect, useRef, useState, type CSSProperties } from "react"
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
  { code: "DE", country: "Germany", city: "Berlin", cell: [128, 18], total: "29,00 €", product: "Cine Tones LUT Pack", photo: "cine-tones-lut-pack.webp", kind: "digital", lang: "de", buy: "Jetzt kaufen" },
  { code: "JP", country: "Japan", city: "Tokyo", cell: [213, 29], total: "¥4,800", product: "Steel bottle", photo: "steel-bottle.webp", kind: "physical", lang: "ja", buy: "今すぐ購入" },
  { code: "CA", country: "Canada", city: "Vancouver", cell: [37, 20], total: "C$79.00", product: "Mobility course", photo: "mobility-course.webp", kind: "digital", lang: "en", buy: "Buy now" },
  { code: "FR", country: "France", city: "Paris", cell: [121, 20], total: "24,00 €", product: "Canvas tote", photo: "canvas-tote.webp", kind: "physical", lang: "fr", buy: "Acheter" },
  { code: "AU", country: "Australia", city: "Sydney", cell: [220, 75], total: "A$34.00", product: "Ancestral Kitchen", photo: "ancestral-kitchen-cookbook.webp", kind: "digital", lang: "en", buy: "Buy now" },
] as const satisfies ReadonlyArray<{ code: string; country: string; city: string; cell: readonly [number, number]; total: string; product: string; photo: string; kind: "physical" | "digital"; lang: string; buy: string }>

/** What each kind says under its name: a parcel ships, a download is there at once. */
export const SELL_KIND_NOTE = { physical: "Ships in 2 to 4 days", digital: "Instant download" } as const
/** A course is watched, not downloaded (landing round 8). */
export const SELL_NOTE: Partial<Record<string, string>> = { CA: "Instant access" }

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
/** How long each country stays: the length of the lit flag's line (MAP_CSS, .cmm-time), which times the turn. */
export const SELL_STEP_MS = 3000

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
  const card = useRef<HTMLDivElement>(null)
  /* The country in turn and the one before it (which says Shipped as it fades). Kept here, not in state: a turn writes attributes, it does not render (landing round 9). */
  const turn = useRef({ active: 0, prev: N - 1, laps: 0 })

  /* The dots, once the section is near. */
  useEffect(() => {
    if (live && !dots) setDots(sellMapPath(1))
  }, [live, dots])

  /* Show country i: every layer that swaps carries data-i, and learns here whether it is the one in turn or the one leaving. */
  const show = (i: number) => {
    const el = card.current
    const t = turn.current
    if (!el || i === t.active) return
    t.prev = t.active
    t.active = i
    t.laps++
    const pan = sellMapPan(SELL_COUNTRIES[i].cell)
    el.style.setProperty("--a", String(i))
    el.style.setProperty("--pan-x", pan.x)
    el.style.setProperty("--pan-y", pan.y)
    for (const node of el.querySelectorAll<HTMLElement>("[data-i]")) {
      const k = Number(node.dataset.i)
      node.toggleAttribute("data-on", k === i)
      node.toggleAttribute("data-was", k === t.prev)
      if (node.hasAttribute("aria-pressed")) node.setAttribute("aria-pressed", String(k === i))
    }
    /* The line starts again: the same keyframes under the other name, so nothing is measured to restart it. */
    el.querySelector(".cmm-time")?.setAttribute("data-lap", String(t.laps % 2))
  }
  /* The lit flag's line ran out: the next country. */
  const next = () => show((turn.current.active + 1) % N)
  /* What a layer is when the page arrives: the first country in turn, nothing leaving. */
  const layer = (i: number) => ({ "data-i": i, "data-on": i === 0 || undefined })
  const first = sellMapPan(SELL_COUNTRIES[0].cell)

  return (
    <section ref={ref} className="cmm" data-story-section="sell-everywhere" aria-labelledby="cmm-title">
      <style href="w13-sell-map" precedence="default">
        {MAP_CSS}
      </style>
      <div className="cmm-wrap">
        <div className="cmm-head">
          <StoryHeading id="cmm-title" text="Your store never closes. Sell anywhere." accent={["anywhere"]} />
        </div>

        <div ref={card} className="cmm-card" style={{ "--a": 0, "--pan-x": first.x, "--pan-y": first.y } as CSSProperties}>
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
                /* A pointer can press a city as well as its flag; the flags are the switch for the keyboard and screen readers. */
                <span key={c.code} className="cmm-pin" {...layer(i)} style={pos(c.cell)} onClick={() => show(i)}>
                  <i className="cmm-ring" />
                  <i className="cmm-ring cmm-ring-2" />
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
              <span className="cmm-flag-lit" aria-hidden="true">
                {/* The line that times the turn: it starts again with every country, and its end brings the next. */}
                <i className="cmm-time" data-lap="0" onAnimationEnd={next} />
              </span>
              {SELL_COUNTRIES.map((c, i) => (
                <button key={c.code} type="button" className="cmm-flag" aria-pressed={i === 0} aria-label={c.country.replace(/^the /, "")} {...layer(i)} onClick={() => show(i)}>
                  <img src={flagSrc(c.code)} alt="" width={24} height={17} loading="lazy" decoding="async" />
                </button>
              ))}
            </div>

            {/* One product per country: every layer is in the page, the one in turn fading in over the one leaving. */}
            <div className="cmm-prod" aria-hidden="true">
              <span className="cmm-photos">
                {SELL_COUNTRIES.map((c, i) => (
                  <img key={c.code} src={`${IMG}/${c.photo}`} alt="" width={600} height={600} loading="lazy" decoding="async" {...layer(i)} />
                ))}
              </span>
              <span className="cmm-prod-info">
                <span className="cmm-swap cmm-prod-name">
                  {SELL_COUNTRIES.map((c, i) => (
                    <span key={c.code} {...layer(i)}>
                      {c.product}
                    </span>
                  ))}
                </span>
                <span className="cmm-prod-row">
                  <span className="cmm-swap cmm-prices">
                    {SELL_COUNTRIES.map((c, i) => (
                      <span key={c.code} {...layer(i)}>
                        {c.total}
                      </span>
                    ))}
                  </span>
                  <span className="cmm-swap cmm-kind">
                    {SELL_COUNTRIES.map((c, i) => (
                      <span key={c.code} {...layer(i)}>
                        {SELL_NOTE[c.code] ?? SELL_KIND_NOTE[c.kind]}
                      </span>
                    ))}
                  </span>
                </span>
              </span>
              <span className="cmm-buy">
                {SELL_COUNTRIES.map((c, i) => (
                  <span key={c.code} lang={c.lang} {...layer(i)}>
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
const SOFT = "cubic-bezier(.4,0,.2,1)"
const STEP = SELL_STEP_MS
const MAP_CSS = `
.cmm{position:relative;background:#fff;color:#0f0e13;padding:clamp(72px,9vw,128px) 0}
/* Landing round 9: white whatever sheet it is in, by its own classes (a band's rules recolour by [data-band] .cmm, two classes strong). */
[data-landing-story] .cmm.cmm{background:#fff;color:#0f0e13}
[data-landing-story] .cmm .cmm-head .story-heading{--story-ink:#18181b;--story-muted:#777780;--story-accent:#7c3aed}
.cmm-wrap,[data-landing-story] .cmm>.cmm-wrap{box-sizing:border-box;width:100%;max-width:var(--home-max,2020px);margin:0 auto;padding:0 var(--home-edge,clamp(20px,5.15vw,84px))}
.cmm-head{max-width:920px;margin-bottom:clamp(32px,4vw,52px);padding-left:var(--home-head-inset,0px)}
.cmm-card{position:relative;isolation:isolate;overflow:hidden;border-radius:31px;color:#fff;background:#0f0f12;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 20px 44px -30px rgba(15,14,19,.5);box-sizing:border-box;padding:30px 0 36px;min-height:500px}
.cmm-grid,.cmm-world,.cmm-prod,.cmm-copy{pointer-events:none}
.cmm-grid{position:absolute;z-index:0;inset:-24px;background-image:radial-gradient(rgba(255,255,255,.13) 1px,transparent 1.6px);background-size:24px 24px;-webkit-mask-image:radial-gradient(90% 90% at 0% 0%,#000 0%,rgba(0,0,0,.45) 45%,transparent 80%);mask-image:radial-gradient(90% 90% at 0% 0%,#000 0%,rgba(0,0,0,.45) 45%,transparent 80%);animation:cmm-grid 10s linear infinite;animation-play-state:paused}
[data-commerce-live] .cmm-grid{animation-play-state:running}
@keyframes cmm-grid{from{transform:translate3d(0,0,0)}to{transform:translate3d(24px,24px,0)}}
.cmm-world{position:absolute;z-index:0;right:clamp(28px,3vw,48px);top:50%;width:calc(100% - clamp(330px,32vw,440px) - clamp(28px,3vw,48px));transform:translate3d(0,-50%,0)}
.cmm-map{position:relative;aspect-ratio:240/90}
.cmm-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cmm-dot,.cmm-pin{position:absolute;width:0;height:0}
.cmm-pin{pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent}
.cmm-pin::after{content:"";position:absolute;left:-16px;top:-16px;width:32px;height:32px;border-radius:50%}
.cmm-pin i,.cmm-pin b{pointer-events:none}
.cmm-dot::before{content:"";position:absolute;left:-2.5px;top:-2.5px;width:5px;height:5px;border-radius:50%;background:#fff;opacity:.4}
.cmm-core{position:absolute;left:-3.5px;top:-3.5px;width:7px;height:7px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px #0f0f12;opacity:.7;transform:scale(.8);transition:transform .7s ${EASE},opacity .5s ease-out}
.cmm-pin[data-on] .cmm-core{opacity:1;transform:scale(1.15)}
@media (hover:hover) and (pointer:fine){.cmm-pin:hover .cmm-core{opacity:1;transform:scale(1.4)}}
.cmm-ring{position:absolute;left:-10px;top:-10px;width:20px;height:20px;border-radius:50%;border:1.5px solid rgba(255,255,255,.7);opacity:0;transform:scale(.4)}
.cmm-pin[data-on] .cmm-ring{animation:cmm-ring 2.4s ease-out infinite;animation-play-state:paused}
[data-commerce-live] .cmm-pin[data-on] .cmm-ring{animation-play-state:running}
.cmm-pin[data-on] .cmm-ring-2{animation-delay:1.2s}
@keyframes cmm-ring{0%{opacity:.75;transform:scale(.4)}70%,100%{opacity:0;transform:scale(1.7)}}
.cmm-say{position:absolute;left:0;bottom:12px;display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;background:rgba(17,17,20,.92);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);font-size:12.5px;font-weight:500;line-height:1;color:#f4f3f7;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .25s ease-out,transform .7s ${EASE}}
.cmm-say em{font-style:normal}
.cmm-say span{color:#c9c7d1;font-variant-numeric:tabular-nums}
.cmm-say{transform:translate3d(-50%,4px,0)}
.cmm-pin[data-on] .cmm-say-new{opacity:1;transform:translate3d(-50%,0,0);transition:opacity .45s ease-out .2s,transform .7s ${EASE} .2s}
.cmm-pin[data-was] .cmm-say-shipped{opacity:0;animation:cmm-shipped 3s ${EASE} .3s both;animation-play-state:paused}
[data-commerce-live] .cmm-pin[data-was] .cmm-say-shipped{animation-play-state:running}
@keyframes cmm-shipped{0%{opacity:0;transform:translate3d(-50%,0,0)}12%,62%{opacity:.8;transform:translate3d(-50%,0,0)}100%{opacity:0;transform:translate3d(-50%,0,0)}}
.cmm-side{position:relative;z-index:1;width:max-content;margin-left:clamp(28px,3vw,40px);display:flex;align-items:flex-start;gap:20px}
.cmm-flags{position:relative;display:grid;grid-auto-rows:40px;gap:8px;margin:0;padding:0;list-style:none}
.cmm-flag{position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:12px;background:transparent;opacity:.45;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:opacity .5s ease-out}
.cmm-flag[data-on]{opacity:1}
@media (hover:hover) and (pointer:fine){.cmm-flag:hover{opacity:1}}
.cmm-flag:focus-visible{outline:2px solid #fff;outline-offset:2px;opacity:1}
.cmm-flags img{width:24px;height:17px;border-radius:3px;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.cmm-flags .cmm-flag-lit{position:absolute;left:0;top:0;width:40px;height:40px;border-radius:12px;pointer-events:none;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);transform:translate3d(0,calc(var(--a) * 48px),0);transition:transform .7s ${EASE}}
.cmm-flag-lit::after,.cmm-time{position:absolute;left:10px;right:10px;bottom:5px;height:2px;border-radius:2px}
.cmm-flag-lit::after{content:"";background:rgba(255,255,255,.14)}
.cmm-time{z-index:1;background:rgba(255,255,255,.88);transform:scaleX(0);transform-origin:0 50%;animation:cmm-time ${STEP}ms linear both;animation-play-state:paused}
.cmm-time[data-lap="1"]{animation-name:cmm-time-b}
[data-commerce-live] .cmm-time{animation-play-state:running}
@media (hover:hover) and (pointer:fine){[data-commerce-live] .cmm-side:hover .cmm-time{animation-play-state:paused}}
@keyframes cmm-time{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes cmm-time-b{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.cmm-prod{width:224px;padding:10px;border-radius:20px;background:#141418;background-image:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,0) 55%);color:#f4f3f7;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),inset 0 0 0 1px rgba(255,255,255,.07),0 30px 60px -30px rgba(0,0,0,.75)}
.cmm-photos{position:relative;display:block;aspect-ratio:1/1;border-radius:13px;overflow:hidden;background:#222228;isolation:isolate}
.cmm-photos img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.035);transition:opacity 0s linear .8s,transform 0s linear .8s}
.cmm-photos img[data-was]{z-index:1;opacity:1;transform:none;transition:opacity .25s linear,transform .25s linear}
.cmm-photos img[data-on]{opacity:1;z-index:2;transform:none;transition:opacity .7s ${SOFT},transform 1.1s ${EASE}}
.cmm-prod-info{display:block;padding:12px 4px 0}
.cmm-prod-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:3px;font-size:13px;line-height:18px}
.cmm-swap{display:grid;min-width:0}
.cmm-swap span{grid-area:1/1;white-space:nowrap;opacity:0;transform:translate3d(0,6px,0);transition:opacity .22s ease-out,transform .45s ${EASE}}
.cmm-swap span[data-was]{transform:translate3d(0,-6px,0)}
.cmm-swap span[data-on]{opacity:1;transform:none;transition:opacity .45s ease-out .16s,transform .7s ${EASE} .16s}
.cmm-prod-name{font-size:15px;line-height:21px;font-weight:600;letter-spacing:-.01em;overflow:hidden}
.cmm-prod-name span{overflow:hidden;text-overflow:ellipsis}
.cmm-prices{font-weight:500;font-variant-numeric:tabular-nums;color:#f4f3f7}
.cmm-kind{justify-items:end;font-size:12.5px;color:#8f8d99}
.cmm-buy{display:grid;place-items:center;height:40px;margin-top:12px;border-radius:12px;background:#f4f3f7;color:#141217;font-size:14px;font-weight:600;overflow:hidden}
.cmm-buy span{grid-area:1/1;opacity:0;transform:translate3d(0,6px,0);transition:opacity .22s ease-out,transform .45s ${EASE}}
.cmm-buy span[data-was]{transform:translate3d(0,-6px,0)}
.cmm-buy span[data-on]{opacity:1;transform:none;transition:opacity .45s ease-out .16s,transform .7s ${EASE} .16s}
.cmm-copy{position:relative;z-index:2;margin:44px 0 0 clamp(28px,3vw,40px);max-width:clamp(270px,calc(32vw - 64px),380px)}
.cmm-copy h3{margin:0;font-size:clamp(20px,1.7vw,24px);font-weight:500;letter-spacing:-.02em;line-height:1.2}
.cmm-copy p{margin:8px 0 0;font-size:15px;line-height:1.55;color:#a3a1ad}
@media (max-width:1023px){
  .cmm-card{min-height:0;display:flex;flex-direction:column;padding:10px 0 24px;border-radius:25px}
  .cmm-world{position:relative;right:auto;top:auto;width:auto;margin:0 10px;transform:none;order:1;aspect-ratio:1/${VIEW_H};overflow:hidden;border-radius:16px}
  .cmm-world::before,.cmm-world::after{content:"";position:absolute;z-index:2;top:0;bottom:0;width:9%;pointer-events:none}
  .cmm-world::before{left:0;background:linear-gradient(90deg,#0f0f12,rgba(15,15,18,0))}
  .cmm-world::after{right:0;background:linear-gradient(270deg,#0f0f12,rgba(15,15,18,0))}
  .cmm-map{width:${ZOOM * 100}%;transform:translate3d(var(--pan-x,0),var(--pan-y,0),0);transition:transform 1.4s ${EASE};will-change:transform}
  .cmm-side{order:2;width:auto;flex-direction:column;align-items:stretch;gap:14px;margin:14px 14px 0}
  .cmm-flags{align-self:center;grid-auto-flow:column;grid-auto-rows:auto;grid-auto-columns:40px;gap:8px}
  .cmm-flags .cmm-flag-lit{transform:translate3d(calc(var(--a) * 48px),0,0)}
  .cmm-prod{display:grid;grid-template-columns:112px minmax(0,1fr);grid-template-rows:1fr auto;column-gap:14px;width:auto;padding:10px;border-radius:18px}
  .cmm-photos{grid-row:1/3;border-radius:11px}
  .cmm-prod-info{padding:4px 2px 0}
  .cmm-prod-row{flex-direction:column;align-items:flex-start;gap:1px;margin-top:3px;font-size:14px}
  .cmm-kind{justify-items:start}
  .cmm-buy{align-self:end;margin-top:10px}
  .cmm-copy{order:3;margin:30px 22px 0;max-width:none}
  .cmm-say{height:22px;bottom:10px;padding:0 8px;font-size:11.5px;gap:5px}
  .cmm-core{left:-3px;top:-3px;width:6px;height:6px}
  .cmm-dot::before{left:-2px;top:-2px;width:4px;height:4px}
}
@media (min-width:640px) and (max-width:1023px){
  .cmm-world{aspect-ratio:240/110}
  .cmm-map{width:100%;transform:none;will-change:auto}
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
  .cmm-copy{margin:28px 18px 0}
  .cmm-copy p{font-size:14.5px}
}
@media (prefers-reduced-motion:reduce){
  .cmm-ring,.cmm-say-shipped{animation:none!important;opacity:0}
  .cmm-time{animation:none}
  .cmm-flag-lit::after{display:none}
  .cmm-grid{animation:none}
  .cmm-core,.cmm-say,.cmm-flag,.cmm-flags .cmm-flag-lit,.cmm-swap span,.cmm-buy span,.cmm-photos img,.cmm-map{transition:none}
}
`

/** This section's stylesheet, as it draws it: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const SELL_EVERYWHERE_STYLES: readonly SectionStyle[] = [{ href: "w13-sell-map", precedence: "default", css: MAP_CSS }]
