"use client"

/**
 * ===========================================================================
 *  HOW IT WORKS: THREE PICTURE CARDS IN ONE ROW (home, section 8, round 9)
 * ===========================================================================
 * Landing round 9, the owner: the products card repeated "Sell anything you
 * make" and the course card repeated the section that shows what you can
 * build, so both are gone. What stays is what no other section says: tips,
 * the numbers, and your own domain. The structure is a heading, then three
 * picture cards in one row, narrow, wide, narrow, each with a caption title
 * and one short line under it, on white.
 *
 * LANDING ROUND 11, THE OWNER: "I like the structure (the three cards in a
 * row), but I don't like the visual representations there: change the
 * imagery to something else, smoother, cleaner, that works." The row, the
 * captions and the heading stay. The pictures are new, and all three are
 * drawn the same way: one quiet near white ground (a breath of colour each,
 * no ring lines, no orbiting dots, no hearts), one white panel on it, and
 * one calm motion in it.
 *
 *   tips       Ruben's tips as he sees them: this month's total over the
 *              latest tips, a new one sliding in at the top every three
 *              seconds while the oldest leaves at the bottom.
 *   business   Sales for the last 30 days as thirty slim bars that rise
 *              once, the first time the card is seen, then a soft column
 *              gliding from day to day with that day's sum over it; beside
 *              it the two best sellers (section 3's LUT pack and tee, with
 *              section 3's numbers) and the three countries, each with a
 *              share bar that fills once.
 *   domain     his website in a browser, the front page a photograph from
 *              a workshop (Unsplash, public/home/how/linde-turning.webp).
 *              The address reads lindewood.storelib.com, then ".storelib"
 *              fades and ".com" closes over it as the lock turns violet:
 *              lindewood.com.
 *
 * HEIGHT (round 10, a MacBook Air at about 1440x800): on a computer the
 * pictures stop at half the screen's height, so the heading and the row fit
 * one screen.
 *
 * One shop throughout: Ruben Linde's Linde Woodshop, a woodworker who films
 * his builds (made up). It sells section 3's two products.
 *
 * THE GROUND. Behind the heading a field of faint dots flows by itself and,
 * where a mouse is, lights violet around it and parts (HowField, a small
 * canvas: the closing call's idea, drawn for a white ground). It covers the
 * head of the section only, is drawn at no more than 1.5 device pixels a
 * CSS pixel, and runs only while it is on screen and the tab is visible.
 *
 * WHAT MOVES. Transform and opacity only, in fixed-size boxes, so nothing
 * lays out while anything plays. The loops (.cmh-a) run only while their
 * card is near the screen and the tab is visible (data-commerce-live); the
 * bars rise once, the first time a third of their card is on screen
 * (data-seen, .cmh-o). The cards themselves never hide: a fast scroll finds
 * the grounds, panels and captions already there, never a blank box.
 * Reduced motion shows each picture's finished frame, still.
 *
 * A PICTURE TAKES NO POINTER (landing round 11: the tip card's press and the
 * chart's mouse reading went with the old pictures). No links, no buttons,
 * nothing to tab to: the pictures stay aria-hidden, so a swipe over them is
 * only ever a page scroll.
 *
 * TRUE TO THE PRODUCT. Tips are a thank you button a creator turns on.
 * Analytics has Sales over time, Top products and Orders by country
 * (app/(storelib)/app/analytics); the numbers here are section 3's (386 LUT
 * packs at $29, 214 tees at $32), split over thirty days and three
 * countries so every figure adds up. A website's own address on Storelib is
 * <name>.storelib.com; a domain a creator owns serves their website, their
 * creator page or one community (lib/custom-domains/hostname
 * DOMAIN_PURPOSES); connecting one is on Pro (lib/sites/plan customDomain);
 * Storelib reads the DNS and waits for the certificate itself
 * (app/api/domains/verify).
 */
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react"
import type { SectionStyle } from "./lazy-section"
import type { DomainPurpose } from "@/lib/custom-domains/hostname"
import { commerceUsd } from "./commerce-kit"
import { mountDotField } from "./dot-field-mount"
import { HOW_FIELD } from "./dot-field-engine"

const HOW = "/home/how"

/** Landing round 9 (the owner: a new heading, the products card is gone): what the three cards below are. */
export const HOW_HEADING = { lead: "Take tips. See what sells.", rest: "All on your own domain." } as const

/** The shop every picture in this section belongs to (made up). */
export const HOW_SHOP = {
  creator: "Ruben Linde",
  first: "Ruben",
  name: "Linde Woodshop",
  avatar: `${HOW}/linde-avatar.webp`,
} as const

/**
 * The digital product: Cine Tones, the LUT pack section 3 sells, on the same
 * cover: black, the graded desert road still across its top, "LUT Pack"
 * small, "Cine Tones" big and heavy. The still is section 3's file; the
 * cover is drawn in this file.
 */
export const HOW_LUTS = {
  name: "Cine Tones LUT Pack",
  tag: "LUT Pack",
  words: ["Cine", "Tones"],
  still: "/home/everything/lut-still.webp",
  priceCents: 2900,
} as const

/** The shop's two products, best seller first, with what section 3 says each has sold. */
export const HOW_PRODUCTS = [
  { id: "luts", name: HOW_LUTS.name, priceCents: HOW_LUTS.priceCents, sold: 386 },
  { id: "tee", name: "Midnight Studio Tee", img: "/home/everything/tee.webp", priceCents: 3200, sold: 214 },
] as const

