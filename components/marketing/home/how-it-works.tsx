"use client"

/**
 * ===========================================================================
 *  HOW IT WORKS: FOUR CARDS (home, section 8, landing round 7)
 * ===========================================================================
 * Laid out the way section 3 ("Sell what you make", everything-in-one-place)
 * is: a two tone heading, then four cards in a two by two grid, a wide card
 * and a narrower one, then a narrower one and a wide one. Each card is one
 * big picture with a caption under it, a bold lead sentence and a grey
 * continuation. The section sits in the page's shared box (--home-edge,
 * --home-max), so its edges line up with the showcase under the hero.
 *
 * One shop throughout: Ruben Linde's Linde Woodshop, a woodworker who films
 * his builds and sells a plain shop tee (physical, printed by a print partner
 * when it is ordered), Cine Tones, the LUT pack he grades his build videos
 * with (a download), a hand tool course, and takes tips. Round 7 (the owner)
 * took out Nadia Brooks, her print and the checkout tile; this file draws
 * its own data and imports nothing from the checkout scene's files.
 *
 *   products   one product card at a time, the tee and then the LUT pack:
 *              its price, what making it costs, what he keeps, its status.
 *              Round 8 (the owner): "just a t-shirt", and the LUT pack on
 *              the same black cover as section 3's, drawn here from the
 *              same still (LutCover), not imported
 *   course     the course player: a lesson playing and ticked off
 *   tips       a tip card choosing an amount, sending it, the tip landing
 *   domain     round 8 (the owner found the address banner with www, shop
 *              and club too complex): one browser window. His domain types
 *              into the address bar, the lock appears, and his website comes
 *              up under it. One idea, no rows
 *
 * The grounds (round 8, the owner: three light grey and one black "doesn't
 * work for the eye"): four light grounds of one family, each a soft tint
 * that leans toward its card's subject (sand, sage, clay, mist), all at the
 * same lightness, so no card is the odd one out.
 *
 * Every loop is CSS keyframes on transform and opacity only, in fixed-size
 * boxes, so nothing lays out while they play. They run only while their card
 * is on screen and the tab is visible (data-commerce-live); reduced motion
 * shows each card's finished frame, still.
 *
 * TRUE TO THE PRODUCT. Merch without stock is made on demand by a print
 * partner the seller connects (lib/physical/providers.ts); the tee's cost
 * is an example partner price. What the seller keeps is after Storelib's
 * real fee (lib/payments/fees/calculate). The player's words are the course
 * player's (components/courses/course-player.tsx). A domain a creator owns
 * serves one of three things: their website, their creator page (with the
 * OnePage at /links) or one community (lib/custom-domains/hostname
 * DOMAIN_PURPOSES); connecting one is on Pro (lib/sites/plan customDomain);
 * Storelib reads the DNS and waits for the certificate itself
 * (app/api/domains/verify).
 *
 * NOTHING IN A PICTURE IS A CONTROL: the stages take no pointer and have no
 * hover states, so a drawn button never looks like one that works.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from "react"
import type { SectionStyle } from "./lazy-section"
import type { DomainPurpose } from "@/lib/custom-domains/hostname"
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"
import { commerceUsd } from "./commerce-kit"

const HOW = "/home/how"

/** Landing round 7 (the owner: "more clean and simple", in section 3's two tones): what the four cards below are. */
export const HOW_HEADING = { lead: "Products, courses and tips.", rest: "On your own domain." } as const

/** One sale: Storelib's Free-plan fee, worked out by checkout's own function, and the print partner's cost for a piece made to order. */
function sale(priceCents: number, baseCents: number) {
  const fee = calculateStorelibFee({ grossMinor: priceCents, currency: "USD", sellerPlan: "free" }).totalStorelibFeeMinor
  return { priceCents, baseCents, keepCents: priceCents - fee - baseCents }
}

/** The shop every picture in this section belongs to (made up). */
export const HOW_SHOP = {
  creator: "Ruben Linde",
  first: "Ruben",
  name: "Linde Woodshop",
  avatar: `${HOW}/linde-avatar.webp`,
} as const

/**
 * The digital product (landing round 8, the owner): Cine Tones, the LUT pack
 * section 3 sells, on the same cover: black, the graded desert road still
 * across its top, "LUT Pack" small, "Cine Tones" big and heavy. The still is
 * section 3's file; the cover is drawn in this file.
 */
export const HOW_LUTS = {
  name: "Cine Tones LUT Pack",
  tag: "LUT Pack",
  words: ["Cine", "Tones"],
  still: "/home/everything/lut-still.webp",
  priceCents: 2900,
} as const

/** Ruben's shop: a plain tee printed when ordered, and the LUT pack. */
export const HOW_PRODUCTS = [
  {
    id: "tee",
    kind: "Physical",
    name: "Linde Shop Tee",
    how: "Printed when ordered",
    steps: ["New order", "Printing", "Shipped"],
    /** An example print partner price for a printed cotton tee. */
    ...sale(3200, 1250),
  },
  {
    id: "luts",
    kind: "Digital",
    name: HOW_LUTS.name,
    how: "Instant download",
    steps: ["New order", "Paid", "Delivered"],
    ...sale(HOW_LUTS.priceCents, 0),
  },
] as const

