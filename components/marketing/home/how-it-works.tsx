"use client"

/**
 * ===========================================================================
 *  HOW IT WORKS: SIX TILES (home, section 8, landing round 4)
 * ===========================================================================
 * Each tile is a picture on a colourful ground that slowly changes (two soft
 * gradient layers drifting and taking turns, the way "Make the work"'s
 * product card sits on colour), and in it the product as it really looks.
 * One shop throughout: Nadia Brooks, a street photographer, who sells an
 * embroidered cap (physical) and a night photography e-book, a course and a
 * membership (digital).
 *
 *   products   one product card at a time, a cap and then the e-book: its
 *              price, what making it costs, what she keeps, its order status
 *   checkout   her real OnePage on a phone (the live PublicOnePage in the
 *              Darkroom theme, captured), a tap on Buy now, and the real
 *              product sheet (components/onepage/product-sheet, captured
 *              open) sliding up over it, then away
 *   files      the buyer's "Thanks for your purchase" email with the PDF
 *   course     the course player: a lesson playing and ticked off
 *   tips       a tip card choosing an amount, sending it, the tip landing
 *   domain     her own address in a pill, and the three things a creator's
 *              domain can serve, each connected in turn, then the DNS check
 *              and HTTPS
 *
 * Every loop is CSS keyframes on transform and opacity only, in fixed-size
 * boxes, so nothing lays out while they play. They run only while their tile
 * is on screen and the tab is visible (data-commerce-live); reduced motion
 * shows each tile's finished frame, still.
 *
 * TRUE TO THE PRODUCT. Merch without stock is made on demand by a print
 * partner the seller connects (lib/physical/providers.ts); the cap's cost is
 * an example partner price (commerce-kit). What the seller keeps is after
 * Storelib's real fee (lib/payments/fees/calculate). The sheet's button is
 * the product sheet's own for a product that ships ("Check out · $28.00",
 * lib/onepage/product-block sheetButtonLabel). The email's words are the
 * purchase receipt's (lib/notify/templates/catalog.ts
 * PURCHASE_CONFIRMATION), the player's are the course player's
 * (components/courses/course-player.tsx). A domain a creator owns serves one
 * of three things: their website, their creator page (with the OnePage at
 * /links) or one community (lib/custom-domains/hostname DOMAIN_PURPOSES);
 * connecting one is on Pro (lib/sites/plan customDomain); Storelib reads the
 * DNS and waits for the certificate itself (app/api/domains/verify).
 * tests/home-landing-commerce4.test.ts holds the tiles to those files.
 *
 * NOTHING IN A TILE IS A CONTROL: the stages take no pointer and have no
 * hover states, so a drawn button never looks like one that works.
 */
import { useEffect, useRef, type ReactNode } from "react"
import type { SectionStyle } from "./lazy-section"
import type { DomainPurpose } from "@/lib/custom-domains/hostname"
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"
import { StoryHeading } from "../story-heading"
import { commerceProduct, commerceUsd } from "./commerce-kit"
import { EBOOK, EBOOK_COVER_CSS, EbookCover, EbookCoverStyle } from "./ebook-cover"

const IMG = "/home/commerce"
const HOW = "/home/how"

export const HOW_HEADING = "Sell what people love. We handle the rest."

/** One sale: Storelib's Free-plan fee, worked out by checkout's own function, and the print partner's cost for a piece made to order. */
function sale(priceCents: number, baseCents: number) {
  const fee = calculateStorelibFee({ grossMinor: priceCents, currency: "USD", sellerPlan: "free" }).totalStorelibFeeMinor
  return { priceCents, baseCents, keepCents: priceCents - fee - baseCents }
}

/** Nadia Brooks's shop: an embroidered cap and an e-book. The cap's cost is an example print partner price. */
export const HOW_PRODUCTS = [
  {
    id: "cap",
    kind: "Physical",
    name: "Darkroom cap",
    how: "Embroidered when ordered",
    steps: ["New order", "Embroidering", "Shipped"],
    ...sale(2800, commerceProduct("cap").baseCents),
  },
  {
    id: "ebook",
    kind: "Digital",
    name: EBOOK.title,
    how: "Instant download",
    steps: ["New order", "Paid", "Delivered"],
    ...sale(EBOOK.priceCents, 0),
  },
] as const

