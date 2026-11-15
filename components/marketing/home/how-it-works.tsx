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
 * his builds and sells a shop apron (physical, printed by a print partner
 * when it is ordered), plans for a weekend workbench (a PDF), a hand tool
 * course, and takes tips. Round 7 (the owner) took out Nadia Brooks, her
 * print and the checkout tile; this file draws its own data and imports
 * nothing from the checkout scene's files.
 *
 *   products   one product card at a time, the apron and then the plans:
 *              its price, what making it costs, what he keeps, its status
 *   course     the course player: a lesson playing and ticked off
 *   tips       a tip card choosing an amount, sending it, the tip landing
 *   domain     the round 3 design again (the owner): his website under a
 *              large address pill, and the three things a creator's own
 *              domain can serve, each checked in turn. Now on a smooth black
 *              to deep purple ground
 *
 * Every loop is CSS keyframes on transform and opacity only, in fixed-size
 * boxes, so nothing lays out while they play. They run only while their card
 * is on screen and the tab is visible (data-commerce-live); reduced motion
 * shows each card's finished frame, still.
 *
 * TRUE TO THE PRODUCT. Merch without stock is made on demand by a print
 * partner the seller connects (lib/physical/providers.ts); the apron's cost
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

/** The digital product: his workbench plans, one PDF. */
export const HOW_PLANS = {
  title: "Weekend Workbench",
  kind: "Plans",
  file: "Weekend-Workbench-Plans.pdf",
  priceCents: 2400,
} as const

/** Ruben's shop: a shop apron printed when ordered, and the workbench plans. */
export const HOW_PRODUCTS = [
  {
    id: "apron",
    kind: "Physical",
    name: "Linde Shop Apron",
    how: "Printed when ordered",
    steps: ["New order", "Printing", "Shipped"],
    /** An example print partner price for a printed canvas apron. */
    ...sale(3800, 1600),
  },
  {
    id: "plans",
    kind: "Digital",
    name: `${HOW_PLANS.title} ${HOW_PLANS.kind}`,
    how: "Instant download",
    steps: ["New order", "Paid", "Delivered"],
    ...sale(HOW_PLANS.priceCents, 0),
  },
] as const

/**
 * Ruben's own domain (made up), and the three things Storelib serves on a
 * creator's domain. One address each: a domain row has one purpose, so a
 * creator who wants all three connects the domain and two subdomains of it.
 */
export const HOW_DOMAIN = {
  name: "www.lindewoodshop",
  tld: ".com",
  targets: [
    { purpose: "website", sub: "www", what: "Website" },
    { purpose: "creator_page", sub: "shop", what: "Creator page, OnePage" },
    { purpose: "community", sub: "club", what: "Community" },
  ] satisfies readonly { purpose: DomainPurpose; sub: string; what: string }[],
} as const
const DOMAIN_ROOT = `${HOW_DOMAIN.name.replace(/^www\./, "")}${HOW_DOMAIN.tld}`

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
    products: { ground: "light", scene: <ProductsScene /> },
    course: { ground: "light", scene: <CourseScene /> },
    tips: { ground: "light", scene: <TipScene /> },
    domain: { ground: "night", scene: <DomainScene /> },
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

/** A soft grey, or for the domain a smooth black to deep purple. Nothing moves in the ground. */
type Ground = "light" | "night"

const Check = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