/**
 * Ruben's own domain (made up), serving his website (lib/custom-domains
 * DOMAIN_PURPOSES: a domain serves one thing, here the website). A bare
 * domain, typed the way a buyer types it.
 */
export const HOW_DOMAIN = {
  host: "lindewoodshop.com",
  purpose: "website" satisfies DomainPurpose,
} as const

/*
  The address typing in: each letter shows at its own moment of the loop,
  then the caret leaves, the lock comes in and the page loads. Percentages of
  one 9 second loop; every step is opacity or transform.
*/
const TYPE = { start: 7, step: 0.95, enter: 29, out: 92 } as const
const typedAt = (i: number) => +(TYPE.start + i * TYPE.step).toFixed(2)
const TYPED_CSS = [...HOW_DOMAIN.host]
  .map((_, i, all) => {
    const at = typedAt(i)
    const leave = i === all.length - 1 ? TYPE.enter : typedAt(i + 1)
    return (
      `.cmh-ch[data-k="${i}"]{animation-name:cmh-ch${i}}.cmh-ch[data-k="${i}"]>.cmh-caret{animation-name:cmh-ck${i}}` +
      `@keyframes cmh-ch${i}{0%,${at}%{opacity:0}${(at + 0.05).toFixed(2)}%,${TYPE.out}%{opacity:1}${TYPE.out + 2}%,100%{opacity:0}}` +
      `@keyframes cmh-ck${i}{0%,${at}%{opacity:0}${(at + 0.05).toFixed(2)}%,${leave}%{opacity:1}${(leave + 0.05).toFixed(2)}%,100%{opacity:0}}`
    )
  })
  .join("\n")

/** The four cards, in section 3's order: wide, narrow, then narrow, wide. */
export const HOW_CARDS = [
  { key: "products", wide: true, lead: "Sell physical and digital products.", rest: "Merch is made and shipped when it sells. Files go out instantly." },
  { key: "course", wide: false, lead: "Build and sell a course.", rest: "Video lessons and files, with each student's progress saved as they go." },
  { key: "tips", wide: false, lead: "Take tips.", rest: "A thank you button for the people who just want to support your work." },
  { key: "domain", wide: true, lead: "Use your own domain.", rest: "On Pro, point a domain you own at your website, your creator page or a community. Storelib checks the DNS and adds HTTPS." },
] as const

/**
 * Each card runs its loops only while that card is on screen and the tab is
 * visible (data-commerce-live on the card, which the CSS reads).
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
      for (const t of cards) near.add(t)
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
    for (const t of cards) io.observe(t)
    document.addEventListener("visibilitychange", apply)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", apply)
    }
  }, [grid])
}

/*
  Coming in as the page scrolls, as section 3's cards do: each card, the
  first time its top is a tenth of the screen above the bottom edge, fades in
  and rises 24px over 700ms; the second card of a row on a wide screen
  follows 110ms after. Only opacity and transform move, and the card is laid
  out where it ends from the start, so nothing below it shifts. Without
  script, under reduced motion and without IntersectionObserver every card
  simply stands.
*/
function useCardReveal(grid: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = grid.current
    if (!el) return
    const cards = Array.from(el.children) as HTMLElement[]
    const show = (card: HTMLElement) => {
      card.dataset.in = ""
    }
    if (typeof IntersectionObserver !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cards.forEach(show)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          show(e.target as HTMLElement)
          io.unobserve(e.target)
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    )
    cards.forEach((card) => io.observe(card))
    return () => io.disconnect()
  }, [grid])
}