/**
 * Nadia's own domain (made up), and the three things Storelib serves on a
 * creator's domain. One address each: a domain row has one purpose, so a
 * creator who wants all three connects the domain and two subdomains of it.
 */
export const HOW_DOMAIN = {
  name: "www.nadiabrooks",
  tld: ".com",
  targets: [
    { purpose: "website", sub: "www", what: "Website" },
    { purpose: "creator_page", sub: "shop", what: "Creator page, OnePage" },
    { purpose: "community", sub: "club", what: "Community" },
  ] satisfies readonly { purpose: DomainPurpose; sub: string; what: string }[],
} as const
const DOMAIN_ROOT = `${HOW_DOMAIN.name.replace(/^www\./, "")}${HOW_DOMAIN.tld}`

/**
 * Wave 13 perf: each tile runs its loops only while that tile is on screen
 * (data-commerce-live on the tile, which the CSS reads), not all six while
 * any part of the section is.
 */
function useTilesLive() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const tiles = [...root.querySelectorAll<HTMLElement>(".cmh-tile")]
    const near = new Set<Element>()
    const apply = () => {
      for (const t of tiles) t.toggleAttribute("data-commerce-live", near.has(t) && !document.hidden)
    }
    if (typeof IntersectionObserver !== "function") {
      for (const t of tiles) near.add(t)
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
    for (const t of tiles) io.observe(t)
    document.addEventListener("visibilitychange", apply)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", apply)
    }
  }, [])
  return ref
}

export function HowItWorks() {
  const ref = useTilesLive()
  return (
    <section ref={ref} className="cmh" data-story-section="how-it-works" aria-labelledby="cmh-title">
      <style href="w12-commerce-how" precedence="default">
        {HOW_CSS}
      </style>
      <EbookCoverStyle />
      <div className="cmh-wrap">
        <div className="story-section-heading">
          <StoryHeading id="cmh-title" text={HOW_HEADING} accent={["love"]} />
        </div>

        <div className="cmh-grid">
          <Tile ground="coral" caption={<><b>Sell physical and digital products.</b> Merch is made and shipped when it sells. Files go out instantly.</>}>
            <ProductsScene />
          </Tile>
          <Tile ground="sea" caption={<><b>Checkout without leaving your page.</b> Tap a product on your OnePage and it opens right there, ready to buy.</>}>
            <SheetScene />
          </Tile>
          <Tile ground="sky" caption={<><b>Files delivered for you.</b> Upload a file once. Every buyer gets it by email the moment they pay.</>}>
            <FilesScene />
          </Tile>
          <Tile ground="sun" caption={<><b>Build and sell a course.</b> Video lessons and files, with each student&apos;s progress saved as they go.</>}>
            <CourseScene />
          </Tile>
          <Tile ground="rose" caption={<><b>Take tips.</b> A thank-you button for the people who just want to support you.</>}>
            <TipScene />
          </Tile>
          <Tile ground="lime" caption={<><b>Use your own domain.</b> On Pro, point a domain you own at your website, your creator page or a community. Storelib checks the DNS and adds HTTPS.</>}>
            <DomainScene />
          </Tile>
        </div>
      </div>
    </section>
  )
}

type Ground = "coral" | "sea" | "sky" | "sun" | "rose" | "lime"

function Tile({ children, caption, ground }: { children: ReactNode; caption: ReactNode; ground: Ground }) {
  return (
    <article className="cmh-tile">
      <div className="cmh-stage" data-ground={ground} aria-hidden="true">
        <span className="cmh-a cmh-gl cmh-gl1" />
        <span className="cmh-a cmh-gl cmh-gl2" />
        {children}
      </div>
      <p className="cmh-cap">{caption}</p>
    </article>
  )
}

const Check = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

