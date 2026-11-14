"use client"

/**
 * ===========================================================================
 *  HOW IT WORKS: FIVE TILES (home, section 8)
 * ===========================================================================
 * Light, neutral grounds, and in each one the product as it really looks:
 *
 *   products   two product cards from one shop: a tee (physical, printed by
 *              the seller's print partner when it is ordered) and an e-book
 *              (digital, sent the moment it is paid for), each with what the
 *              seller keeps and its latest order moving along
 *   checkout   a OnePage on a phone: a tap on the e-book, the product sheet
 *              slides up, Buy now, Payment complete, and it slides away
 *   files      the buyer's "Thanks for your purchase" email, the PDF in it
 *              and Get your files
 *   course     the course player: the lesson playing, the Lessons list with
 *              its "2 of 6 done" and the lesson ticked off as it ends
 *   tips       a tip card choosing an amount, sending it, and the tip landing
 *
 * Every loop is CSS keyframes on transform and opacity only, stacked layers
 * in fixed-size boxes (grid overlap, never absolute heights that change), so
 * nothing lays out while they play. They run only while their tile is on
 * screen and the tab is visible (data-commerce-live); reduced motion shows
 * each tile's finished frame, still.
 *
 * TRUE TO THE PRODUCT. Merch without stock is print on demand through a
 * print partner the seller connects (lib/physical/providers.ts). The sheet's
 * words are the OnePage product sheet's (components/onepage/product-sheet:
 * "Buy now · $19"), the email's are the purchase receipt's
 * (lib/notify/templates/catalog.ts PURCHASE_CONFIRMATION), the player's are
 * the course player's (components/courses/course-player.tsx: "Lessons",
 * "2 of 6 done", the round marks). What the seller keeps is after Storelib's
 * real fee (lib/payments/fees/calculate).
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import type { SectionStyle } from "./lazy-section"
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"
import { StoryHeading } from "../story-heading"
import { commerceProduct, commerceUsd } from "./commerce-kit"
import { EBOOK, EBOOK_COVER_CSS, EbookCover, EbookCoverStyle } from "./ebook-cover"

const IMG = "/home/commerce"
const HOW = "/home/how"

export const HOW_HEADING = "Sell what people love. We handle the rest."

/** One sale: Storelib's Free-plan fee, worked out by checkout's own function, and the print partner's cost for a printed piece. */
function sale(priceCents: number, baseCents: number) {
  const fee = calculateStorelibFee({ grossMinor: priceCents, currency: "USD", sellerPlan: "free" }).totalStorelibFeeMinor
  return { priceCents, baseCents, keepCents: priceCents - fee - baseCents }
}

/** Maya Ellis's shop: one printed tee, one e-book. The tee's cost is an example print partner price. */
export const HOW_PRODUCTS = [
  {
    id: "tee",
    kind: "Physical",
    name: "Heavyweight tee",
    how: "Printed when ordered",
    steps: ["New order #2041", "Printing", "Shipped to Austin, TX"],
    ...sale(3000, commerceProduct("tee").baseCents),
  },
  {
    id: "ebook",
    kind: "Digital",
    name: EBOOK.title,
    how: "Instant download",
    steps: ["New order #2042", "Paid $19.00", "Sent to sam@hey.com"],
    ...sale(EBOOK.priceCents, 0),
  },
] as const

const vars = (v: Record<string, string | number>) => v as CSSProperties