/** Thirty days of orders, [LUT packs, tees] a day, ending on the last day drawn. They add up to HOW_PRODUCTS' sold. */
export const HOW_DAYS: readonly (readonly [number, number])[] = [
  [7, 4], [8, 4], [9, 5], [11, 6], [12, 6], [12, 6], [11, 5], [10, 5], [10, 5], [11, 6],
  [12, 8], [13, 8], [14, 9], [14, 9], [13, 8], [12, 6], [11, 6], [12, 7], [13, 7], [14, 8],
  [15, 9], [15, 8], [14, 8], [13, 7], [13, 7], [14, 8], [15, 9], [17, 9], [19, 10], [22, 11],
]
/** What each day sold, in cents. */
export const HOW_DAY_CENTS = HOW_DAYS.map(([l, t]) => l * HOW_PRODUCTS[0].priceCents + t * HOW_PRODUCTS[1].priceCents)
/** The thirty days' sales, in cents: section 3's $11,194 and $6,848. */
export const HOW_SALES_CENTS = HOW_DAY_CENTS.reduce((a, b) => a + b, 0)
/** How far the period is up on the one before it (an example). */
export const HOW_SALES_UP = "18%"
/** The days' names: 16 October to 14 November. */
const DAY_NAMES = HOW_DAYS.map((_, i) => (i < 16 ? `Oct ${16 + i}` : `Nov ${i - 15}`))

/** Where the period's 600 orders came from. */
export const HOW_COUNTRIES = [
  { code: "US", name: "United States", orders: 330 },
  { code: "GB", name: "United Kingdom", orders: 148 },
  { code: "DE", name: "Germany", orders: 122 },
] as const

/**
 * Ruben's own domain (made up), serving his website (lib/custom-domains
 * DOMAIN_PURPOSES: a domain serves one thing, here the website), and the
 * address the website has on Storelib before he connects it. Landing round
 * 10: "lindewood", short enough for one line on a narrow card.
 */
export const HOW_DOMAIN = {
  name: "lindewood",
  host: "lindewood.com",
  before: "lindewood.storelib.com",
  purpose: "website" satisfies DomainPurpose,
} as const

/** The front page of his website in the domain card: a photograph from a workshop (Unsplash, 640x420). */
export const HOW_DOMAIN_PHOTO = `${HOW}/linde-turning.webp`

/** The three cards, in the row's order: narrow, wide, narrow. A title and one short line each. */
export const HOW_CARDS = [
  { key: "tips", wide: false, title: "Take tips", line: "A thank you button for people who want to support your work." },
  { key: "business", wide: true, title: "Understand your business", line: "Sales, top products and where your orders come from." },
  { key: "domain", wide: false, title: "Use your own domain", line: "On Grow, point a domain you own at your site. HTTPS is set up for you." },
] as const

/**
 * Each card runs its loops only while that card is near the screen and the
 * tab is visible (data-commerce-live), and plays what happens once the first
 * time a third of its picture is on screen (data-seen). Both are attributes
 * on the card that the CSS reads; nothing here is React state.
 */
function useCardsLive(grid: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = grid.current
    if (!root) return
    const cards = [...root.querySelectorAll<HTMLElement>(".cmh-card")]
    const near = new Set<Element>()
    const apply = () => {
      for (const t of cards) t.toggleAttribute("data-commerce-live", near.has(t) && !document.hidden)
    }
    if (typeof IntersectionObserver !== "function") {
      for (const t of cards) {
        near.add(t)
        t.setAttribute("data-seen", "")
      }
      apply()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) near.add(e.target)
          else near.delete(e.target)
        }
        apply()
      },
      { rootMargin: "120px 0px" },
    )
    const once = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          ;(e.target.closest(".cmh-card") ?? e.target).setAttribute("data-seen", "")
          once.unobserve(e.target)
        }
      },
      { threshold: 0.35 },
    )
    for (const t of cards) {
      io.observe(t)
      once.observe(t.querySelector(".cmh-stage") ?? t)
    }
    document.addEventListener("visibilitychange", apply)
    return () => {
      io.disconnect()
      once.disconnect()
      document.removeEventListener("visibilitychange", apply)
    }
  }, [grid])
}

/* ── the dot field behind the heading ── */
/** Distance between dots, the largest device pixel ratio drawn, and how the dots look on white (the engine's, dot-field-engine.ts; the worker cannot import this file). */
export { HOW_FIELD }

/**
 * A field of faint dots on the white ground. An even grid; a slow wave of two
 * long sines bent into each other shades it, so bands of dots drift across
 * like a current; a soft violet light wanders through it on its own and,
 * while a mouse is over the section, glides after the mouse (a dt-timed lerp,
 * no jump), the dots under it parting a little. The fade toward the cards and
 * the sides is each dot's own brightness, worked out on resize, so there is
 * no mask to composite.
 *
 * Landing round 6: it is drawn by the shared engine (dot-field-engine.ts) in a
 * worker, on canvases the page hands over (dot-field-mount.ts), so the page's
 * thread draws nothing: it only tells the engine when the field is on screen,
 * its size, and (a mouse only, at most once a frame) where the mouse is over
 * the section. Reduced motion: one still frame.
 */
function HowField({ host }: { host: RefObject<HTMLElement | null> }) {
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = boxRef.current
    const section = host.current
    if (!box || !section) return
    return mountDotField(box, { kind: "how", gap: HOW_FIELD.gap, pointer: section })
  }, [host])
  return <div ref={boxRef} className="cmh-field" aria-hidden="true" />
}