/** The plans' cover, the way a seller uploads it: a photo of the bench, the title set over its foot. */
function PlansCover({ className = "" }: { className?: string }) {
  return (
    <span className={`cmh-cover ${className}`}>
      <img src={`${HOW}/plans-bench.webp`} alt="" width={480} height={640} loading="lazy" decoding="async" />
      <span className="cmh-cover-t">
        <b>Weekend</b>
        <b>Workbench</b>
        <small>Plans, PDF</small>
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
              {p.id === "apron" ? <img src={`${HOW}/apron.webp`} alt="" width={480} height={600} loading="lazy" decoding="async" /> : <PlansCover className="cmh-pc-cover" />}
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

/* 4. The round 3 design (the owner: "how it was before"): his website under his own address, and what else the domain serves, checked one after another. */
function DomainScene() {
  return (
    <div className="cmh-dm">
      <div className="cmh-dm-top">
        <div className="cmh-dm-site">
          <div className="cmh-dm-nav">
            <img src={HOW_SHOP.avatar} alt="" loading="lazy" decoding="async" width={160} height={160} />
            <b>{HOW_SHOP.name}</b>
            <span>Shop</span>
            <span>Plans</span>
            <span>About</span>
          </div>
          <div className="cmh-dm-hero">
            <img src={`${HOW}/site-workshop.webp`} alt="" loading="lazy" decoding="async" width={720} height={405} />
            <span>
              <b>Furniture you can build this weekend</b>
              <i>Shop</i>
            </span>
          </div>
          <div className="cmh-dm-shelf">
            <span>
              <img src={`${HOW}/apron.webp`} alt="" loading="lazy" decoding="async" width={480} height={600} />
              <b>{HOW_PRODUCTS[0].name}</b>
              <small>{commerceUsd(HOW_PRODUCTS[0].priceCents)}</small>
            </span>
            <span>
              <PlansCover className="cmh-dm-cover" />
              <b>{HOW_PRODUCTS[1].name}</b>
              <small>{commerceUsd(HOW_PRODUCTS[1].priceCents)}</small>
            </span>
            <span>
              <img src={`${HOW}/lesson-plane.webp`} alt="" loading="lazy" decoding="async" width={560} height={350} />
              <b>Hand Tool Basics</b>
              <small>Course</small>
            </span>
          </div>
        </div>
        <div className="cmh-dm-pill">
          <span className="cmh-dm-addr">
            {HOW_DOMAIN.name}
            <b>{HOW_DOMAIN.tld}</b>
          </span>
          <span className="cmh-a cmh-dm-ok">
            <Check size={13} />
          </span>
        </div>
      </div>
      <div className="cmh-dm-rows">
        {HOW_DOMAIN.targets.map((t, i) => (
          <div key={t.purpose} className="cmh-dm-row">
            <span className="cmh-dm-mark">
              <span className="cmh-a cmh-dm-tick" data-k={i}>
                <Check size={9} />
              </span>
            </span>
            <span className="cmh-dm-host">
              <b>{t.sub}</b>.{DOMAIN_ROOT}
            </span>
            <span className="cmh-dm-what">{t.what}</span>
          </div>
        ))}
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
/* The domain's ground (the owner, round 7): black that turns, slowly, to a deep purple in the far corner. Two still gradients, no glow, no glass. */
.cmh-stage[data-ground=night]{background:radial-gradient(90% 80% at 100% 100%,#3a1c6b 0%,rgba(58,28,107,.55) 38%,rgba(20,12,36,0) 78%),linear-gradient(160deg,#050507 0%,#0c0a12 46%,#1d1233 100%)}
.cmh-cap{margin:24px 0 0;max-width:46ch;font-size:15.5px;line-height:1.5;color:#7c7a84;text-wrap:pretty}
.cmh-cap-lead{font-weight:500;color:#18181b}
@media(min-width:768px){.cmh-cap{font-size:16px}}

/* Every loop is one of these, so going live restyles only the moving parts (a class, never * or a tag, in the rule keyed on data-commerce-live). */
.cmh-a{animation-duration:8s;animation-timing-function:${EASE};animation-iteration-count:infinite;animation-fill-mode:both;animation-play-state:paused!important}
[data-commerce-live] .cmh-a{animation-play-state:running!important}
/* Stacked layers share one grid cell: the box is the size of the largest, before and after they swap. */
.cmh-stack{display:grid}
.cmh-stack>.cmh-a{grid-area:1/1}

/* ── the plans' cover ── */
.cmh-cover{position:relative;display:block;aspect-ratio:3/4;overflow:hidden;background:#2a2118;container-type:inline-size}
.cmh-cover img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover}
.cmh-cover-t{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;padding:30cqw 9cqw 9cqw;background:linear-gradient(180deg,rgba(14,10,6,0),rgba(14,10,6,.86) 55%);color:#fff}
.cmh-cover-t b{font-size:15cqw;font-weight:800;line-height:.98;letter-spacing:-.04em}
.cmh-cover-t small{margin-top:5cqw;font-size:8cqw;font-weight:500;color:rgba(255,255,255,.72)}

/* ── products: one card at a time ── */
.cmh-pr{position:absolute;inset:0;display:grid;place-items:center;padding:18px;box-sizing:border-box}
.cmh-pr .cmh-a{animation-duration:10s}
.cmh-pr-in{width:min(100%,440px)}
.cmh-pc{display:flex;gap:14px;align-items:center;padding:10px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.05),0 24px 48px -28px rgba(24,24,27,.35);box-sizing:border-box;animation-name:cmh-card0}
.cmh-pc[data-k="1"]{opacity:0;animation-name:cmh-card1}
@keyframes cmh-card0{0%,44%{opacity:1;transform:translate3d(0,0,0) scale(1)}49%,95%{opacity:0;transform:translate3d(0,-10px,0) scale(.98)}100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}
@keyframes cmh-card1{0%,46%{opacity:0;transform:translate3d(0,10px,0) scale(.98)}51%,94%{opacity:1;transform:translate3d(0,0,0) scale(1)}99%,100%{opacity:0;transform:translate3d(0,-10px,0) scale(.98)}}
.cmh-pc-pic{flex:none;display:grid;place-items:center;width:44%;aspect-ratio:1;border-radius:12px;overflow:hidden;background:#ececef}
.cmh-pc-pic[data-kind=apron] img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 30%}
.cmh-pc-cover{width:62%;border-radius:3px;box-shadow:0 1px 2px rgba(24,24,27,.12),0 14px 26px -14px rgba(24,24,27,.55)}
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

/* ── your own domain: the round 3 design, on the night ground ── */
.cmh-dm{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 20px 20px;box-sizing:border-box;container-type:inline-size}
.cmh-dm .cmh-a{animation-duration:9s;animation-timing-function:cubic-bezier(.3,1.4,.5,1)}
.cmh-dm-top{position:relative;flex:1;min-height:0;width:100%;display:flex;justify-content:center}
.cmh-dm-site{width:min(100%,300px);height:100%;border-radius:10px;background:#fff;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 24px 48px -24px rgba(0,0,0,.8);color:#18181b}
.cmh-dm-nav{display:flex;align-items:center;gap:9px;height:30px;padding:0 12px;font-size:8.5px;color:#71717a}
.cmh-dm-nav img{width:15px;height:15px;border-radius:50%;object-fit:cover;margin-right:-3px}
.cmh-dm-nav b{margin-right:auto;font-size:9.5px;font-weight:600;color:#18181b}
.cmh-dm-hero{position:relative;display:grid;grid-template-columns:1.25fr 1fr;height:88px;background:#f1ede6}
.cmh-dm-hero img{display:block;width:100%;height:88px;object-fit:cover}
.cmh-dm-hero span{display:grid;align-content:center;justify-items:start;gap:7px;padding:0 12px}
.cmh-dm-hero b{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:13px;font-weight:400;line-height:1.15;letter-spacing:-.01em}
.cmh-dm-hero i{padding:3px 9px;border-radius:99px;background:#18181b;color:#fff;font-size:7.5px;font-style:normal;font-weight:600}
.cmh-dm-shelf{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px 12px 0}
.cmh-dm-shelf>span{display:grid;gap:1px;min-width:0}
.cmh-dm-shelf img,.cmh-dm-cover{display:block;width:100%;aspect-ratio:1;margin-bottom:4px;border-radius:5px;object-fit:cover}
.cmh-dm-cover img{margin:0;border-radius:0}
.cmh-dm-shelf b{font-size:8px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-dm-shelf small{font-size:7.5px;color:#8b8b94}
.cmh-dm-pill{position:absolute;left:50%;top:50%;display:flex;align-items:center;gap:.5em;height:2.55em;padding:0 .8em 0 1.05em;border-radius:99px;background:#fff;color:#3f3f46;font-size:min(20px,5.9cqw);font-weight:500;letter-spacing:-.025em;white-space:nowrap;box-shadow:0 0 0 1px rgba(24,24,27,.04),0 2px 4px rgba(0,0,0,.12),0 18px 38px -12px rgba(0,0,0,.6);transform:translate(-50%,-50%)}
.cmh-dm-addr b{font-weight:500;color:#7c3aed}
.cmh-dm-ok{display:grid;place-items:center;width:1.1em;height:1.1em;flex:none;border-radius:50%;color:#16a34a;box-shadow:inset 0 0 0 2px #16a34a;animation-name:cmh-dok}
@keyframes cmh-dok{0%,7%{opacity:0;transform:scale(.5)}12%,93%{opacity:1;transform:none}98%,100%{opacity:0;transform:scale(.5)}}
.cmh-dm-rows{flex:none;width:min(100%,360px);padding:3px 10px;border-radius:14px;background:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 18px 40px -22px rgba(0,0,0,.7);box-sizing:border-box}
.cmh-dm-row{display:flex;align-items:center;gap:7px;height:31px;font-size:11px;letter-spacing:-.01em}
.cmh-dm-row+.cmh-dm-row{border-top:1px solid #f0f0f2}
.cmh-dm-mark{position:relative;display:grid;place-items:center;width:15px;height:15px;flex:none;border-radius:50%;box-shadow:inset 0 0 0 1.5px #d4d4d8}
.cmh-dm-tick{display:grid;place-items:center;width:15px;height:15px;border-radius:50%;background:#16a34a;color:#fff;animation-name:cmh-dt0}
.cmh-dm-tick[data-k="1"]{animation-name:cmh-dt1}
.cmh-dm-tick[data-k="2"]{animation-name:cmh-dt2}
@keyframes cmh-dt0{0%,20%{opacity:0;transform:scale(.5)}25%,93%{opacity:1;transform:none}98%,100%{opacity:0;transform:scale(.5)}}
@keyframes cmh-dt1{0%,32%{opacity:0;transform:scale(.5)}37%,93%{opacity:1;transform:none}98%,100%{opacity:0;transform:scale(.5)}}
@keyframes cmh-dt2{0%,44%{opacity:0;transform:scale(.5)}49%,93%{opacity:1;transform:none}98%,100%{opacity:0;transform:scale(.5)}}
.cmh-dm-host{flex:0 1 auto;min-width:0;color:#8b8b94;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-dm-host b{font-weight:600;color:#18181b}
.cmh-dm-what{flex:none;margin-left:auto;font-size:10.5px;color:#52525b;white-space:nowrap}

@media (prefers-reduced-motion:reduce){
  .cmh-a{animation:none!important}
  .cmh-card{opacity:1;transform:none;transition:none!important}
  .cmh-tip-pop{display:none}
  .cmh-pc[data-k="1"]{display:none}
  .cmh-pc-step:not([data-k="2"]){opacity:0}
}
@media(scripting:none){.cmh-card{opacity:1;transform:none}}
`

/** This section's stylesheet, as it draws it: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const HOW_IT_WORKS_STYLES: readonly SectionStyle[] = [{ href: "w12-commerce-how", precedence: "default", css: HOW_CSS }]