/**
 * Wave 13 perf: each tile runs its loops only while that tile is on screen
 * (data-commerce-live on the tile, which the CSS reads), not all five while
 * any part of the section is: on a phone the tiles stack 2,700px tall, and
 * every running loop is restyled on every frame of a scroll.
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
          <Tile wide caption={<><b>Sell physical and digital products.</b> Merch is printed and shipped by a print partner you connect as each order comes in, so there is no stock to hold. Files go out the moment someone pays.</>}>
            <ProductsScene />
          </Tile>
          <Tile tone="stone" caption={<><b>Checkout without leaving your page.</b> Tap a product on your OnePage and checkout slides up right there.</>}>
            <SheetScene />
          </Tile>
          <Tile caption={<><b>Files delivered for you.</b> Upload a file once. Every buyer gets it by email the moment they pay.</>}>
            <FilesScene />
          </Tile>
          <Tile tone="paper" caption={<><b>Build and sell a course.</b> Video lessons and files, with each student&apos;s progress saved as they go.</>}>
            <CourseScene />
          </Tile>
          <Tile tone="stone" caption={<><b>Take tips.</b> A thank-you button for the people who just want to support you.</>}>
            <TipScene />
          </Tile>
        </div>
      </div>
    </section>
  )
}

function Tile({ children, caption, wide = false, tone }: { children: ReactNode; caption: ReactNode; wide?: boolean; tone?: "stone" | "paper" }) {
  return (
    <article className="cmh-tile" data-wide={wide || undefined}>
      <div className="cmh-stage" data-tone={tone} aria-hidden="true">
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

/* 1. One shop, a printed tee and an e-book, each with its latest order moving along. */
function ProductsScene() {
  return (
    <div className="cmh-pr">
      {HOW_PRODUCTS.map((p, i) => (
        <div key={p.id} className="cmh-pc" style={vars({ "--o": `${i * -4.5}s` })}>
          <div className="cmh-pc-pic">{p.id === "tee" ? <img src={`${HOW}/tee-heather.webp`} alt="" width={480} height={480} loading="lazy" decoding="async" /> : <EbookCover className="cmh-pc-cover" />}</div>
          <div className="cmh-pc-b">
            <span className="cmh-pc-kind">
              <span className="cmh-pc-k">{p.kind} · </span>
              {p.how}
            </span>
            <span className="cmh-pc-row">
              <b className="cmh-pc-name">{p.name}</b>
              <b className="cmh-pc-price">{commerceUsd(p.priceCents, true)}</b>
            </span>
            <span className="cmh-pc-keep">You keep {commerceUsd(p.keepCents, true)}</span>
            <span className="cmh-stack cmh-pc-st">
              {p.steps.map((s, k) => (
                <span key={s} className="cmh-a cmh-pc-step" data-k={k}>
                  <i data-k={k} />
                  {s}
                </span>
              ))}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* 2. A OnePage on a phone: tap the e-book, the product sheet slides up, Buy now, paid. */
function SheetScene() {
  return (
    <div className="cmh-op">
      <div className="cmh-ph">
        <div className="cmh-ph-scr">
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
          <div className="cmh-op-page">
            <img className="cmh-op-av" src={`${IMG}/creator-maya.webp`} alt="" loading="lazy" decoding="async" width={160} height={160} />
            <div className="cmh-op-name">{EBOOK.author}</div>
            <div className="cmh-op-bio">Recipes for busy evenings</div>
            <div className="cmh-op-prod">
              <EbookCover className="cmh-op-cover" />
              <span className="cmh-op-row">
                <b>{EBOOK.title}</b>
                <small>E-book · $19</small>
              </span>
              <span className="cmh-a cmh-tap" />
            </div>
            <div className="cmh-op-link">Fresh Pasta at Home, the course</div>
            <div className="cmh-op-link">New recipes every Sunday</div>
          </div>
          <span className="cmh-a cmh-dim" />
          <div className="cmh-a cmh-sheet">
            <span className="cmh-grab" />
            <div className="cmh-stack">
              <div className="cmh-a cmh-sh-buy">
                <div className="cmh-sh-row">
                  <EbookCover className="cmh-sh-cover" />
                  <span>
                    <b>{EBOOK.title}</b>
                    <small>
                      PDF · {EBOOK.size}
                    </small>
                    <b className="cmh-sh-price">$19.00</b>
                  </span>
                </div>
                <div className="cmh-a cmh-sh-btn">
                  <span className="cmh-stack">
                    <span className="cmh-a cmh-sh-btn-a">Buy now · $19</span>
                    <span className="cmh-a cmh-sh-btn-b">
                      <span className="cmh-a cmh-spin" />
                    </span>
                  </span>
                </div>
              </div>
              <div className="cmh-a cmh-sh-done">
                <span className="cmh-sh-ok">
                  <Check size={20} />
                </span>
                <b>Payment complete</b>
                <small>We sent your receipt and your access to sam@hey.com</small>
              </div>
            </div>
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
          <img src={`${IMG}/creator-maya.webp`} alt="" loading="lazy" decoding="async" width={160} height={160} />
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
  { t: "Flour and eggs", d: "6:24" },
  { t: "Kneading by hand", d: "8:10" },
  { t: "Rolling and cutting", d: "9:02" },
  { t: "Filled pasta", d: "11:40" },
] as const

/* 4. The course player: a lesson plays, it is ticked off, the count moves on. */
function CourseScene() {
  return (
    <div className="cmh-cp">
      <div className="cmh-cp-card">
        <div className="cmh-cp-vid">
          <img src={`${HOW}/course-pasta.webp`} alt="" loading="lazy" decoding="async" width={640} height={360} />
          <span className="cmh-cp-bar">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
            </svg>
            <span className="cmh-cp-line">
              <span className="cmh-a cmh-cp-fill" />
            </span>
            <span>9:02</span>
          </span>
        </div>
        <div className="cmh-cp-head">
          <b>Lessons</b>
          <span className="cmh-stack cmh-cp-count">
            <span className="cmh-a cmh-cp-c1">2 of 6 done</span>
            <span className="cmh-a cmh-cp-c2">3 of 6 done</span>
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
          <img src={`${IMG}/creator-maya.webp`} alt="" loading="lazy" decoding="async" width={160} height={160} />
          <span>
            <b>Support Maya</b>
            <small>Say thanks for the free recipes</small>
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

const HOW_CSS = `
.cmh{background:#fff;color:#18181b}
.cmh-wrap{max-width:1320px;margin:0 auto;padding:0 var(--landing-gutter,clamp(20px,5vw,72px))}
.cmh-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:clamp(16px,2vw,24px)}
.cmh-tile{grid-column:span 2;min-width:0}
.cmh-tile[data-wide]{grid-column:span 4}
.cmh-stage{position:relative;height:clamp(340px,28vw,400px);border-radius:clamp(21px,2.4vw,27px);background:#f4f4f5;overflow:hidden;contain:paint;font-family:inherit}
.cmh-stage[data-tone=stone]{background:#efeeec}
.cmh-stage[data-tone=paper]{background:#f3f1ec}
.cmh-cap{margin:16px 4px 0;font-size:15.5px;line-height:1.55;color:#71717a;max-width:52ch;text-wrap:pretty}
.cmh-cap b{color:#18181b;font-weight:600}

/* Every loop is one of these, so going live restyles only the moving parts (a class, never * or a tag, in the rule keyed on data-commerce-live). */
.cmh-a{animation-duration:8s;animation-timing-function:cubic-bezier(.22,1,.36,1);animation-iteration-count:infinite;animation-fill-mode:both;animation-play-state:paused!important}
[data-commerce-live] .cmh-a{animation-play-state:running!important}
/* Stacked layers share one grid cell: the box is the size of the largest, before and after they swap. */
.cmh-stack{display:grid}
.cmh-stack>.cmh-a{grid-area:1/1}
.cmh-tap{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(24,24,27,.18);opacity:0;pointer-events:none}
.cmh-tap-light{background:rgba(255,255,255,.4)}

/* ── products ── */
.cmh-pr{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:clamp(14px,2vw,22px);padding:24px;box-sizing:border-box}
.cmh-pc{width:clamp(200px,17vw,250px);flex:none;padding:10px 10px 14px;border-radius:19px;background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.05),0 1px 2px rgba(24,24,27,.05),0 18px 40px -26px rgba(24,24,27,.28);box-sizing:border-box}
.cmh-pc-pic{aspect-ratio:1;border-radius:12px;overflow:hidden;background:#ececee}
.cmh-pc-pic>img{display:block;width:100%;height:100%;object-fit:cover}
.cmh-pc-cover{width:72%;margin:14% auto 0;border-radius:3px;box-shadow:0 1px 2px rgba(24,24,27,.12),0 14px 26px -14px rgba(24,24,27,.45)}
.cmh-pc-b{display:grid;gap:3px;padding:12px 4px 0}
.cmh-pc-kind{font-size:11.5px;color:#8b8b94}
.cmh-pc-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.cmh-pc-name{min-width:0;font-size:14.5px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-pc-price{flex:none;font-size:14.5px;font-weight:600;font-variant-numeric:tabular-nums}
.cmh-pc-keep{font-size:12px;color:#15803d;font-variant-numeric:tabular-nums}
.cmh-pc-st{margin-top:9px;padding-top:9px;border-top:1px solid #f0f0f2;font-size:12px;color:#52525b}
.cmh-pc-step{display:flex;align-items:center;gap:7px;white-space:nowrap;opacity:0;animation-name:cmh-st;animation-duration:9s;animation-delay:calc(var(--o) + var(--k) * 3s - 9s)}
.cmh-pc-step[data-k="0"]{--k:0;opacity:1}
.cmh-pc-step[data-k="1"]{--k:1}
.cmh-pc-step[data-k="2"]{--k:2}
.cmh-pc-step i{width:6px;height:6px;flex:none;border-radius:50%;background:#a1a1aa}
.cmh-pc-step i[data-k="1"]{background:#d97706}
.cmh-pc-step i[data-k="2"]{background:#16a34a}
@keyframes cmh-st{0%,28%{opacity:1;transform:none}32%{opacity:0;transform:translate3d(0,-4px,0)}32.5%,96%{opacity:0;transform:translate3d(0,4px,0)}100%{opacity:1;transform:none}}

/* ── OnePage + product sheet ── */
.cmh-op{position:absolute;inset:0;display:flex;justify-content:center}
.cmh-ph{position:absolute;top:30px;bottom:0;width:236px;padding:7px 7px 0;border-radius:40px 40px 0 0;background:#111113;box-shadow:0 24px 50px -24px rgba(24,24,27,.5),inset 0 0 0 1px rgba(255,255,255,.08);box-sizing:border-box}
.cmh-ph-scr{position:relative;height:100%;border-radius:33px 33px 0 0;background:#faf9f7;overflow:hidden}
.cmh-ph-sb{display:flex;align-items:center;justify-content:space-between;height:34px;padding:0 20px 0 24px;font-size:12px;color:#111}
.cmh-ph-sb b{font-weight:600}
.cmh-ph-isl{width:64px;height:20px;border-radius:12px;background:#111113}
.cmh-op-page{padding:6px 14px 0;text-align:center}
.cmh-op-av{display:block;width:54px;height:54px;margin:0 auto;border-radius:50%;object-fit:cover}
.cmh-op-name{margin-top:7px;font-size:15px;font-weight:650;letter-spacing:-.01em}
.cmh-op-bio{font-size:11.5px;color:#71717a}
.cmh-op-prod{position:relative;display:flex;align-items:center;gap:9px;margin-top:12px;padding:7px 10px 7px 7px;border-radius:13px;background:#fff;box-shadow:0 0 0 1px rgba(17,17,19,.06);text-align:left}
.cmh-op-cover{width:40px;flex:none;border-radius:7px}
.cmh-op-row{flex:1;min-width:0}
.cmh-op-row b{display:block;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-op-row small{font-size:11px;color:#71717a}
.cmh-op-link{margin-top:8px;height:36px;display:grid;place-items:center;border-radius:12px;background:#fff;box-shadow:0 0 0 1px rgba(17,17,19,.06);font-size:12px;font-weight:500}
.cmh-tap{animation-name:cmh-tap;animation-timing-function:ease-out}
.cmh-op-prod .cmh-tap{left:62%;top:50%}
@keyframes cmh-tap{0%,11%{opacity:0;transform:scale(.4)}14%{opacity:1;transform:scale(1)}19%,100%{opacity:0;transform:scale(1.7)}}
.cmh-dim{position:absolute;inset:0;background:rgba(10,10,12,.28);opacity:0;animation-name:cmh-dim;animation-timing-function:ease}
@keyframes cmh-dim{0%,15%{opacity:0}24%,84%{opacity:1}93%,100%{opacity:0}}
.cmh-sheet{position:absolute;left:0;right:0;bottom:0;padding:8px 14px 18px;border-radius:22px 22px 0 0;background:#fff;box-shadow:0 -10px 30px rgba(17,17,19,.16);transform:none;animation-name:cmh-sheet;animation-timing-function:cubic-bezier(.32,.72,0,1)}
@keyframes cmh-sheet{0%,15%{transform:translate3d(0,105%,0)}25%,84%{transform:none}94%,100%{transform:translate3d(0,105%,0)}}
.cmh-grab{display:block;width:36px;height:4px;border-radius:4px;background:#e4e4e7;margin:0 auto 12px}
.cmh-sh-buy{animation-name:cmh-buy;animation-timing-function:ease;opacity:0}
@keyframes cmh-buy{0%,52%{opacity:1;transform:none}57%,100%{opacity:0;transform:scale(.98)}}
.cmh-sh-row{display:flex;gap:11px;align-items:center}
.cmh-sh-cover{width:58px;flex:none;border-radius:8px}
.cmh-sh-row b{display:block;font-size:13px;font-weight:600;line-height:1.3}
.cmh-sh-row small{display:block;font-size:11.5px;color:#71717a;margin-top:1px}
.cmh-sh-row .cmh-sh-price{margin-top:5px;font-size:14px}
.cmh-sh-btn{margin-top:14px;height:42px;display:grid;place-items:center;border-radius:999px;background:#111113;color:#fff;font-size:13.5px;font-weight:600;animation-name:cmh-press;animation-timing-function:ease}
@keyframes cmh-press{0%,38%{transform:none}40.5%{transform:scale(.96)}44%,100%{transform:none}}
.cmh-sh-btn .cmh-stack{place-items:center}
.cmh-sh-btn-a{animation-name:cmh-ba;animation-timing-function:ease}
@keyframes cmh-ba{0%,41%{opacity:1}43%,100%{opacity:0}}
.cmh-sh-btn-b{opacity:0;animation-name:cmh-bb;animation-timing-function:ease}
@keyframes cmh-bb{0%,41%{opacity:0}43%,52%{opacity:1}55%,100%{opacity:0}}
.cmh-spin{display:block;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:cmh-spin .8s linear infinite}
@keyframes cmh-spin{to{transform:rotate(360deg)}}
.cmh-sh-done{display:grid;justify-items:center;align-content:center;gap:3px;text-align:center;animation-name:cmh-done;animation-timing-function:ease}
@keyframes cmh-done{0%,54%{opacity:0;transform:translate3d(0,6px,0)}59%,100%{opacity:1;transform:none}}
.cmh-sh-ok{display:grid;place-items:center;width:40px;height:40px;margin-bottom:6px;border-radius:50%;background:#dcfce7;color:#15803d}
.cmh-sh-done b{font-size:14px;font-weight:600}
.cmh-sh-done small{max-width:24ch;font-size:11.5px;line-height:1.4;color:#71717a}

/* ── files: the receipt ── */
.cmh-fl{position:absolute;inset:0;display:grid;place-items:center;padding:20px;box-sizing:border-box}
.cmh-ml{width:min(300px,100%);padding:16px 16px 18px;border-radius:17px;background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.05),0 1px 2px rgba(24,24,27,.05),0 18px 40px -26px rgba(24,24,27,.28);box-sizing:border-box;animation-name:cmh-mail}
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
.cmh-ml-cover{width:36px;flex:none;border-radius:5px}
.cmh-ml-file>span{min-width:0}
.cmh-ml-file b{display:block;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmh-ml-file small{font-size:11px;color:#8b8b94}
.cmh-ml-get{position:relative;display:flex;align-items:center;justify-content:center;height:36px;margin-top:12px;border-radius:10px;background:#18181b;color:#fff;font-size:12.5px;font-weight:600;overflow:hidden}
.cmh-ml-get .cmh-tap{animation-name:cmh-tap2}
@keyframes cmh-tap2{0%,66%{opacity:0;transform:scale(.4)}69%{opacity:1;transform:scale(1)}75%,100%{opacity:0;transform:scale(2.2)}}

/* ── course player ── */
.cmh-cp{position:absolute;inset:0;display:grid;place-items:center;padding:18px;box-sizing:border-box}
.cmh-cp .cmh-a{animation-duration:10s;animation-timing-function:linear}
.cmh-cp-card{width:min(300px,100%);padding:8px 8px 6px;border-radius:17px;background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.05),0 1px 2px rgba(24,24,27,.05),0 18px 40px -26px rgba(24,24,27,.28);box-sizing:border-box}
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
.cmh-cp-pfill{position:absolute;inset:0;background:#18181b;transform-origin:0 50%;transform:scaleX(.333);animation-name:cmh-cpp;animation-timing-function:cubic-bezier(.22,1,.36,1)!important}
@keyframes cmh-cpp{0%,63%{transform:scaleX(.333)}70%,96%{transform:scaleX(.5)}100%{transform:scaleX(.333)}}
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
.cmh-tip-card{width:min(270px,100%);padding:14px;border-radius:19px;background:#fff;box-shadow:0 0 0 1px rgba(24,24,27,.05),0 1px 2px rgba(24,24,27,.05),0 18px 40px -26px rgba(24,24,27,.28);box-sizing:border-box}
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

@media (max-width:1023px){
  .cmh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cmh-tile,.cmh-tile[data-wide]{grid-column:span 1}
  .cmh-tile[data-wide]{grid-column:1/-1}
}
@media (max-width:639px){
  .cmh-grid{grid-template-columns:1fr}
  .cmh-tile[data-wide]{grid-column:auto}
  .cmh-stage{height:380px}
  .cmh-pr{gap:10px;padding:14px}
  .cmh-pc{width:calc(50% - 5px);padding:7px 7px 11px;border-radius:15px}
  .cmh-pc-b{padding:10px 3px 0}
  .cmh-pc-k{display:none}
  .cmh-pc-row{display:grid;gap:1px}
  .cmh-pc-name,.cmh-pc-price{font-size:13.5px}
  .cmh-pc-st{font-size:11.5px}
  .cmh-pc-step{white-space:normal;align-items:flex-start;line-height:1.3}
  .cmh-pc-step i{margin-top:4px}
}
@media (prefers-reduced-motion:reduce){
  .cmh-a,.cmh-spin{animation:none!important}
  .cmh-tap,.cmh-dim,.cmh-tip-pop{display:none}
  .cmh-pc-step:not([data-k="0"]){opacity:0}
}
`

/** This section's stylesheets, as it draws them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const HOW_IT_WORKS_STYLES: readonly SectionStyle[] = [
  { href: "w12-commerce-how", precedence: "default", css: HOW_CSS },
  { href: "w13-ebook-cover", precedence: "default", css: EBOOK_COVER_CSS },
]