/*
  The domain card's cut: how far ".com" slides left to close over
  ".storelib" as it fades. Measured once, and again only when the card's
  size changes (its type follows its width), never in a frame.
*/
function useDomainCut(grid: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const card = grid.current?.querySelector<HTMLElement>(".cmh-dm")
    const cut = card?.querySelector<HTMLElement>(".cmh-dm-cut")
    if (!card || !cut) return
    const measure = () => {
      const w = cut.getBoundingClientRect().width
      if (w > 0) card.style.setProperty("--dm-cut", `${w.toFixed(1)}px`)
    }
    measure()
    if (typeof ResizeObserver !== "function") return
    const ro = new ResizeObserver(measure)
    ro.observe(card)
    return () => ro.disconnect()
  }, [grid])
}

export function HowItWorks() {
  const section = useRef<HTMLElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  useCardsLive(grid)
  useDomainCut(grid)
  const pictures: Record<(typeof HOW_CARDS)[number]["key"], ReactNode> = {
    tips: <TipScene />,
    business: <BusinessScene />,
    domain: <DomainScene />,
  }
  return (
    <section ref={section} className="cmh" data-how-section="" aria-labelledby="cmh-title">
      <style href="w12-commerce-how" precedence="default">
        {HOW_CSS}
      </style>
      <HowField host={section} />
      <div className="cmh-in home-wrap">
        <h2 id="cmh-title" className="cmh-h">
          {HOW_HEADING.lead} <span className="cmh-h-mute">{HOW_HEADING.rest}</span>
        </h2>
        <div ref={grid} className="cmh-grid">
          {HOW_CARDS.map((c) => (
            <article key={c.key} className={`cmh-card ${c.wide ? "cmh-wide" : "cmh-narrow"}`} data-card={c.key}>
              <div className="cmh-stage" data-ground={c.key} aria-hidden="true">
                {pictures[c.key]}
              </div>
              <h3 className="cmh-cap-t">{c.title}</h3>
              <p className="cmh-cap">{c.line}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/** The LUT pack's cover, section 3's: a black square, the graded still across its top fading into the black, "LUT Pack" small, the name big. Sized in its own width. */
function LutCover({ className = "" }: { className?: string }) {
  return (
    <span className={`cmh-lut ${className}`}>
      <img src={HOW_LUTS.still} alt="" width={720} height={405} loading="lazy" decoding="async" />
      <span className="cmh-lut-tag">{HOW_LUTS.tag}</span>
      <span className="cmh-lut-name">
        {HOW_LUTS.words.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </span>
    </span>
  )
}

/*
  1. TIPS (landing round 11). Ruben's tips as he sees them: one white panel,
  this month's total over a short list of the latest tips, a new one sliding
  in at the top every three seconds and the oldest leaving at the bottom.
  The list is one column that steps down a row at a time (one transform);
  it repeats its first three rows at its end, so the loop closes where it
  began. A still mask on the window softens its top and bottom edge.
*/
/** The tips, newest first. They arrive in the opposite order: Theo's first, Marco's last, so after a loop the list reads as it started. */
export const HOW_TIPS = [
  { who: "Marco", color: "#f59e0b", amount: "$10", note: "For the walnut tray video" },
  { who: "Priya", color: "#3b82f6", amount: "$5", note: "Your jig saved my weekend" },
  { who: "Sam", color: "#10b981", amount: "$3", note: "Thanks for the free plans" },
  { who: "Hana", color: "#ec4899", amount: "$5", note: "More lathe videos please" },
  { who: "Theo", color: "#8b5cf6", amount: "$10", note: "Built my first bench" },
] as const
/** Seconds between two tips arriving. */
export const HOW_TIP_EVERY_S = 3
/** The amounts a visitor can pick on Ruben's page (the tip button's own three). */
export const TIP_AMOUNTS = ["$3", "$5", "$10"] as const
const TIP_ROWS = [...HOW_TIPS, ...HOW_TIPS.slice(0, 3)]

function TipScene() {
  return (
    <div className="cmh-sc cmh-tip">
      <div className="cmh-tip-panel">
        <div className="cmh-tip-head">
          <img src={HOW_SHOP.avatar} alt="" loading="lazy" decoding="async" width={160} height={160} />
          <span className="cmh-tip-who">
            <b>Tips</b>
            <small>This month</small>
          </span>
          <b className="cmh-tip-sum">$1,284</b>
        </div>
        <div className="cmh-tip-win">
          <div className="cmh-a cmh-tip-list">
            {TIP_ROWS.map((t, i) => (
              <span key={i} className="cmh-tip-row">
                <i style={{ background: t.color }}>{t.who[0]}</i>
                <span className="cmh-tip-w">
                  <b>{t.who}</b>
                  <small>{t.note}</small>
                </span>
                <em>{t.amount}</em>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/*
  2. THE NUMBERS (landing round 11). One white panel: thirty days of sales
  as thirty slim bars that rise once, the first time the card is seen (each
  a scale from its foot, a little after the one before), with the period's
  total over them. Then a soft column glides from day to day and the day's
  sum rides over it, four stops in a loop (one transform for the column,
  one for the label, and the four sums crossfading). Beside it on a wide
  card: the two best sellers and the three countries, each with a share bar
  that fills once (a scale from the left).
*/
/** The days the reading glides to, in order (indices into HOW_DAYS). */
export const HOW_READ_DAYS = [9, 17, 23, 29] as const
const BAR_MAX = Math.max(...HOW_DAY_CENTS)
const PRODUCT_MAX = Math.max(...HOW_PRODUCTS.map((p) => p.priceCents * p.sold))
const COUNTRY_MAX = Math.max(...HOW_COUNTRIES.map((c) => c.orders))

const FLAGS: Record<(typeof HOW_COUNTRIES)[number]["code"], ReactNode> = {
  US: (
    <>
      <path fill="#fff" d="M0 0h24v16H0z" />
      <path stroke="#d0303f" strokeWidth="1.78" d="M0 .9h24M0 4.45h24M0 8h24M0 11.55h24M0 15.1h24" />
      <path fill="#33407e" d="M0 0h10.5v8.9H0z" />
    </>
  ),
  GB: (
    <>
      <path fill="#26346e" d="M0 0h24v16H0z" />
      <path stroke="#fff" strokeWidth="3.2" d="m0 0 24 16M24 0 0 16" />
      <path stroke="#cf2f3c" strokeWidth="1.3" d="m0 0 24 16M24 0 0 16" />
      <path stroke="#fff" strokeWidth="5.4" d="M12 0v16M0 8h24" />
      <path stroke="#cf2f3c" strokeWidth="3.2" d="M12 0v16M0 8h24" />
    </>
  ),
  DE: (
    <>
      <path fill="#1c1c1e" d="M0 0h24v5.4H0z" />
      <path fill="#d6303a" d="M0 5.3h24v5.4H0z" />
      <path fill="#f6c63a" d="M0 10.6h24V16H0z" />
    </>
  ),
}

function BusinessScene() {
  return (
    <div className="cmh-sc cmh-biz">
      <div className="cmh-biz-panel">
        <div className="cmh-sales">
          <div className="cmh-sales-top">
            <span>Sales</span>
            <small>Last 30 days</small>
          </div>
          <div className="cmh-sales-sum">
            <b>{commerceUsd(HOW_SALES_CENTS, true)}</b>
            <span>
              <svg viewBox="0 0 10 10" width=".62em" height=".62em" fill="currentColor">
                <path d="M5 1.2 9.4 8.6H.6z" />
              </svg>
              {HOW_SALES_UP}
            </span>
          </div>
          <div className="cmh-bars" style={{ "--n": HOW_DAYS.length } as CSSProperties}>
            <span className="cmh-a cmh-read" />
            {HOW_DAY_CENTS.map((c, i) => (
              <span key={i} className="cmh-bar" data-today={i === HOW_DAY_CENTS.length - 1 ? "" : undefined}>
                <i className="cmh-o" style={{ height: `${((c / BAR_MAX) * 100).toFixed(1)}%`, animationDelay: `${(0.1 + i * 0.022).toFixed(3)}s` }} />
              </span>
            ))}
            <span className="cmh-a cmh-read-tip">
              {HOW_READ_DAYS.map((d, k) => (
                <span key={d} className="cmh-a cmh-read-v" data-k={k}>
                  <small>{DAY_NAMES[d]}</small>
                  <b>{commerceUsd(HOW_DAY_CENTS[d], false)}</b>
                </span>
              ))}
            </span>
          </div>
          <div className="cmh-sales-days">
            <span>{DAY_NAMES[0]}</span>
            <span>{DAY_NAMES[DAY_NAMES.length - 1]}</span>
          </div>
        </div>
        <div className="cmh-biz-side">
          <div className="cmh-side-block">
            <b className="cmh-side-t">Top products</b>
            {HOW_PRODUCTS.map((p, i) => (
              <span key={p.id} className="cmh-side-row">
                <span className="cmh-top-pic" data-kind={p.id}>
                  {p.id === "luts" ? <LutCover /> : <img src={p.img} alt="" width={480} height={480} loading="lazy" decoding="async" />}
                </span>
                <span className="cmh-side-w">
                  <span className="cmh-side-l">
                    <span>{p.name}</span>
                    <b>{commerceUsd(p.priceCents * p.sold, false)}</b>
                  </span>
                  <span className="cmh-share">
                    <i className="cmh-o" style={{ "--s": ((p.priceCents * p.sold) / PRODUCT_MAX).toFixed(3), animationDelay: `${0.5 + i * 0.12}s` } as CSSProperties} />
                  </span>
                </span>
              </span>
            ))}
          </div>
          <div className="cmh-side-block cmh-geo">
            <b className="cmh-side-t">Orders by country</b>
            {HOW_COUNTRIES.map((c, i) => (
              <span key={c.code} className="cmh-side-row">
                <svg className="cmh-flag" viewBox="0 0 24 16" fill="none">
                  {FLAGS[c.code]}
                </svg>
                <span className="cmh-side-w">
                  <span className="cmh-side-l">
                    <span>{c.name}</span>
                    <b>{c.orders}</b>
                  </span>
                  <span className="cmh-share">
                    <i className="cmh-o" style={{ "--s": (c.orders / COUNTRY_MAX).toFixed(3), animationDelay: `${0.75 + i * 0.1}s` } as CSSProperties} />
                  </span>
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/*
  3. YOUR OWN DOMAIN (landing round 11). Ruben's website in a browser, its
  front page a photograph from his workshop. The address reads his
  Storelib address, lindewood.storelib.com; then ".storelib" fades and
  ".com" closes over it, the lock turns violet, and it reads lindewood.com.
  It holds, the address fades out and back in on the Storelib address, and
  the loop begins again. Two transforms and three opacities; the distance
  ".com" travels is measured once (useDomainCut), never in a frame.
*/
function DomainScene() {
  return (
    <div className="cmh-sc cmh-dm">
      <div className="cmh-dm-win">
        <div className="cmh-dm-bar">
          <span className="cmh-dm-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="cmh-dm-addr">
            <span className="cmh-dm-lock">
              <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="10.5" width="14" height="10" rx="2.4" />
                <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
              </svg>
              <span className="cmh-a cmh-dm-on">
                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="10.5" width="14" height="10" rx="2.4" />
                  <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
                </svg>
              </span>
            </span>
            <span className="cmh-a cmh-dm-text">
              <span className="cmh-dm-name">{HOW_DOMAIN.name}</span>
              <span className="cmh-a cmh-dm-cut">.storelib</span>
              <span className="cmh-a cmh-dm-com">.com</span>
            </span>
          </span>
        </div>
        <div className="cmh-dm-page">
          <img src={HOW_DOMAIN_PHOTO} alt="" width={640} height={420} loading="lazy" decoding="async" />
          <span className="cmh-dm-nav">
            <b>{HOW_SHOP.name}</b>
            <span>Shop</span>
            <span>Videos</span>
          </span>
          <span className="cmh-dm-hero">
            <b>Made slowly, by hand.</b>
            <span>Shop the build</span>
          </span>
        </div>
      </div>
    </div>
  )
}

const EASE = "cubic-bezier(.22,1,.36,1)"
/* The loops' clocks, and their keyframes worked out once (transform and opacity only). */
const pc = (x: number) => `${+x.toFixed(3)}%`
const TIP_N = HOW_TIPS.length
const TIP_LOOP = TIP_N * HOW_TIP_EVERY_S
/** The list steps down a row a tip: it holds, then glides the last 0.8s of each interval. */
const TIP_KEYS = Array.from({ length: TIP_N }, (_, k) => {
  const from = `translate3d(0,calc(var(--row) * -${TIP_N - k}),0)`
  const to = `translate3d(0,calc(var(--row) * -${TIP_N - k - 1}),0)`
  const end = ((k + 1) * HOW_TIP_EVERY_S) / TIP_LOOP
  const glide = end - 0.8 / TIP_LOOP
  return `${k === 0 ? "0%," : ""}${pc(glide * 100)}{transform:${from}}${pc(end * 100)}{transform:${to}}`
}).join("")
/** The reading: three seconds a day, the first 0.9s of each a glide from the day before. */
const READ_EACH_S = 3
const READ_LOOP = HOW_READ_DAYS.length * READ_EACH_S
const readAt = (d: number) => `translate3d(calc(${d} * (100% + var(--gap))),0,0)`
const READ_KEYS = HOW_READ_DAYS.map((d, k) => {
  const start = (k * READ_EACH_S) / READ_LOOP
  const arrive = (k * READ_EACH_S + 0.9) / READ_LOOP
  const prev = HOW_READ_DAYS[(k + HOW_READ_DAYS.length - 1) % HOW_READ_DAYS.length]
  return `${pc(start * 100)}{transform:${readAt(prev)}}${pc(arrive * 100)}{transform:${readAt(d)}}`
}).join("") + `100%{transform:${readAt(HOW_READ_DAYS[HOW_READ_DAYS.length - 1])}}`
/** Each day's sum shows while the reading stands on its day. */
const READ_V_KEYS = HOW_READ_DAYS.map((_, k) => {
  const a = ((k * READ_EACH_S + 0.7) / READ_LOOP) * 100
  const b = ((k * READ_EACH_S + 1.0) / READ_LOOP) * 100
  const c = (((k + 1) * READ_EACH_S - 0.25) / READ_LOOP) * 100
  const d = (((k + 1) * READ_EACH_S) / READ_LOOP) * 100
  return `.cmh-read-v[data-k="${k}"]{animation-name:cmh-rv${k}}\n@keyframes cmh-rv${k}{0%,${pc(a)}{opacity:0}${pc(b)},${pc(c)}{opacity:1}${pc(d)},100%{opacity:0}}`
}).join("\n")
const READ_LAST = HOW_READ_DAYS[HOW_READ_DAYS.length - 1]
const READ_LAST_K = HOW_READ_DAYS.length - 1
/** The domain card's loop, in seconds. */
const DM_LOOP = 9
const TIP_EVERY = HOW_TIP_EVERY_S

const HOW_CSS = `
/* Its own box, like section 3: no data-story-section, whose global rule would hold the content to 1400px and the older gutter. The same --home-pad top and bottom. A stacking context, so the dot field sits behind the words and never behind the page. */
.cmh{position:relative;isolation:isolate;background:#fff;color:#18181b;padding-block:var(--home-pad,clamp(48px,5.6vw,80px))}
/* The page's shared box (globals.css .home-wrap), restated with the same values so the section holds its edges on its own. */
.cmh-in{box-sizing:border-box;width:100%;max-width:var(--home-max,2020px);margin-inline:auto;padding-inline:var(--home-edge,clamp(20px,5.15vw,84px))}
/* The dots behind the heading: the head of the section only, gone by the middle of the cards (the fade is each dot's own brightness). */
.cmh-field{position:absolute;z-index:-1;left:0;right:0;top:0;height:min(100%,clamp(420px,46vw,640px));overflow:clip;pointer-events:none}
.cmh-field canvas{position:absolute;left:0;display:block;width:100%;opacity:0;transition:opacity .9s ease-out}
.cmh-field canvas[data-drawn]{opacity:1}
/* Section 3's heading: two tones, the lead dark and the rest grey; it starts --home-head-inset in from the cards' edge. */
.cmh-h{margin:0 0 clamp(32px,4.4vw,60px);padding-left:var(--home-head-inset,14px);font-size:clamp(34px,4.6vw,64px);font-weight:500;line-height:1.05;letter-spacing:-.045em;color:#18181b;text-wrap:balance}
.cmh-h-mute{display:block;color:#8e8c96}
@media(max-width:767px){.cmh-h{padding-left:var(--home-head-inset,0px)}}
/* One column on a phone. From 640px the wide card leads on a row of its own with the two narrow cards under it. From 1100px the row of the reference: narrow, wide, narrow, the wide card twice a narrow one. */
.cmh-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:40px}
@media(min-width:640px) and (max-width:1099px){
  .cmh-grid{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:clamp(16px,2vw,28px);row-gap:44px}
  .cmh-wide{grid-column:1/-1;order:-1}
}
@media(min-width:1100px){.cmh-grid{grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr);column-gap:clamp(16px,1.5vw,28px)}}
.cmh-card{min-width:0}
.cmh-stage{position:relative;pointer-events:none;user-select:none;-webkit-user-select:none;height:430px;border-radius:17px;background:#f4f4f6;overflow:hidden;contain:paint;isolation:isolate;container-type:inline-size;font-family:inherit}
.cmh-wide .cmh-stage{height:440px}
@media(min-width:640px){.cmh-stage,.cmh-wide .cmh-stage{height:420px;border-radius:19px}}
/* Landing round 10, the owner (a MacBook Air, about 1440x800): the heading and the row fit one screen. The pictures stop at half the screen's height, never under 360px. */
@media(min-width:1100px){.cmh-stage,.cmh-wide .cmh-stage{height:max(360px,min(clamp(400px,32vw,560px),50svh))}}
/* The grounds (landing round 11): one quiet near white a card, a breath of colour each, no rings, no glow, no glass. Each picture is one white panel on it. */
.cmh-stage[data-ground=tips]{background:#f3f1f8}
.cmh-stage[data-ground=business]{background:#f3f3f5}
.cmh-stage[data-ground=domain]{background:#f5f2ee}
/* The caption: a title and one short line under it. */
.cmh-cap-t{margin:22px 0 0;font-size:18px;font-weight:500;line-height:1.3;letter-spacing:-.015em;color:#18181b}
.cmh-cap{margin:6px 0 0;max-width:40ch;font-size:15px;line-height:1.5;color:#7c7a84;text-wrap:pretty}
@media(min-width:768px){.cmh-cap-t{font-size:19px}.cmh-cap{font-size:15.5px}}

/* Every loop is one of these, so going live restyles only the moving parts (a class, never * or a tag, in the rule keyed on data-commerce-live). */
.cmh-a{animation-duration:8s;animation-timing-function:${EASE};animation-iteration-count:infinite;animation-fill-mode:both;animation-play-state:paused!important}
[data-commerce-live] .cmh-a{animation-play-state:running!important}
/* What plays once, the first time its card is seen. */
/* Landing round 11 perf: fill backwards, not both. Each bar's last keyframe is its resting style, so after it has risen there is nothing to hold, and a finished animation that still held a fill kept a layer for each of the 60 bars for good. */
.cmh-o{animation-duration:.7s;animation-timing-function:${EASE};animation-fill-mode:backwards;animation-play-state:paused}
[data-seen] .cmh-o{animation-play-state:running}
/* A picture is drawn in em: its font size follows its card's width, so one drawing fits a narrow card at 1100px and a wide one at 1920. */
.cmh-sc{position:absolute;inset:0;display:grid;place-items:center;font-size:clamp(10.5px,4.6cqw,18px);line-height:1.3;color:#18181b}
.cmh-biz{font-size:clamp(10px,2.3cqw,19px)}
/* One white panel a picture: a hairline and one soft shadow, the same on all three. */
.cmh-tip-panel,.cmh-biz-panel,.cmh-dm-win{background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.06),0 1.6em 3em -2em rgba(24,24,27,.28);box-sizing:border-box}

/* ── the LUT pack's cover: section 3's (everything-in-one-place .ev-lut), sized in its own width ── */
.cmh-lut{position:relative;display:block;aspect-ratio:1;overflow:hidden;background:#0a0a0b;color:#fff;container-type:inline-size}
.cmh-lut img{position:absolute;left:0;top:0;display:block;width:100%;height:64%;object-fit:cover;object-position:50% 60%}
.cmh-lut::before{content:"";z-index:1;position:absolute;left:0;right:0;top:0;height:30%;background:linear-gradient(rgba(10,10,11,.5),rgba(10,10,11,0))}
.cmh-lut::after{content:"";position:absolute;left:0;right:0;top:26%;height:39%;background:linear-gradient(rgba(10,10,11,0),rgba(10,10,11,.55) 50%,#0a0a0b)}
.cmh-lut-tag{z-index:1;position:absolute;left:7cqw;top:7cqw;font-size:max(4.6cqw,3px);font-weight:600;line-height:1;letter-spacing:.18em;text-transform:uppercase}
.cmh-lut-name{z-index:1;position:absolute;left:6.4cqw;bottom:6.4cqw;display:flex;flex-direction:column;font-size:21cqw;font-weight:800;line-height:.84;letter-spacing:-.05em;text-transform:uppercase}

/* ── 1. tips: the month's total over the latest tips, a new one sliding in at the top every ${TIP_EVERY}s ── */
.cmh-tip-panel{--row:3.3em;width:17.6em;padding:1.05em 1.05em .5em;border-radius:1.35em}
.cmh-tip-head{display:flex;align-items:center;gap:.7em;padding-bottom:.9em;border-bottom:1px solid #efeff2}
.cmh-tip-head img{flex:none;width:2.5em;height:2.5em;border-radius:50%;object-fit:cover;background:#e7e5ee}
.cmh-tip-who{flex:1;min-width:0;display:grid}
.cmh-tip-who b{font-size:.95em;font-weight:600;letter-spacing:-.01em}
.cmh-tip-who small{font-size:.76em;color:#8b8b94}
.cmh-tip-sum{font-size:1.45em;font-weight:600;letter-spacing:-.035em;font-variant-numeric:tabular-nums}
/* The window: three rows tall; its top and bottom soften through a mask that never moves. */
.cmh-tip-win{position:relative;height:calc(var(--row) * 3);overflow:hidden;-webkit-mask-image:linear-gradient(transparent,#000 22%,#000 72%,transparent);mask-image:linear-gradient(transparent,#000 22%,#000 72%,transparent)}
.cmh-tip-list{display:block;transform:translate3d(0,calc(var(--row) * -${TIP_N}),0);animation-name:cmh-tips;animation-duration:${TIP_LOOP}s;animation-timing-function:cubic-bezier(.65,0,.35,1)}
@keyframes cmh-tips{${TIP_KEYS}}
.cmh-tip-row{display:flex;align-items:center;gap:.65em;height:var(--row);box-sizing:border-box;border-bottom:1px solid #f3f3f5}
.cmh-tip-row>i{flex:none;display:grid;place-items:center;width:2.1em;height:2.1em;border-radius:50%;color:#fff;font-size:.86em;font-style:normal;font-weight:700}
.cmh-tip-w{flex:1;min-width:0;display:grid}
.cmh-tip-w b{font-size:.84em;font-weight:600}
.cmh-tip-w small{font-size:.74em;color:#7c7a84;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-tip-row>em{flex:none;font-size:.86em;font-style:normal;font-weight:600;color:#6d3fe0;font-variant-numeric:tabular-nums}

/* ── 2. the numbers: thirty bars that rise once, a reading gliding over four days, the best sellers and the countries with share bars ── */
.cmh-biz-panel{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:1.6em;width:min(92%,38em);padding:1.4em 1.5em 1.2em;border-radius:1.35em}
.cmh-sales{display:flex;flex-direction:column;min-width:0}
.cmh-sales-top{display:flex;align-items:baseline;justify-content:space-between;font-size:.86em;font-weight:500}
.cmh-sales-top small{font-size:.9em;font-weight:400;color:#8b8b94}
.cmh-sales-sum{display:flex;align-items:baseline;gap:.7em;margin-top:.3em}
.cmh-sales-sum b{font-size:1.85em;font-weight:600;line-height:1.1;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.cmh-sales-sum span{display:inline-flex;align-items:center;gap:.3em;font-size:.86em;font-weight:600;color:#7c4ff0}
.cmh-bars{--gap:.22em;position:relative;display:flex;align-items:flex-end;gap:var(--gap);height:9.5em;margin-top:2.4em}
.cmh-bar{position:relative;flex:1;height:100%;display:flex;align-items:flex-end}
.cmh-bar>i{display:block;width:100%;border-radius:.2em .2em .08em .08em;background:#ddd3fb;transform-origin:50% 100%;animation-name:cmh-rise;animation-duration:.9s}
.cmh-bar[data-today]>i{background:#8b5cf6}
@keyframes cmh-rise{from{transform:scaleY(.02);opacity:.4}to{transform:scaleY(1);opacity:1}}
/* The reading: a soft column one day wide, and the day's sum over it, gliding to four days in turn. */
.cmh-read,.cmh-read-tip{position:absolute;left:0;top:0;bottom:0;width:calc((100% - var(--gap) * (var(--n) - 1)) / var(--n));animation-duration:${READ_LOOP}s;animation-timing-function:cubic-bezier(.65,0,.35,1);animation-name:cmh-read}
.cmh-read{top:-.3em}
.cmh-read::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:1px;margin-left:-.5px;background:rgba(24,24,27,.22)}
.cmh-read-tip{bottom:auto;top:-2.2em;height:0;display:grid;justify-items:center}
.cmh-read-v{grid-area:1/1;display:flex;gap:.45em;padding:.28em .55em;border-radius:.5em;background:#18181b;color:#fff;font-size:.72em;white-space:nowrap;font-variant-numeric:tabular-nums;opacity:0;animation-duration:${READ_LOOP}s;animation-timing-function:linear}
.cmh-read-v small{color:#b9b8c2;font-size:1em}
.cmh-read-v b{font-weight:600}
@keyframes cmh-read{${READ_KEYS}}
${READ_V_KEYS}
.cmh-sales-days{display:flex;justify-content:space-between;margin-top:.6em;font-size:.72em;color:#a1a1aa;font-variant-numeric:tabular-nums}
.cmh-biz-side{display:grid;align-content:center;gap:1.3em;min-width:0}
.cmh-side-block{display:grid;gap:.75em;min-width:0}
.cmh-side-t{font-size:.84em;font-weight:500}
.cmh-side-row{display:flex;align-items:center;gap:.65em;min-width:0}
.cmh-top-pic{flex:none;display:block;width:2.3em;height:2.3em;border-radius:.5em;overflow:hidden;background:#e9e9ec}
.cmh-top-pic img{display:block;width:100%;height:100%;object-fit:cover}
.cmh-top-pic[data-kind=tee] img{transform:scale(1.5)}
.cmh-flag{flex:none;display:block;width:1.6em;height:1.07em;border-radius:.2em;overflow:hidden;box-shadow:0 0 0 1px rgba(24,24,27,.1)}
.cmh-side-w{flex:1;min-width:0;display:grid;gap:.35em}
.cmh-side-l{display:flex;justify-content:space-between;gap:.6em;font-size:.76em}
.cmh-side-l>span{min-width:0;color:#3f3f46;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-side-l>b{font-weight:600;font-variant-numeric:tabular-nums}
.cmh-share{display:block;height:.32em;border-radius:1em;background:#f0eff3;overflow:hidden}
.cmh-share>i{display:block;height:100%;width:100%;border-radius:1em;background:#8b5cf6;transform-origin:0 50%;transform:scaleX(var(--s));animation-name:cmh-fill;animation-duration:1.1s}
.cmh-geo .cmh-share>i{background:#c4b5fd}
@keyframes cmh-fill{from{transform:scaleX(0)}to{transform:scaleX(var(--s))}}
/* A narrow card (a phone): the bars on their own, the best sellers under them; the countries stay on the wider cards. */
@container (max-width:440px){
  .cmh-biz{font-size:clamp(11px,4.1cqw,15px)}
  .cmh-biz-panel{grid-template-columns:minmax(0,1fr);gap:1.2em;width:21.5em;padding:1.2em 1.25em 1.1em}
  .cmh-bars{height:7.4em}
  .cmh-geo{display:none}
}

/* ── 3. your own domain: his website in a browser, the address closing from lindewood.storelib.com to lindewood.com ── */
.cmh-dm{place-items:center}
.cmh-dm-win{position:relative;width:19.5em;border-radius:1em;overflow:hidden;transform:translateZ(0)}
.cmh-dm-bar{display:flex;align-items:center;gap:.6em;height:2.6em;padding:0 .7em;border-bottom:1px solid #efeff2;background:#fafafa}
.cmh-dm-dots{display:flex;gap:.3em}
.cmh-dm-dots i{width:.5em;height:.5em;border-radius:50%;background:#dcdce1}
.cmh-dm-addr{flex:1;display:flex;align-items:center;gap:.45em;min-width:0;height:1.85em;padding:0 .65em;border-radius:.6em;background:#fff;box-shadow:inset 0 0 0 1px #ececf0;font-size:.86em;white-space:nowrap;overflow:hidden}
.cmh-dm-lock{position:relative;flex:none;display:grid;color:#a1a1aa;font-size:.9em}
.cmh-dm-on{position:absolute;inset:0;display:grid;color:#7c4ff0;opacity:0;animation-name:cmh-dm-on}
.cmh-dm-text{display:block;min-width:0;animation-name:cmh-dm-text}
.cmh-dm-name{font-weight:600;color:#18181b}
.cmh-dm-cut{display:inline-block;color:#8b8b94;animation-name:cmh-dm-cut}
.cmh-dm-com{display:inline-block;font-weight:600;color:#18181b;animation-name:cmh-dm-com}
.cmh-dm-on,.cmh-dm-text,.cmh-dm-cut,.cmh-dm-com{animation-duration:${DM_LOOP}s;animation-timing-function:cubic-bezier(.65,0,.35,1)}
@keyframes cmh-dm-cut{0%,34%{opacity:1}42%,93.5%{opacity:0}94%,100%{opacity:1}}
@keyframes cmh-dm-com{0%,36%{transform:translate3d(0,0,0)}48%,94%{transform:translate3d(calc(var(--dm-cut,4.3em) * -1),0,0)}94.01%,100%{transform:translate3d(0,0,0)}}
@keyframes cmh-dm-on{0%,46%{opacity:0}54%,88%{opacity:1}93%,100%{opacity:0}}
@keyframes cmh-dm-text{0%,88%{opacity:1}93%,95%{opacity:0}100%{opacity:1}}
.cmh-dm-page{position:relative;display:block;aspect-ratio:640/420;background:#2a211b;color:#fff}
.cmh-dm-page img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover}
.cmh-dm-page::after{content:"";position:absolute;inset:0;background:linear-gradient(rgba(20,14,10,.42),rgba(20,14,10,0) 34%,rgba(20,14,10,0) 50%,rgba(20,14,10,.62))}
.cmh-dm-nav{z-index:1;position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:.9em;padding:.8em .9em;font-size:.7em}
.cmh-dm-nav b{flex:1;font-weight:600;letter-spacing:-.01em}
.cmh-dm-nav span{opacity:.85}
.cmh-dm-hero{z-index:1;position:absolute;left:.9em;right:.9em;bottom:.9em;display:grid;justify-items:start;gap:.55em}
.cmh-dm-hero b{font-size:1.15em;font-weight:600;line-height:1.1;letter-spacing:-.03em}
.cmh-dm-hero span{padding:.38em .75em;border-radius:1em;background:#fff;color:#18181b;font-size:.68em;font-weight:600}

@media (prefers-reduced-motion:reduce){
  .cmh-a{animation:none!important}
  .cmh-o{animation:none!important}
  .cmh-field canvas{transition:none}
  .cmh-read,.cmh-read-tip{transform:translate3d(calc(${READ_LAST} * (100% + var(--gap))),0,0)}
  .cmh-read-v[data-k="${READ_LAST_K}"]{opacity:1}
  .cmh-dm-cut{opacity:0}
  .cmh-dm-com{transform:translate3d(calc(var(--dm-cut,4.3em) * -1),0,0)}
  .cmh-dm-on{opacity:1}
}
@media(scripting:none){.cmh-o{animation:none}}
`

/** This section's stylesheet, as it draws it: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const HOW_IT_WORKS_STYLES: readonly SectionStyle[] = [{ href: "w12-commerce-how", precedence: "default", css: HOW_CSS }]