/* 1. One product card at a time, the way a seller reads a product: price, cost, what she keeps, where its order is. */
function ProductsScene() {
  return (
    <div className="cmh-pr">
      <div className="cmh-stack cmh-pr-in">
        {HOW_PRODUCTS.map((p, i) => (
          <div key={p.id} className="cmh-a cmh-pc" data-k={i}>
            <div className="cmh-pc-pic" data-kind={p.id}>
              {p.id === "cap" ? <img src={`${HOW}/cap-yellow.webp`} alt="" width={600} height={600} loading="lazy" decoding="async" /> : <EbookCover className="cmh-pc-cover" />}
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
                  <dt>{p.baseCents ? "Production cost" : "Delivery"}</dt>
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

/* 2. Nadia's OnePage on a phone (the live page, captured): a tap on Buy now, the real product sheet slides up, and away. */
function SheetScene() {
  return (
    <div className="cmh-op">
      <div className="cmh-ph">
        <div className="cmh-ph-scr">
          <img className="cmh-op-page" src={`${HOW}/op-nadia.webp`} alt="" width={480} height={1041} loading="lazy" decoding="async" />
          <span className="cmh-a cmh-tap" />
          <span className="cmh-a cmh-dim" />
          <img className="cmh-a cmh-sheet" src={`${HOW}/op-nadia-sheet.webp`} alt="" width={480} height={958} loading="lazy" decoding="async" />
          <div className="cmh-ph-sb">
            <b>9:41</b>
            <span className="cmh-ph-isl" />
            <svg viewBox="0 0 34 12" width="34" height="12" fill="currentColor">
              <rect x="0" y="7" width="3" height="5" rx="1" />
              <rect x="4.5" y="5" width="3" height="7" rx="1" />
              <rect x="9" y="2.5" width="3" height="9.5" rx="1" />
              <rect x="20" y="1.5" width="12" height="9" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="21.8" y="3.3" width="7.5" height="5.4" rx="1.4" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

/* 3. The buyer's receipt: the file is in it the moment they pay. */
function FilesScene() {
  return (
    <div className="cmh-fl">
      <div className="cmh-a cmh-ml">
        <div className="cmh-ml-from">
          <img src={`${IMG}/creator-nadia.webp`} alt="" loading="lazy" decoding="async" width={160} height={160} />
          <span>
            <b>{EBOOK.author}</b>
            <small>to Sam Rivera</small>
          </span>
          <small className="cmh-ml-now">now</small>
        </div>
        <div className="cmh-ml-subj">Your order from {EBOOK.author}</div>
        <b className="cmh-ml-h">Thanks for your purchase</b>
        <p>
          Thanks for buying {EBOOK.title} from {EBOOK.author}. Your files are ready.
        </p>
        <div className="cmh-ml-file">
          <EbookCover className="cmh-ml-cover" />
          <span>
            <b>{EBOOK.file}</b>
            <small>PDF · {EBOOK.size}</small>
          </span>
        </div>
        <span className="cmh-ml-get">
          Get your files
          <span className="cmh-a cmh-tap cmh-tap-light" />
        </span>
      </div>
    </div>
  )
}

const COURSE = [
  { t: "Aperture and depth", d: "8:40" },
  { t: "Shutter speed", d: "7:15" },
  { t: "ISO without the noise", d: "6:50" },
  { t: "Putting it together", d: "11:20" },
] as const

/* 4. The course player: a lesson plays, it is ticked off, the count moves on. */
function CourseScene() {
  return (
    <div className="cmh-cp">
      <div className="cmh-cp-card">
        <div className="cmh-cp-vid">
          <img src={`${HOW}/course-street.webp`} alt="" loading="lazy" decoding="async" width={560} height={350} />
          <span className="cmh-cp-bar">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
            </svg>
            <span className="cmh-cp-line">
              <span className="cmh-a cmh-cp-fill" />
            </span>
            <span>6:50</span>
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

/* 5. A tip card: an amount chosen, sent, and the tip landing. */
function TipScene() {
  return (
    <div className="cmh-tip">
      <div className="cmh-tip-card">
        <div className="cmh-tip-who">
          <img src={`${IMG}/creator-nadia.webp`} alt="" loading="lazy" decoding="async" width={160} height={160} />
          <span>
            <b>Support Nadia</b>
            <small>Say thanks for the free guides</small>
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
        <b>+$5.00</b> tip from Sam
      </span>
    </div>
  )
}

/* 6. Her own address, and what the domain serves, each connected in turn, then the DNS check and HTTPS. */
function DomainScene() {
  return (
    <div className="cmh-dm">
      <div className="cmh-dm-pill">
        <svg className="cmh-dm-lock" viewBox="0 0 12 14" width="13" height="15" fill="currentColor">
          <path d="M3 6V4.2a3 3 0 0 1 6 0V6h.6c.8 0 1.4.6 1.4 1.4v4.8c0 .8-.6 1.4-1.4 1.4H2.4c-.8 0-1.4-.6-1.4-1.4V7.4C1 6.6 1.6 6 2.4 6H3Zm1.5 0h3V4.2a1.5 1.5 0 0 0-3 0V6Z" />
        </svg>
        <span className="cmh-dm-addr">
          {HOW_DOMAIN.name}
          <b>{HOW_DOMAIN.tld}</b>
        </span>
        <span className="cmh-a cmh-dm-ok">
          <Check size={13} />
        </span>
      </div>
      <div className="cmh-dm-card">
        <div className="cmh-dm-head">
          <b>{DOMAIN_ROOT}</b>
          <span className="cmh-dm-pro">Pro</span>
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
        <div className="cmh-dm-foot">
          <span className="cmh-a cmh-dm-st" data-k={0}>
            <i />
            DNS checked
          </span>
          <span className="cmh-a cmh-dm-st" data-k={1}>
            <i />
            HTTPS on
          </span>
        </div>
      </div>
    </div>
  )
}

/* The grounds: a base colour and two soft gradient layers in its family, drifting and taking turns. */
const GROUNDS: Record<Ground, [string, string, string, string, string]> = {
  coral: ["#f6a483", "#ff5f5a", "#ffb067", "#ff8f70", "#ffd27a"],
  sea: ["#7fd0c3", "#2bb3a3", "#9be7c4", "#4fa8d8", "#c7f0d8"],
  sky: ["#9cc0fb", "#4f8df5", "#b6d6ff", "#7b9ff7", "#c9e7ff"],
  sun: ["#f7cf74", "#f5a524", "#ffe39a", "#f78f3f", "#fff0b8"],
  rose: ["#f6a6c3", "#f2689f", "#ffc6d9", "#f58db4", "#ffd9c4"],
  lime: ["#b4e08e", "#5cbf6a", "#d9f2a0", "#3fae8c", "#f0f7b3"],
}
const groundCss = () =>
  (Object.keys(GROUNDS) as Ground[])
    .map((g) => {
      const [c0, c1, c2, c3, c4] = GROUNDS[g]
      return `.cmh-stage[data-ground=${g}]{--c0:${c0};--c1:${c1};--c2:${c2};--c3:${c3};--c4:${c4}}`
    })
    .join("\n")

const HOW_CSS = `
.cmh{background:#fff;color:#18181b}
.cmh-wrap{max-width:1320px;margin:0 auto;padding:0 var(--landing-gutter,clamp(20px,5vw,72px))}
.cmh-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(16px,2vw,24px);row-gap:clamp(28px,3vw,40px)}
.cmh-tile{min-width:0}
.cmh-stage{position:relative;pointer-events:none;user-select:none;-webkit-user-select:none;height:clamp(380px,28vw,400px);border-radius:clamp(21px,2.4vw,27px);background:var(--c0,#f4f4f5);overflow:hidden;contain:paint;isolation:isolate;font-family:inherit}
${groundCss()}
.cmh-cap{margin:16px 4px 0;font-size:15.5px;line-height:1.55;color:#71717a;max-width:52ch;text-wrap:pretty}
.cmh-cap b{color:#18181b;font-weight:600}

/* Every loop is one of these, so going live restyles only the moving parts (a class, never * or a tag, in the rule keyed on data-commerce-live). */
.cmh-a{animation-duration:8s;animation-timing-function:cubic-bezier(.22,1,.36,1);animation-iteration-count:infinite;animation-fill-mode:both;animation-play-state:paused!important}
[data-commerce-live] .cmh-a{animation-play-state:running!important}
/* Stacked layers share one grid cell: the box is the size of the largest, before and after they swap. */
.cmh-stack{display:grid}
.cmh-stack>.cmh-a{grid-area:1/1}

/* The ground: two large soft layers, painted once, moved and faded on the compositor. */
.cmh-gl{position:absolute;z-index:-1;left:-30%;top:-30%;width:160%;height:160%;pointer-events:none}
.cmh-gl1{background:radial-gradient(38% 38% at 28% 30%,var(--c1),transparent 72%),radial-gradient(42% 40% at 74% 72%,var(--c2),transparent 72%);animation-name:cmh-drift1;animation-duration:16s;animation-timing-function:ease-in-out;animation-direction:alternate}
.cmh-gl2{background:radial-gradient(40% 40% at 72% 26%,var(--c3),transparent 72%),radial-gradient(40% 42% at 26% 76%,var(--c4),transparent 72%);opacity:.6;animation-name:cmh-drift2;animation-duration:13s;animation-timing-function:ease-in-out;animation-direction:alternate}
@keyframes cmh-drift1{0%{transform:translate3d(-4%,-3%,0) rotate(0deg) scale(1)}100%{transform:translate3d(5%,4%,0) rotate(24deg) scale(1.08)}}
@keyframes cmh-drift2{0%{opacity:.15;transform:translate3d(5%,3%,0) rotate(0deg)}100%{opacity:.95;transform:translate3d(-5%,-4%,0) rotate(-30deg)}}

.cmh-tap{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 0 0 1px rgba(255,255,255,.4);opacity:0;pointer-events:none;animation-name:cmh-tap;animation-timing-function:ease-out}
.cmh-tap-light{background:rgba(255,255,255,.4)}
@keyframes cmh-tap{0%,11%{opacity:0;transform:scale(.4)}14%{opacity:1;transform:scale(1)}19%,100%{opacity:0;transform:scale(1.7)}}

/* ── products: one card at a time ── */
.cmh-pr{position:absolute;inset:0;display:grid;place-items:center;padding:18px;box-sizing:border-box}
.cmh-pr .cmh-a{animation-duration:10s}
.cmh-pr-in{width:min(100%,340px)}
.cmh-pc{display:flex;gap:12px;align-items:center;padding:10px;border-radius:18px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.06),0 24px 48px -24px rgba(60,20,10,.45);box-sizing:border-box;animation-name:cmh-card0}
.cmh-pc[data-k="1"]{opacity:0;animation-name:cmh-card1}
@keyframes cmh-card0{0%,44%{opacity:1;transform:translate3d(0,0,0) scale(1)}49%,95%{opacity:0;transform:translate3d(0,-10px,0) scale(.98)}100%{opacity:1;transform:translate3d(0,0,0) scale(1)}}
@keyframes cmh-card1{0%,46%{opacity:0;transform:translate3d(0,10px,0) scale(.98)}51%,94%{opacity:1;transform:translate3d(0,0,0) scale(1)}99%,100%{opacity:0;transform:translate3d(0,-10px,0) scale(.98)}}
.cmh-pc-pic{flex:none;display:grid;place-items:center;width:44%;aspect-ratio:1;border-radius:12px;overflow:hidden;background:#f4f4f5}
.cmh-pc-pic>img{display:block;width:100%;height:100%;object-fit:cover;mix-blend-mode:multiply}
.cmh-pc-pic[data-kind=ebook]{background:#ececef}
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

/* ── OnePage + the real product sheet ── */
.cmh-op{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.cmh-op .cmh-a{animation-duration:8s}
/* The whole phone, so the page, the tap and the sheet's Check out are all in view. */
.cmh-ph{position:relative;height:calc(100% - 30px);aspect-ratio:200/412;padding:6px;border-radius:34px;background:#111113;box-shadow:0 30px 60px -24px rgba(10,40,40,.55),inset 0 0 0 1px rgba(255,255,255,.12);box-sizing:border-box}
.cmh-ph-scr{position:relative;height:100%;border-radius:28px;background:#1d1d1f;overflow:hidden;container-type:inline-size}
.cmh-ph-sb{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;justify-content:space-between;height:26px;padding:0 15px 0 19px;font-size:10px;color:#fff;background:#1d1d1f}
.cmh-ph-sb b{font-weight:600}
.cmh-ph-sb svg{width:28px;height:10px}
.cmh-ph-isl{width:52px;height:16px;border-radius:10px;background:#000}
.cmh-op-page{position:absolute;left:0;top:26px;display:block;width:100%;height:auto}
.cmh-op .cmh-tap{left:50%;top:calc(26px + 100cqw * 404 / 393);width:28px;height:28px;margin:-14px 0 0 -14px;animation-name:cmh-optap}
@keyframes cmh-optap{0%,24%{opacity:0;transform:scale(.4)}27%{opacity:1;transform:scale(1)}32%,100%{opacity:0;transform:scale(1.7)}}
.cmh-dim{position:absolute;inset:0;background:rgba(0,0,0,.45);opacity:0;animation-name:cmh-dim;animation-timing-function:ease}
@keyframes cmh-dim{0%,28%{opacity:0}36%,84%{opacity:1}92%,100%{opacity:0}}
.cmh-sheet{position:absolute;left:0;top:calc(26px + 100cqw * 68 / 393);display:block;width:100%;height:auto;transform:translate3d(0,105%,0);animation-name:cmh-sheet;animation-timing-function:cubic-bezier(.32,.72,0,1)}
@keyframes cmh-sheet{0%,28%{transform:translate3d(0,105%,0)}38%,82%{transform:translate3d(0,0,0)}92%,100%{transform:translate3d(0,105%,0)}}

/* ── files: the receipt ── */
.cmh-fl{position:absolute;inset:0;display:grid;place-items:center;padding:20px;box-sizing:border-box}
.cmh-ml{width:min(300px,100%);padding:16px 16px 18px;border-radius:17px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.06),0 24px 48px -24px rgba(20,40,90,.45);box-sizing:border-box;animation-name:cmh-mail}
@keyframes cmh-mail{0%{opacity:0;transform:translate3d(0,16px,0)}8%,90%{opacity:1;transform:none}97%,100%{opacity:0;transform:translate3d(0,-6px,0)}}
.cmh-ml-from{display:flex;align-items:center;gap:10px}
.cmh-ml-from img{width:32px;height:32px;flex:none;border-radius:50%;object-fit:cover}
.cmh-ml-from>span{flex:1;min-width:0}
.cmh-ml-from b{display:block;font-size:13px;font-weight:600}
.cmh-ml-from small{display:block;font-size:11.5px;color:#8b8b94}
.cmh-ml-now{align-self:flex-start;font-size:11px;color:#a1a1aa}
.cmh-ml-subj{margin-top:12px;padding-bottom:10px;border-bottom:1px solid #f0f0f2;font-size:12px;font-weight:600;color:#52525b}
.cmh-ml-h{display:block;margin-top:12px;font-size:16px;font-weight:600;letter-spacing:-.015em}
.cmh-ml p{margin:4px 0 0;font-size:12px;line-height:1.5;color:#52525b}
.cmh-ml-file{display:flex;align-items:center;gap:10px;margin-top:12px;padding:8px 10px 8px 8px;border-radius:11px;box-shadow:inset 0 0 0 1px #ececf0}
.cmh-ml-cover{width:30px;flex:none;border-radius:4px}
.cmh-ml-file>span{min-width:0}
.cmh-ml-file b{display:block;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-ml-file small{font-size:11px;color:#8b8b94}
.cmh-ml-get{position:relative;display:flex;align-items:center;justify-content:center;height:36px;margin-top:12px;border-radius:10px;background:#18181b;color:#fff;font-size:12.5px;font-weight:600;overflow:hidden}
.cmh-ml-get .cmh-tap{animation-name:cmh-tap2}
@keyframes cmh-tap2{0%,66%{opacity:0;transform:scale(.4)}69%{opacity:1;transform:scale(1)}75%,100%{opacity:0;transform:scale(2.2)}}

/* ── course player ── */
.cmh-cp{position:absolute;inset:0;display:grid;place-items:center;padding:18px;box-sizing:border-box}
.cmh-cp .cmh-a{animation-duration:10s;animation-timing-function:linear}
.cmh-cp-card{width:min(300px,100%);padding:8px 8px 6px;border-radius:17px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.06),0 24px 48px -24px rgba(90,60,10,.45);box-sizing:border-box}
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
.cmh-cp-pfill{position:absolute;inset:0;background:#18181b;transform-origin:0 50%;transform:scaleX(.286);animation-name:cmh-cpp;animation-timing-function:cubic-bezier(.22,1,.36,1)!important}
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
.cmh-tip-card{width:min(270px,100%);padding:14px;border-radius:19px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.06),0 24px 48px -24px rgba(90,20,50,.45);box-sizing:border-box}
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

/* ── your own domain ── */
.cmh-dm{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:20px;box-sizing:border-box;container-type:inline-size}
.cmh-dm .cmh-a{animation-duration:9s;animation-timing-function:cubic-bezier(.3,1.4,.5,1)}
.cmh-dm-pill{display:flex;align-items:center;gap:.45em;height:2.5em;padding:0 .7em 0 .9em;border-radius:99px;background:#fff;color:#3f3f46;font-size:min(20px,5.6cqw);font-weight:500;letter-spacing:-.025em;white-space:nowrap;box-shadow:0 1px 2px rgba(24,24,27,.06),0 20px 40px -18px rgba(20,70,30,.5)}
.cmh-dm-lock{flex:none;width:.62em;height:.72em;color:#16a34a}
.cmh-dm-addr b{font-weight:500;color:#7c3aed}
.cmh-dm-ok{display:grid;place-items:center;width:1.1em;height:1.1em;flex:none;border-radius:50%;color:#16a34a;box-shadow:inset 0 0 0 2px #16a34a;animation-name:cmh-dok}
@keyframes cmh-dok{0%,7%{opacity:0;transform:scale(.5)}12%,93%{opacity:1;transform:none}98%,100%{opacity:0;transform:scale(.5)}}
.cmh-dm-card{width:min(100%,320px);padding:12px 14px 12px;border-radius:18px;background:#fff;box-shadow:0 1px 2px rgba(24,24,27,.06),0 24px 48px -24px rgba(20,70,30,.45);box-sizing:border-box}
.cmh-dm-head{display:flex;align-items:center;justify-content:space-between;padding:2px 2px 10px;border-bottom:1px solid #f0f0f2}
.cmh-dm-head b{font-size:14px;font-weight:600;letter-spacing:-.015em}
.cmh-dm-pro{padding:2px 8px;border-radius:99px;background:#f4f4f5;font-size:10.5px;font-weight:600;color:#52525b}
.cmh-dm-rows{padding:2px 0}
.cmh-dm-row{display:flex;align-items:center;gap:8px;height:32px;font-size:11.5px;letter-spacing:-.01em}
.cmh-dm-row+.cmh-dm-row{border-top:1px solid #f4f4f5}
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
.cmh-dm-foot{display:flex;gap:6px;padding-top:10px;border-top:1px solid #f0f0f2}
.cmh-dm-st{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:99px;background:#f0fdf4;color:#166534;font-size:10.5px;font-weight:600;animation-name:cmh-st0}
.cmh-dm-st i{width:5px;height:5px;border-radius:50%;background:#16a34a}
.cmh-dm-st[data-k="1"]{animation-name:cmh-st1}
@keyframes cmh-st0{0%,55%{opacity:0;transform:translate3d(0,4px,0)}60%,93%{opacity:1;transform:none}98%,100%{opacity:0}}
@keyframes cmh-st1{0%,64%{opacity:0;transform:translate3d(0,4px,0)}69%,93%{opacity:1;transform:none}98%,100%{opacity:0}}

@media (max-width:1179px){
  .cmh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cmh-stage{height:400px}
}
@media (max-width:639px){
  .cmh-grid{grid-template-columns:1fr}
  .cmh-stage{height:380px}
}
@media (prefers-reduced-motion:reduce){
  .cmh-a{animation:none!important}
  .cmh-tap,.cmh-dim,.cmh-tip-pop{display:none}
  .cmh-pc[data-k="1"]{display:none}
  .cmh-pc-step:not([data-k="2"]){opacity:0}
}
`

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const HOW_IT_WORKS_STYLES: readonly SectionStyle[] = [
  { href: "w12-commerce-how", precedence: "default", css: HOW_CSS },
  { href: "w13-ebook-cover", precedence: "default", css: EBOOK_COVER_CSS },
]