export function HowItWorks() {
  const grid = useRef<HTMLDivElement>(null)
  useCardsLive(grid)
  useCardReveal(grid)
  const pictures: Record<(typeof HOW_CARDS)[number]["key"], { ground: Ground; scene: ReactNode }> = {
    products: { ground: "sand", scene: <ProductsScene /> },
    course: { ground: "sage", scene: <CourseScene /> },
    tips: { ground: "clay", scene: <TipScene /> },
    domain: { ground: "mist", scene: <DomainScene /> },
  }
  return (
    <section className="cmh" data-how-section="" aria-labelledby="cmh-title">
      <style href="w12-commerce-how" precedence="default">
        {HOW_CSS}
      </style>
      <div className="cmh-in home-wrap">
        <h2 id="cmh-title" className="cmh-h">
          {HOW_HEADING.lead} <span className="cmh-h-mute">{HOW_HEADING.rest}</span>
        </h2>
        <div ref={grid} className="cmh-grid">
          {HOW_CARDS.map((c) => (
            <article key={c.key} className={`cmh-card ${c.wide ? "cmh-wide" : "cmh-narrow"}`} data-card={c.key}>
              <div className="cmh-stage" data-ground={pictures[c.key].ground} aria-hidden="true">
                {pictures[c.key].scene}
              </div>
              <p className="cmh-cap">
                <b className="cmh-cap-lead">{c.lead}</b> {c.rest}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Four light tints of one family, one per card (landing round 8). Nothing moves in the ground. */
type Ground = "sand" | "sage" | "clay" | "mist"

const Check = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

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

/* 1. One product card at a time, the way a seller reads a product: price, cost, what he keeps, where its order is. */
function ProductsScene() {
  return (
    <div className="cmh-pr">
      <div className="cmh-stack cmh-pr-in">
        {HOW_PRODUCTS.map((p, i) => (
          <div key={p.id} className="cmh-a cmh-pc" data-k={i}>
            <div className="cmh-pc-pic" data-kind={p.id}>
              {p.id === "tee" ? <img src={`${HOW}/tee-white.webp`} alt="" width={560} height={560} loading="lazy" decoding="async" /> : <LutCover />}
            </div>
            <div className="cmh-pc-b">
              <span className="cmh-pc-kind">{p.kind}</span>
              <b className="cmh-pc-name">{p.name}</b>
              <dl className="cmh-pc-grid">
                <div>
                  <dt>Selling price</dt>
                  <dd>{commerceUsd(p.priceCents, true)}</dd>
                </div>
                <div>
                  <dt>{p.baseCents ? "Print cost" : "Delivery"}</dt>
                  <dd>{p.baseCents ? commerceUsd(p.baseCents, true) : "Instant"}</dd>
                </div>
                <div>
                  <dt>You keep</dt>
                  <dd className="cmh-pc-keep">{commerceUsd(p.keepCents, true)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd className="cmh-stack">
                    {p.steps.map((s, k) => (
                      <span key={s} className="cmh-a cmh-pc-step" data-p={i} data-k={k}>
                        <i data-k={k} />
                        {s}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const COURSE = [
  { t: "Sharpening a chisel", d: "9:10" },
  { t: "Sawing to a line", d: "7:45" },
  { t: "Planing a board flat", d: "8:30" },
  { t: "Your first dovetail", d: "12:05" },
] as const

/* 2. The course player: a lesson plays, it is ticked off, the count moves on. */
function CourseScene() {
  return (
    <div className="cmh-cp">
      <div className="cmh-cp-card">
        <div className="cmh-cp-vid">
          <img src={`${HOW}/lesson-plane.webp`} alt="" loading="lazy" decoding="async" width={560} height={350} />
          <span className="cmh-cp-bar">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
            </svg>
            <span className="cmh-cp-line">
              <span className="cmh-a cmh-cp-fill" />
            </span>
            <span>8:30</span>
          </span>
        </div>
        <div className="cmh-cp-head">
          <b>Lessons</b>
          <span className="cmh-stack cmh-cp-count">
            <span className="cmh-a cmh-cp-c1">2 of 7 done</span>
            <span className="cmh-a cmh-cp-c2">3 of 7 done</span>
          </span>
        </div>
        <span className="cmh-cp-prog">
          <span className="cmh-a cmh-cp-pfill" />
        </span>
        <ol className="cmh-cp-list">
          {COURSE.map((l, i) => (
            <li key={l.t} className="cmh-cp-row" data-now={i === 2 || undefined}>
              <span className="cmh-cp-mark" data-state={i < 2 ? "done" : i === 2 ? "now" : "wait"}>
                {i < 2 ? <Check size={10} /> : i === 2 ? (
                  <>
                    <svg className="cmh-a cmh-cp-play" viewBox="0 0 24 24" width="9" height="9" fill="currentColor">
                      <path d="M8 5.5v13l10.5-6.5z" />
                    </svg>
                    <span className="cmh-a cmh-cp-tick">
                      <Check size={10} />
                    </span>
                  </>
                ) : (
                  i + 1
                )}
              </span>
              <span className="cmh-cp-t">{l.t}</span>
              <span className="cmh-cp-d">{l.d}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/* 3. A tip card: an amount chosen, sent, and the tip landing. */
function TipScene() {
  return (
    <div className="cmh-tip">
      <div className="cmh-tip-card">
        <div className="cmh-tip-who">
          <img src={HOW_SHOP.avatar} alt="" loading="lazy" decoding="async" width={160} height={160} />
          <span>
            <b>Support {HOW_SHOP.first}</b>
            <small>Thanks for the free build videos</small>
          </span>
        </div>
        <div className="cmh-amts">
          <span className="cmh-a cmh-amt-hl" />
          <span>$3</span>
          <span>$5</span>
          <span>$10</span>
          <span>Other</span>
        </div>
        <div className="cmh-a cmh-tip-btn">
          <span className="cmh-stack">
            <span className="cmh-a cmh-tb-3">Send $3 tip</span>
            <span className="cmh-a cmh-tb-5">Send $5 tip</span>
            <span className="cmh-a cmh-tb-ok">
              <Check /> Thank you!
            </span>
          </span>
        </div>
      </div>
      <span className="cmh-a cmh-tip-pop">
        <b>+$5.00</b> tip from Priya
      </span>
    </div>
  )
}

/*
  4. Landing round 8 (the owner: the www, shop and club banner was "too
  complex"): one browser window. His domain types into the address bar, the
  lock comes in as the page loads, and his website is there under it.
*/
function DomainScene() {
  return (
    <div className="cmh-dm">
      <div className="cmh-br">
        <div className="cmh-br-top">
          <span className="cmh-br-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="cmh-br-bar">
            <span className="cmh-br-lock">
              <span className="cmh-a cmh-br-lk">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
                  <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
                </svg>
              </span>
            </span>
            <span className="cmh-br-url">
              <i className="cmh-a cmh-caret cmh-caret0" />
              {[...HOW_DOMAIN.host].map((c, i) => (
                <span key={i} className="cmh-a cmh-ch" data-k={i}>
                  {c}
                  <i className="cmh-a cmh-caret" />
                </span>
              ))}
            </span>
          </span>
          <span className="cmh-br-load">
            <span className="cmh-a cmh-br-loadfill" />
          </span>
        </div>
        <div className="cmh-br-page">
          <div className="cmh-dm-nav">
            <img src={HOW_SHOP.avatar} alt="" loading="lazy" decoding="async" width={160} height={160} />
            <b>{HOW_SHOP.name}</b>
            <span>Shop</span>
            <span>Course</span>
            <span>About</span>
          </div>
          <div className="cmh-dm-hero">
            <img src={`${HOW}/site-workshop.webp`} alt="" loading="lazy" decoding="async" width={720} height={405} />
            <span>
              <b>Built by hand, filmed every week</b>
              <i>Shop</i>
            </span>
          </div>
          <div className="cmh-dm-shelf">
            <span>
              <img src={`${HOW}/tee-white.webp`} alt="" loading="lazy" decoding="async" width={560} height={560} />
              <b>{HOW_PRODUCTS[0].name}</b>
              <small>{commerceUsd(HOW_PRODUCTS[0].priceCents)}</small>
            </span>
            <span>
              <LutCover className="cmh-dm-lut" />
              <b>{HOW_PRODUCTS[1].name}</b>
              <small>{commerceUsd(HOW_PRODUCTS[1].priceCents)}</small>
            </span>
            <span>
              <img src={`${HOW}/lesson-plane.webp`} alt="" loading="lazy" decoding="async" width={560} height={350} />
              <b>Hand Tool Basics</b>
              <small>Course</small>
            </span>
          </div>
          <span className="cmh-a cmh-br-veil" />
        </div>
      </div>
    </div>
  )
}

const EASE = "cubic-bezier(.22,1,.36,1)"
const HOW_CSS = `
/* Its own box, like section 3: no data-story-section, whose global rule would hold the content to 1400px and the older gutter. The same --home-pad top and bottom. */
.cmh{background:#fff;color:#18181b;padding-block:var(--home-pad,clamp(48px,5.6vw,80px))}
/* The page's shared box (globals.css .home-wrap), restated with the same values so the section holds its edges on its own. */
.cmh-in{box-sizing:border-box;width:100%;max-width:var(--home-max,2020px);margin-inline:auto;padding-inline:var(--home-edge,clamp(20px,5.15vw,84px))}
/* Section 3's heading: two tones, the lead dark and the rest grey; it starts --home-head-inset in from the cards' edge. */
.cmh-h{margin:0 0 clamp(32px,4.4vw,60px);padding-left:var(--home-head-inset,14px);font-size:clamp(34px,4.6vw,64px);font-weight:500;line-height:1.05;letter-spacing:-.045em;color:#18181b;text-wrap:balance}
.cmh-h-mute{display:block;color:#8e8c96}
@media(max-width:767px){.cmh-h{padding-left:var(--home-head-inset,0px)}}
/* Section 3's grid: one column on a phone; from 768px, 24 columns, the wide card 13 and the narrow 11. */
.cmh-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:44px}
@media(min-width:768px){
  .cmh-grid{grid-template-columns:repeat(24,minmax(0,1fr));column-gap:clamp(16px,2vw,28px);row-gap:clamp(48px,5vw,72px)}
  .cmh-wide{grid-column:span 13}
  .cmh-narrow{grid-column:span 11}
}
.cmh-card{min-width:0;opacity:0;transform:translate(0,24px);transition:opacity .7s ${EASE},transform .7s ${EASE};transition-delay:var(--d,0ms)}
.cmh-card[data-in]{opacity:1;transform:none}
@media(min-width:768px){.cmh-card:nth-child(even){--d:110ms}}
.cmh-stage{position:relative;pointer-events:none;user-select:none;-webkit-user-select:none;height:clamp(360px,96vw,400px);border-radius:17px;background:#f3f3f4;overflow:hidden;contain:paint;isolation:isolate;font-family:inherit}
@media(min-width:768px){.cmh-stage{height:clamp(360px,32vw,440px);border-radius:19px}}
/* The grounds (landing round 8): four light tints of one family at one lightness, each a touch deeper at its foot. Still, no glow, no glass. */
.cmh-stage[data-ground=sand]{background:linear-gradient(180deg,#f4efe7,#ebe3d7)}
.cmh-stage[data-ground=sage]{background:linear-gradient(180deg,#eef1ea,#e1e7dc)}
.cmh-stage[data-ground=clay]{background:linear-gradient(180deg,#f6ede8,#eedfd7)}
.cmh-stage[data-ground=mist]{background:linear-gradient(180deg,#edf0f4,#dfe4eb)}
.cmh-cap{margin:24px 0 0;max-width:46ch;font-size:15.5px;line-height:1.5;color:#7c7a84;text-wrap:pretty}
.cmh-cap-lead{font-weight:500;color:#18181b}
@media(min-width:768px){.cmh-cap{font-size:16px}}

/* Every loop is one of these, so going live restyles only the moving parts (a class, never * or a tag, in the rule keyed on data-commerce-live). */
.cmh-a{animation-duration:8s;animation-timing-function:${EASE};animation-iteration-count:infinite;animation-fill-mode:both;animation-play-state:paused!important}
[data-commerce-live] .cmh-a{animation-play-state:running!important}
/* Stacked layers share one grid cell: the box is the size of the largest, before and after they swap. */
.cmh-stack{display:grid}
.cmh-stack>.cmh-a{grid-area:1/1}

/* ── the LUT pack's cover: section 3's (everything-in-one-place .ev-lut), sized in its own width ── */
.cmh-lut{position:relative;display:block;aspect-ratio:1;overflow:hidden;background:#0a0a0b;color:#fff;container-type:inline-size}
.cmh-lut img{position:absolute;left:0;top:0;display:block;width:100%;height:64%;object-fit:cover;object-position:50% 60%}
.cmh-lut::before{content:"";z-index:1;position:absolute;left:0;right:0;top:0;height:30%;background:linear-gradient(rgba(10,10,11,.5),rgba(10,10,11,0))}
.cmh-lut::after{content:"";position:absolute;left:0;right:0;top:26%;height:39%;background:linear-gradient(rgba(10,10,11,0),rgba(10,10,11,.55) 50%,#0a0a0b)}
.cmh-lut-tag{z-index:1;position:absolute;left:7cqw;top:7cqw;font-size:max(4.6cqw,6px);font-weight:600;line-height:1;letter-spacing:.18em;text-transform:uppercase}
.cmh-lut-name{z-index:1;position:absolute;left:6.4cqw;bottom:6.4cqw;display:flex;flex-direction:column;font-size:21cqw;font-weight:800;line-height:.84;letter-spacing:-.05em;text-transform:uppercase}

/* ── products: one card at a time ── */
.cmh-pr{position:absolute;inset:0;display:grid;place-items:center;padding:18px;box-sizing:border-box}
.cmh-pr .cmh-a{animation-duration:10s}
.cmh-pr-in{width:min(100%,440px)}
.cmh-pc{display:flex;gap:14px;align-items:center;padding:10px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.05),0 24px 48px -28px rgba(24,24,27,.35);box-sizing:border-box;animation-name:cmh-card0}
.cmh-pc[data-k="1"]{opacity:0;animation-name:cmh-card1}
@keyframes cmh-card0{0%,44%{opacity:1;transform:translate3d(0,0,0) scale(1)}49%,95%{opacity:0;transform:translate3d(0,-10px,0) scale(.98)}100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}
@keyframes cmh-card1{0%,46%{opacity:0;transform:translate3d(0,10px,0) scale(.98)}51%,94%{opacity:1;transform:translate3d(0,0,0) scale(1)}99%,100%{opacity:0;transform:translate3d(0,-10px,0) scale(.98)}}
.cmh-pc-pic{flex:none;display:grid;place-items:center;width:44%;aspect-ratio:1;border-radius:12px;overflow:hidden;background:#ececef}
.cmh-pc-pic[data-kind=tee] img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 40%}
.cmh-pc-pic>.cmh-lut{width:100%}
.cmh-pc-b{flex:1;min-width:0;display:flex;flex-direction:column}
.cmh-pc-kind{font-size:11px;color:#8b8b94}
.cmh-pc-name{margin-top:1px;font-size:15px;font-weight:600;letter-spacing:-.015em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-pc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 8px;margin:12px 0 0}
.cmh-pc-grid dt{font-size:10.5px;color:#8b8b94}
.cmh-pc-grid dd{margin:2px 0 0;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.cmh-pc-keep{color:#15803d}
.cmh-pc-step{display:inline-flex;align-items:center;gap:5px;font-weight:500;opacity:0}
.cmh-pc-step i{width:6px;height:6px;flex:none;border-radius:50%;background:#a1a1aa}
.cmh-pc-step i[data-k="1"]{background:#d97706}
.cmh-pc-step i[data-k="2"]{background:#16a34a}
.cmh-pc-step[data-k="2"]{opacity:1}
.cmh-pc-step[data-p="0"][data-k="0"]{animation-name:cmh-s00}
.cmh-pc-step[data-p="0"][data-k="1"]{animation-name:cmh-s01}
.cmh-pc-step[data-p="0"][data-k="2"]{animation-name:cmh-s02}
.cmh-pc-step[data-p="1"][data-k="0"]{animation-name:cmh-s10}
.cmh-pc-step[data-p="1"][data-k="1"]{animation-name:cmh-s11}
.cmh-pc-step[data-p="1"][data-k="2"]{animation-name:cmh-s12}
@keyframes cmh-s00{0%,13%{opacity:1;transform:none}16%,100%{opacity:0;transform:translate3d(0,-4px,0)}}
@keyframes cmh-s01{0%,13%{opacity:0;transform:translate3d(0,4px,0)}16%,28%{opacity:1;transform:none}31%,100%{opacity:0;transform:translate3d(0,-4px,0)}}
@keyframes cmh-s02{0%,28%{opacity:0;transform:translate3d(0,4px,0)}31%,100%{opacity:1;transform:none}}
@keyframes cmh-s10{0%,59%{opacity:1;transform:none}62%,100%{opacity:0;transform:translate3d(0,-4px,0)}}
@keyframes cmh-s11{0%,59%{opacity:0;transform:translate3d(0,4px,0)}62%,76%{opacity:1;transform:none}79%,100%{opacity:0;transform:translate3d(0,-4px,0)}}
@keyframes cmh-s12{0%,76%{opacity:0;transform:translate3d(0,4px,0)}79%,100%{opacity:1;transform:none}}

/* ── course player ── */
.cmh-cp{position:absolute;inset:0;display:grid;place-items:center;padding:18px;box-sizing:border-box}
.cmh-cp .cmh-a{animation-duration:10s;animation-timing-function:linear}
.cmh-cp-card{width:min(300px,100%);padding:8px 8px 6px;border-radius:17px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.06),0 24px 48px -28px rgba(24,24,27,.35);box-sizing:border-box}
.cmh-cp-vid{position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#18181b}
.cmh-cp-vid img{display:block;width:100%;height:100%;object-fit:cover}
.cmh-cp-bar{position:absolute;left:8px;right:8px;bottom:8px;display:flex;align-items:center;gap:8px;height:24px;padding:0 9px;border-radius:8px;background:rgba(10,10,12,.55);color:#fff;font-size:10.5px;font-variant-numeric:tabular-nums}
.cmh-cp-line{position:relative;flex:1;height:3px;border-radius:3px;background:rgba(255,255,255,.3);overflow:hidden}
.cmh-cp-fill{position:absolute;inset:0;background:#fff;transform-origin:0 50%;transform:scaleX(.35);animation-name:cmh-cpf}
@keyframes cmh-cpf{0%{transform:scaleX(.35)}62%,100%{transform:scaleX(1)}}
.cmh-cp-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:11px 8px 0}
.cmh-cp-head b{font-size:13.5px;font-weight:600;letter-spacing:-.01em}
.cmh-cp-count{font-size:11.5px;color:#6b7280;font-variant-numeric:tabular-nums;justify-items:end}
.cmh-cp-c1{animation-name:cmh-c1;animation-timing-function:ease!important}
.cmh-cp-c2{opacity:0;animation-name:cmh-c2;animation-timing-function:ease!important}
@keyframes cmh-c1{0%,63%{opacity:1}66%,97%{opacity:0}100%{opacity:1}}
@keyframes cmh-c2{0%,63%{opacity:0}66%,97%{opacity:1}100%{opacity:0}}
.cmh-cp-prog{position:relative;display:block;height:4px;margin:8px 8px 4px;border-radius:4px;background:#f0f0f2;overflow:hidden}
.cmh-cp-pfill{position:absolute;inset:0;background:#18181b;transform-origin:0 50%;transform:scaleX(.286);animation-name:cmh-cpp;animation-timing-function:${EASE}!important}
@keyframes cmh-cpp{0%,63%{transform:scaleX(.286)}70%,96%{transform:scaleX(.429)}100%{transform:scaleX(.286)}}
.cmh-cp-list{margin:0;padding:0;list-style:none}
.cmh-cp-row{display:flex;align-items:center;gap:9px;height:31px;padding:0 8px;border-radius:9px;font-size:12px;color:#3f3f46}
.cmh-cp-row[data-now]{background:#f4f4f5;color:#18181b;font-weight:500}
.cmh-cp-mark{position:relative;display:grid;place-items:center;width:18px;height:18px;flex:none;border-radius:50%;font-size:10px;font-weight:600;color:#6b7280;box-shadow:inset 0 0 0 1.5px #d4d4d8}
.cmh-cp-mark[data-state=done]{background:#18181b;color:#fff;box-shadow:none}
.cmh-cp-mark[data-state=now]{color:#18181b;box-shadow:inset 0 0 0 1.5px #18181b}
.cmh-cp-play{grid-area:1/1;animation-name:cmh-c1;animation-timing-function:ease!important}
.cmh-cp-tick{grid-area:1/1;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#18181b;color:#fff;opacity:0;animation-name:cmh-tick;animation-timing-function:ease!important}
@keyframes cmh-tick{0%,62%{opacity:0;transform:scale(.6)}66%,97%{opacity:1;transform:none}100%{opacity:0}}
.cmh-cp-t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-cp-d{font-size:11px;color:#9ca3af;font-variant-numeric:tabular-nums}

/* ── tips ── */
.cmh-tip{position:absolute;inset:0;display:grid;place-items:center;padding:18px;box-sizing:border-box}
.cmh-tip .cmh-a{animation-duration:7s}
.cmh-tip-card{width:min(270px,100%);padding:14px;border-radius:19px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.06),0 24px 48px -28px rgba(24,24,27,.35);box-sizing:border-box}
.cmh-tip-who{display:flex;gap:10px;align-items:center}
.cmh-tip-who img{width:40px;height:40px;border-radius:50%;object-fit:cover}
.cmh-tip-who b{display:block;font-size:14px;font-weight:600}
.cmh-tip-who small{font-size:11.5px;color:#71717a}
.cmh-amts{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}
.cmh-amts>span:not(.cmh-amt-hl){position:relative;height:36px;display:grid;place-items:center;border-radius:10px;box-shadow:inset 0 0 0 1px #e4e4e7;font-size:13px;font-weight:600}
.cmh-amt-hl{position:absolute;left:0;top:0;width:calc((100% - 18px) / 4);height:36px;border-radius:10px;box-shadow:inset 0 0 0 2px #18181b;background:#faf9fb;transform:translate3d(calc(100% + 6px),0,0);animation-name:cmh-hl;animation-timing-function:cubic-bezier(.32,.72,0,1)}
@keyframes cmh-hl{0%,10%{transform:none}16%,88%{transform:translate3d(calc(100% + 6px),0,0)}94%,100%{transform:none}}
.cmh-tip-btn{margin-top:8px;height:40px;display:grid;place-items:center;border-radius:11px;background:#18181b;color:#fff;font-size:13px;font-weight:600;animation-name:cmh-tpress}
@keyframes cmh-tpress{0%,30%{transform:none}32.5%{transform:scale(.96)}36%,100%{transform:none}}
.cmh-tip-btn .cmh-stack{place-items:center}
.cmh-tb-3{opacity:0;animation-name:cmh-t3}
.cmh-tb-5{opacity:0;animation-name:cmh-t5}
.cmh-tb-ok{display:inline-flex;align-items:center;gap:6px;animation-name:cmh-tok}
@keyframes cmh-t3{0%,12%{opacity:1}15%,89%{opacity:0}92%,100%{opacity:1}}
@keyframes cmh-t5{0%,12%{opacity:0}15%,33%{opacity:1}36%,74%{opacity:0}77%,89%{opacity:1}92%,100%{opacity:0}}
@keyframes cmh-tok{0%,33%{opacity:0;transform:scale(.94)}37%,72%{opacity:1;transform:none}75%,100%{opacity:0}}
.cmh-tip-pop{position:absolute;left:50%;top:calc(50% - 128px);display:inline-flex;gap:5px;align-items:baseline;padding:7px 12px;border-radius:99px;background:#fff;color:#3f3f46;font-size:12px;white-space:nowrap;box-shadow:0 0 0 1px rgba(24,24,27,.05),0 10px 24px -12px rgba(24,24,27,.3);transform:translate3d(-50%,0,0);animation-name:cmh-tpop}
.cmh-tip-pop b{color:#15803d;font-weight:700;font-size:13px}
@keyframes cmh-tpop{0%,36%{opacity:0;transform:translate3d(-50%,14px,0) scale(.94)}42%,70%{opacity:1;transform:translate3d(-50%,0,0)}78%,100%{opacity:0;transform:translate3d(-50%,-10px,0)}}

/* ── your own domain: one browser window, the address typing in (landing round 8) ── */
.cmh-dm{position:absolute;inset:0;display:grid;place-items:center;padding:24px 20px;box-sizing:border-box}
.cmh-dm .cmh-a{animation-duration:9s;animation-timing-function:linear}
.cmh-br{display:flex;flex-direction:column;width:min(100%,500px);height:100%;max-height:390px;border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 0 0 1px rgba(24,24,27,.06),0 28px 56px -30px rgba(24,24,27,.42)}
.cmh-br-top{position:relative;flex:none;display:flex;align-items:center;gap:12px;height:50px;padding:0 12px;background:#f7f7f8;border-bottom:1px solid #ececef}
.cmh-br-dots{flex:none;display:flex;gap:6px}
.cmh-br-dots i{width:9px;height:9px;border-radius:50%;background:#dcdce0}
.cmh-br-bar{flex:1;min-width:0;display:flex;align-items:center;gap:7px;height:32px;padding:0 12px;border-radius:9px;background:#fff;box-shadow:inset 0 0 0 1px #e4e4e7;font-size:15px;font-weight:500;letter-spacing:-.01em;color:#18181b;white-space:nowrap}
@media(min-width:768px){.cmh-br-bar{font-size:16px}}
.cmh-br-lock{flex:none;display:grid;place-items:center;width:14px;height:14px;color:#3f3f46}
.cmh-br-lk{display:grid;place-items:center;animation-name:cmh-lk;animation-timing-function:cubic-bezier(.3,1.4,.5,1)!important}
@keyframes cmh-lk{0%,${TYPE.enter}%{opacity:0;transform:scale(.4)}${TYPE.enter + 3}%,${TYPE.out}%{opacity:1;transform:none}${TYPE.out + 2}%,100%{opacity:0;transform:scale(.4)}}
.cmh-br-url{position:relative;min-width:0;overflow:hidden}
.cmh-ch{position:relative}
.cmh-caret{position:absolute;top:50%;right:-1px;width:1.5px;height:1.15em;margin-top:-.575em;background:#18181b;opacity:0}
.cmh-caret0{left:0;right:auto;animation-name:cmh-ck}
@keyframes cmh-ck{0%,${TYPE.start}%{opacity:1}${TYPE.start + 0.05}%,100%{opacity:0}}
${TYPED_CSS}
.cmh-br-load{position:absolute;left:0;right:0;bottom:-1px;height:2px;overflow:hidden}
.cmh-br-loadfill{position:absolute;inset:0;background:#18181b;transform-origin:0 50%;transform:scaleX(0);opacity:0;animation-name:cmh-load;animation-timing-function:ease-out!important}
@keyframes cmh-load{0%,${TYPE.enter}%{opacity:1;transform:scaleX(0)}${TYPE.enter + 5}%{opacity:1;transform:scaleX(1)}${TYPE.enter + 7}%,100%{opacity:0;transform:scaleX(1)}}
.cmh-br-page{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;color:#18181b;container-type:inline-size}
.cmh-br-veil{z-index:2;position:absolute;inset:0;background:#fff;opacity:0;animation-name:cmh-veil;animation-timing-function:ease!important}
@keyframes cmh-veil{0%,${TYPE.enter + 2}%{opacity:.9}${TYPE.enter + 7}%,${TYPE.out}%{opacity:0}${TYPE.out + 3}%,100%{opacity:.9}}
.cmh-dm-nav{flex:none;display:flex;align-items:center;gap:12px;height:36px;padding:0 14px;font-size:10px;color:#71717a}
.cmh-dm-nav img{width:18px;height:18px;border-radius:50%;object-fit:cover;margin-right:-4px}
.cmh-dm-nav b{margin-right:auto;font-size:11.5px;font-weight:600;color:#18181b}
.cmh-dm-hero{flex:1;min-height:70px;display:grid;grid-template-columns:1.2fr 1fr;background:#f1ede6}
.cmh-dm-hero img{display:block;width:100%;height:100%;min-height:0;object-fit:cover}
.cmh-dm-hero span{display:grid;align-content:center;justify-items:start;gap:9px;padding:0 14px}
.cmh-dm-hero b{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:clamp(13px,3.6cqw,19px);font-weight:400;line-height:1.15;letter-spacing:-.01em;text-wrap:balance}
.cmh-dm-hero i{padding:4px 11px;border-radius:99px;background:#18181b;color:#fff;font-size:9px;font-style:normal;font-weight:600}
.cmh-dm-shelf{flex:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:12px 14px 14px}
.cmh-dm-shelf>span{display:grid;gap:1px;min-width:0}
.cmh-dm-shelf>span>img,.cmh-dm-lut{display:block;width:100%;aspect-ratio:1;margin-bottom:5px;border-radius:6px;object-fit:cover}
.cmh-dm-shelf b{font-size:9.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-dm-shelf small{font-size:9px;color:#8b8b94}

@media (prefers-reduced-motion:reduce){
  .cmh-a{animation:none!important}
  .cmh-card{opacity:1;transform:none;transition:none!important}
  .cmh-tip-pop{display:none}
  .cmh-pc[data-k="1"]{display:none}
  .cmh-pc-step:not([data-k="2"]){opacity:0}
  .cmh-br-veil,.cmh-br-loadfill,.cmh-caret{opacity:0}
}
@media(scripting:none){.cmh-card{opacity:1;transform:none}}
`

/** This section's stylesheet, as it draws it: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const HOW_IT_WORKS_STYLES: readonly SectionStyle[] = [{ href: "w12-commerce-how", precedence: "default", css: HOW_CSS }]
